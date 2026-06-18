import { useEffect, useMemo, useRef, useState } from 'react';
import { ControlPanel, Slider, SelectControl, ToggleControl } from '../../controls';
import type { SelectOption } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import { QUEUE_COLORS, withAlpha, roundRect, drawArrow, pill } from './cq2d';

// ─────────────────────────────────────────────────────────────────────────────
// 타임라인 세마포어 게이터
//
// 두 개의 큐(그래픽스/컴퓨트)가 각자 작업 블록을 순서대로 실행한다. 공유된
// "타임라인 세마포어"는 단조 증가하는 64비트 값을 갖는다. 어떤 그래픽스 블록은
// 끝날 때 그 값을 S로 "시그널"하고, 컴퓨트 큐의 C1 블록은 "값 ≥ W"가 될 때까지
// "대기"한다. 임계값에 도달하기 전이면 C1은 정지(스톨)한다 — 이게 큐↔큐
// happens-before 순서를 만든다.
//
// 시각(t)은 RAF 재생 또는 스크럽 슬라이더로 전진한다. 모든 블록 시각은 t와
// 무관한 순수 함수(useMemo)로 계산하므로, t는 단지 "지금 어디까지 보여줄지"만
// 결정한다(SSR 안전).
// ─────────────────────────────────────────────────────────────────────────────

type SignalerId = 'G0' | 'G1' | 'G2';

// 각 큐의 블록 정의(이름·기간). 시작 시각은 스케줄 단계에서 계산.
interface BlockDef {
  id: string;
  label: string;
  dur: number;
}

const GFX_BLOCKS: BlockDef[] = [
  { id: 'G0', label: 'G0', dur: 1.4 },
  { id: 'G1', label: 'G1', dur: 1.6 },
  { id: 'G2', label: 'G2', dur: 1.2 },
];

const CMP_BLOCKS: BlockDef[] = [
  { id: 'C0', label: 'C0', dur: 1.0 },
  { id: 'C1', label: 'C1', dur: 1.6 },
];

// 스케줄 결과: 배치된 블록 + 시그널/대기 이벤트.
interface ScheduledBlock {
  id: string;
  label: string;
  start: number;
  end: number;
  /** 이 블록이 끝날 때 타임라인 값을 이 값으로 올린다(시그널 블록만). */
  signalValue?: number;
  /** 정지(스톨) 구간 [naturalStart, start). 길이>0이면 게이트로 인한 idle. */
  stallFrom?: number;
}

interface Schedule {
  gfx: ScheduledBlock[];
  cmp: ScheduledBlock[];
  /** 시그널 이벤트: 시각 t에서 값이 value로 오른다. */
  signalEvents: { t: number; value: number; blockId: string }[];
  /** C1 의존성이 만족되어 그려진 게이트 에지(있을 때). */
  edge: { fromX: number; fromBlock: string; toBlock: string } | null;
  /** C1이 실제로 대기한 시각(스톨>0)인지. */
  c1Stalled: boolean;
  /** C1 대기를 만족시킨 타임라인 값에 도달한 시각(없으면 null). */
  thresholdMetAt: number | null;
}

const TIMELINE_END = 6.4; // 시각 축의 최댓값(스크럽 범위)
const C1_NATURAL_GAP = 0.3; // C0 종료 후 C1이 자연스럽게 시작하려는 간격

/**
 * 시그널러/임계값에 따라 두 큐를 스케줄한다.
 * - 그래픽스 큐: 블록들을 끊김 없이 순서대로 배치.
 * - 시그널러 블록은 끝날 때 타임라인 값을 signalValue로 올림.
 * - 컴퓨트 큐: C0는 0에서 시작, C1은 (C0끝+간격)에서 시작하려 하지만,
 *   그 시점의 타임라인 값 < W 이면 값 ≥ W 가 되는 시각까지 정지(스톨).
 */
function buildSchedule(signaler: SignalerId, signalValue: number, waitW: number): Schedule {
  // 그래픽스 큐를 순서대로 배치.
  const gfx: ScheduledBlock[] = [];
  let gt = 0;
  for (const b of GFX_BLOCKS) {
    const start = gt;
    const end = gt + b.dur;
    const isSignaler = b.id === signaler;
    gfx.push({
      id: b.id,
      label: b.label,
      start,
      end,
      signalValue: isSignaler ? signalValue : undefined,
    });
    gt = end;
  }

  // 시그널 이벤트(시각순). 타임라인 값은 각 시그널러가 끝나는 시각에 오른다.
  const signalEvents = gfx
    .filter((b) => b.signalValue !== undefined)
    .map((b) => ({ t: b.end, value: b.signalValue as number, blockId: b.id }))
    .sort((a, b) => a.t - b.t);

  // 시각 t에서의 타임라인 값(그 시각까지 완료된 시그널 중 최댓값, 0부터).
  const valueAt = (t: number): number => {
    let v = 0;
    for (const ev of signalEvents) {
      if (ev.t <= t + 1e-9) v = Math.max(v, ev.value);
    }
    return v;
  };

  // C0 배치.
  const c0 = CMP_BLOCKS[0];
  const c0Start = 0;
  const c0End = c0Start + c0.dur;

  // C1의 자연 시작(큐 순서가 허용하는 가장 이른 시각).
  const c1 = CMP_BLOCKS[1];
  const naturalStart = c0End + C1_NATURAL_GAP;

  // C1은 "값 ≥ W"를 기다린다. 자연 시작 시점에 이미 만족하면 그대로,
  // 아니면 값 ≥ W 가 되는 가장 이른 시각까지 정지.
  let thresholdMetAt: number | null = null;
  if (waitW <= 0) {
    thresholdMetAt = 0; // 대기 없음 — 항상 만족
  } else {
    for (const ev of signalEvents) {
      if (ev.value >= waitW) {
        thresholdMetAt = ev.t;
        break;
      }
    }
  }

  let c1Start = naturalStart;
  let c1StallFrom: number | undefined;
  let c1Stalled = false;
  if (waitW > 0) {
    const valAtNatural = valueAt(naturalStart);
    if (valAtNatural < waitW) {
      // 임계값에 도달하는 시각까지 정지. 영영 도달 못 하면 끝까지 정지.
      const releaseAt = thresholdMetAt ?? TIMELINE_END;
      if (releaseAt > naturalStart) {
        c1Start = releaseAt;
        c1StallFrom = naturalStart;
        c1Stalled = true;
      }
    }
  }
  const c1End = c1Start + c1.dur;

  // 게이트 에지: 시그널러 블록의 끝 → C1 시작. 임계값이 그 시그널로 만족될 때만.
  let edge: Schedule['edge'] = null;
  if (waitW > 0 && signalValue >= waitW) {
    const sBlock = gfx.find((b) => b.id === signaler);
    if (sBlock) {
      edge = { fromX: sBlock.end, fromBlock: sBlock.id, toBlock: 'C1' };
    }
  }

  const cmp: ScheduledBlock[] = [
    { id: c0.id, label: c0.label, start: c0Start, end: c0End },
    {
      id: c1.id,
      label: c1.label,
      start: c1Start,
      end: c1End,
      stallFrom: c1StallFrom,
    },
  ];

  return { gfx, cmp, signalEvents, edge, c1Stalled, thresholdMetAt };
}

// 레이아웃 상수(CSS 픽셀).
const PAD_L = 16;
const PAD_R = 16;
const LANE_GFX_Y = 70;
const LANE_CMP_Y = 150;
const LANE_H = 40;
const AXIS_Y = 220;
const VALUE_BOX_Y = 248;

const signalerOptions: ReadonlyArray<SelectOption<SignalerId>> = [
  { value: 'G0', label: 'G0가 시그널' },
  { value: 'G1', label: 'G1가 시그널' },
  { value: 'G2', label: 'G2가 시그널' },
];

const signalValOptions: ReadonlyArray<SelectOption<string>> = [
  { value: '1', label: '값 = 1' },
  { value: '2', label: '값 = 2' },
  { value: '3', label: '값 = 3' },
];

export default function TimelineSemaphoreGater() {
  const [signaler, setSignaler] = useState<SignalerId>('G1');
  const [signalValue, setSignalValue] = useState(2);
  const [waitW, setWaitW] = useState(2);
  const [t, setT] = useState(TIMELINE_END); // 현재 시각(스크럽)
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // RAF: t를 자동 전진. playing/speed는 ref로 읽어 effect 재구독 최소화.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      lastTsRef.current = null;
      return;
    }
    // 재생 시작 시 끝에 있으면 처음부터.
    setT((cur) => (cur >= TIMELINE_END - 1e-3 ? 0 : cur));

    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      setT((cur) => {
        const next = cur + dt * speedRef.current;
        if (next >= TIMELINE_END) {
          setPlaying(false);
          return TIMELINE_END;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [playing]);

  const sched = useMemo(
    () => buildSchedule(signaler, signalValue, waitW),
    [signaler, signalValue, waitW],
  );

  // 현재 시각의 타임라인 값.
  const currentValue = useMemo(() => {
    let v = 0;
    for (const ev of sched.signalEvents) if (ev.t <= t + 1e-9) v = Math.max(v, ev.value);
    return v;
  }, [sched, t]);

  // C1의 현재 상태(읽기용).
  const c1 = sched.cmp[1];
  const c1State: 'waiting' | 'running' | 'done' | 'pending' = useMemo(() => {
    if (t < (c1.stallFrom ?? c1.start)) return 'pending'; // 아직 큐 차례 전
    if (t < c1.start) return 'waiting'; // 스톨 중
    if (t < c1.end) return 'running';
    return 'done';
  }, [t, c1]);

  // 정합성: W=0이면 순서 보장 없음 → 위험. W≤시그널값이면 G→C1 순서 성립.
  const orderingOk = waitW > 0 && signalValue >= waitW;

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const x0 = PAD_L;
    const x1 = w - PAD_R;
    const innerW = x1 - x0;
    const toX = (time: number) => x0 + (time / TIMELINE_END) * innerW;

    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    // 레인 라벨.
    ctx.font = '11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = QUEUE_COLORS.graphics;
    ctx.fillText('그래픽스 큐', x0, LANE_GFX_Y - LANE_H / 2 - 12);
    ctx.fillStyle = QUEUE_COLORS.compute;
    ctx.fillText('컴퓨트 큐', x0, LANE_CMP_Y - LANE_H / 2 - 12);

    // 레인 배경 트랙.
    for (const ly of [LANE_GFX_Y, LANE_CMP_Y]) {
      ctx.fillStyle = withAlpha(theme.border, 0.5);
      roundRect(ctx, x0, ly - LANE_H / 2, innerW, LANE_H, 6);
      ctx.fill();
    }

    // 현재 시각 이전만 "실행된" 것으로 채운다(진행을 드러냄).
    const drawBlock = (b: ScheduledBlock, laneY: number, color: string) => {
      const bx0 = toX(b.start);
      const bx1 = toX(b.end);
      const bw = Math.max(2, bx1 - bx0);
      const by = laneY - LANE_H / 2 + 4;
      const bh = LANE_H - 8;

      // 진행률(현재 t 기준 채움 비율).
      const prog = Math.max(0, Math.min(1, (t - b.start) / Math.max(1e-6, b.end - b.start)));

      // 외곽(예정).
      roundRect(ctx, bx0, by, bw, bh, 5);
      ctx.fillStyle = withAlpha(color, 0.18);
      ctx.fill();
      ctx.strokeStyle = withAlpha(color, 0.7);
      ctx.lineWidth = 1;
      ctx.stroke();

      // 실행된 부분.
      if (prog > 0) {
        ctx.save();
        roundRect(ctx, bx0, by, bw, bh, 5);
        ctx.clip();
        ctx.fillStyle = color;
        ctx.fillRect(bx0, by, bw * prog, bh);
        ctx.restore();
      }

      // 라벨.
      ctx.fillStyle = prog > 0.12 ? '#ffffff' : theme.text;
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, (bx0 + bx1) / 2, laneY);
      ctx.textAlign = 'start';

      // 시그널 마커(블록 끝).
      if (b.signalValue !== undefined) {
        const sx = bx1;
        const fired = t >= b.end - 1e-9;
        ctx.beginPath();
        ctx.arc(sx, by - 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = fired ? QUEUE_COLORS.ok : theme.muted;
        ctx.fill();
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = fired ? QUEUE_COLORS.ok : theme.muted;
        ctx.textAlign = 'center';
        ctx.fillText(`signal ${b.signalValue}`, sx, by - 12);
        ctx.textAlign = 'start';
      }
    };

    // 스톨(정지) 구간을 주황 해치로 먼저 그림.
    if (c1.stallFrom !== undefined && c1.start > c1.stallFrom) {
      const sx0 = toX(c1.stallFrom);
      const sx1 = toX(c1.start);
      const sy = LANE_CMP_Y - LANE_H / 2 + 4;
      const sh = LANE_H - 8;
      ctx.save();
      roundRect(ctx, sx0, sy, sx1 - sx0, sh, 5);
      ctx.clip();
      ctx.fillStyle = withAlpha(QUEUE_COLORS.stall, 0.18);
      ctx.fillRect(sx0, sy, sx1 - sx0, sh);
      ctx.strokeStyle = withAlpha(QUEUE_COLORS.stall, 0.6);
      ctx.lineWidth = 1;
      for (let xx = sx0 - sh; xx < sx1; xx += 7) {
        ctx.beginPath();
        ctx.moveTo(xx, sy + sh);
        ctx.lineTo(xx + sh, sy);
        ctx.stroke();
      }
      ctx.restore();
      // "대기" 라벨.
      ctx.fillStyle = QUEUE_COLORS.stall;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('대기(스톨)', (sx0 + sx1) / 2, LANE_CMP_Y);
      ctx.textAlign = 'start';
    }

    // 블록들.
    for (const b of sched.gfx) drawBlock(b, LANE_GFX_Y, QUEUE_COLORS.graphics);
    for (const b of sched.cmp) drawBlock(b, LANE_CMP_Y, QUEUE_COLORS.compute);

    // happens-before 에지: 시그널러 끝 → C1 시작(점선 화살표).
    if (sched.edge) {
      const fx = toX(sched.edge.fromX);
      const fy = LANE_GFX_Y + LANE_H / 2 - 4;
      const tx = toX(c1.start);
      const ty = LANE_CMP_Y - LANE_H / 2 + 2;
      drawArrow(ctx, fx, fy, tx, ty, QUEUE_COLORS.ok, { dashed: true, width: 1.5, head: 7 });
    }

    // 시각 축 + 현재 시각 헤드.
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, AXIS_Y);
    ctx.lineTo(x1, AXIS_Y);
    ctx.stroke();
    for (let tk = 0; tk <= TIMELINE_END; tk += 1) {
      const tx = toX(tk);
      ctx.beginPath();
      ctx.moveTo(tx, AXIS_Y - 3);
      ctx.lineTo(tx, AXIS_Y + 3);
      ctx.strokeStyle = theme.muted;
      ctx.stroke();
    }
    // "지금" 세로선(두 레인 가로질러).
    const nowX = toX(t);
    ctx.strokeStyle = withAlpha(theme.accent, 0.9);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(nowX, LANE_GFX_Y - LANE_H / 2 - 6);
    ctx.lineTo(nowX, AXIS_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    // 헤드 삼각형(드래그 핸들 힌트).
    ctx.beginPath();
    ctx.moveTo(nowX, AXIS_Y);
    ctx.lineTo(nowX - 5, AXIS_Y + 8);
    ctx.lineTo(nowX + 5, AXIS_Y + 8);
    ctx.closePath();
    ctx.fillStyle = theme.accent;
    ctx.fill();

    // 타임라인 값 카운터(큰 단조 숫자) + 틱.
    ctx.fillStyle = theme.text;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('타임라인 세마포어 값', x0, VALUE_BOX_Y);
    // 틱 마크(0..3).
    const tickX0 = x0 + 160;
    for (let vv = 0; vv <= 3; vv++) {
      const tx = tickX0 + vv * 26;
      const on = vv <= currentValue;
      ctx.beginPath();
      ctx.arc(tx, VALUE_BOX_Y, 5, 0, Math.PI * 2);
      ctx.fillStyle = on ? QUEUE_COLORS.ok : withAlpha(theme.muted, 0.4);
      ctx.fill();
      ctx.fillStyle = theme.muted;
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${vv}`, tx, VALUE_BOX_Y + 14);
      ctx.textAlign = 'start';
    }
    // 큰 현재값.
    ctx.font = 'bold 22px ui-monospace, monospace';
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'right';
    ctx.fillText(`v = ${currentValue}`, x1, VALUE_BOX_Y);
    ctx.textAlign = 'start';

    // C1 대기 임계값 표시(현재값 옆 작은 알약).
    if (waitW > 0) {
      pill(
        ctx,
        tickX0 + 3 * 26 + 60,
        VALUE_BOX_Y,
        `C1: wait ≥ ${waitW}`,
        withAlpha(currentValue >= waitW ? QUEUE_COLORS.ok : QUEUE_COLORS.stall, 0.9),
        '#ffffff',
        '10px ui-monospace, monospace',
      );
    }

    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, [sched, t, currentValue, waitW]);

  // 스크럽: 캔버스 어디서든 드래그하면 x 위치를 t로 변환.
  usePointerDrag(ref, {
    onDown: (e, canvas) => {
      setPlaying(false);
      scrubTo(e, canvas);
    },
    onMove: (e, canvas) => scrubTo(e, canvas),
  });

  function scrubTo(e: PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const x0 = PAD_L;
    const innerW = rect.width - PAD_L - PAD_R;
    const frac = Math.max(0, Math.min(1, (x - x0) / innerW));
    setT(frac * TIMELINE_END);
  }

  // 읽기용 텍스트.
  const c1ReadText = (() => {
    if (c1State === 'pending') return '아직 큐 차례 전';
    if (c1State === 'waiting') return `대기 중 (값 ${waitW} 필요, 현재 ${currentValue})`;
    if (c1State === 'running') return '실행 중';
    return '완료';
  })();

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 300, touchAction: 'none', display: 'block', cursor: 'ew-resize' }}
      />
      <ControlPanel>
        <Slider
          label="C1의 대기 임계값 W"
          value={waitW}
          min={0}
          max={3}
          step={1}
          onChange={(v) => setWaitW(Math.round(v))}
          format={(v) => (v <= 0 ? '0 (대기 없음)' : `≥ ${Math.round(v)}`)}
        />
        <SelectControl
          label="시그널 블록"
          value={signaler}
          options={signalerOptions}
          onChange={setSignaler}
        />
        <SelectControl
          label="시그널 값 S"
          value={String(signalValue)}
          options={signalValOptions}
          onChange={(v) => setSignalValue(Number(v))}
        />
        <ToggleControl label="재생" checked={playing} onChange={setPlaying} />
        <Slider
          label="속도"
          value={speed}
          min={0.25}
          max={3}
          step={0.25}
          onChange={setSpeed}
          unit="x"
        />
        <Slider
          label="시각(t)"
          value={t}
          min={0}
          max={TIMELINE_END}
          step={0.02}
          onChange={(v) => {
            setPlaying(false);
            setT(v);
          }}
          format={(v) => v.toFixed(2)}
        />
      </ControlPanel>
      <div
        style={{
          marginTop: '0.6rem',
          fontSize: '0.85rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--muted)',
          lineHeight: 1.6,
        }}
      >
        타임라인 값 v = {currentValue} &nbsp;|&nbsp; C1: {c1ReadText}
        <br />
        {orderingOk ? (
          <span style={{ color: QUEUE_COLORS.ok }}>
            순서 보장됨: {signaler} → C1 (happens-before 성립)
          </span>
        ) : (
          <span style={{ color: QUEUE_COLORS.bad }}>
            순서 보장 없음: {signaler} 결과가 준비되기 전에 C1이 읽을 수 있음 → 위험
          </span>
        )}
        {sched.c1Stalled && (
          <>
            {' '}
            <span style={{ color: QUEUE_COLORS.stall }}>
              · 스톨 = 의존성이 사들인 GPU 유휴 시간
            </span>
          </>
        )}
      </div>
      <figcaption>
        세마포어는 <strong>큐와 큐 사이</strong>(또는 큐↔표시)를 동기화합니다 — CPU와 GPU를 잇는
        펜스와는 다릅니다. 타임라인 세마포어는 단조 증가하는 값을 들고, 어떤 작업이 “끝나면 값을 v로
        시그널”하고 다른 작업이 “값 ≥ v가 될 때까지 대기”합니다. P가 v를 시그널하고 Q가 ≥v를
        기다리면 <em>P가 Q보다 먼저 일어남(happens-before)</em>이 보장됩니다. 이진 세마포어는 값이
        0/1뿐인 특수한 경우일 뿐입니다.
        <br />
        <strong>직접 해보세요:</strong> W=0으로 두면 C1이 큐가 허락하는 만큼 일찍 실행돼{' '}
        <em>G1 결과를 준비되기도 전에 읽는</em> 해저드가 생깁니다(위 빨간 경고). W를 2로 올리면
        C1이 G1이 끝날 때까지 <em>대기</em>하는 게 보이고(주황 스톨 구간 = 동기화 비용), 초록 점선
        화살표가 G1→C1 순서를 표시합니다. 시각 막대(▲)를 좌우로 끌거나 “재생”으로 시간을
        흘려보내며 값이 차오르는 순간을 지켜보세요.
      </figcaption>
    </figure>
  );
}
