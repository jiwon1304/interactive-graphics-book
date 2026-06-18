import { useMemo, useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import { QUEUE_COLORS, pointerToCanvas, roundRect, withAlpha, drawArrow } from './cq2d';

// ---------------------------------------------------------------------------
// 모델: 멀티 큐 비동기 컴퓨트 오버랩과 그 동기화 비용
//
// 서로 독립적인 작업을 별도 큐(그래픽스 + 비동기 컴퓨트)에 올리면 GPU에서
// 동시에(concurrently) 돌아 지연을 숨긴다(idle ALU를 메움).
//   - 같은 큐 안: FIFO로 직렬 실행.
//   - 다른 큐끼리: 동시에 실행.
//   - 교차 큐 의존: 세마포어(semaphore)가 필요하고, 그 대기는 스톨(stall)을 만든다.
//
// 오버랩 절감 = (모두 직렬일 때 시간) − (오버랩 스케줄의 makespan)
// 동기화 비용 = 의존이 강제한 스톨.
// ---------------------------------------------------------------------------

type Queue = 'graphics' | 'compute';

interface Pass {
  id: string;
  label: string;
  /** 기본 큐 배정(리셋용) */
  defaultQueue: Queue;
  /** 기본 길이(ms). 일부는 슬라이더로 조절. */
  baseDur: number;
}

// 5개 패스. C-SSAO와 G-Lighting 길이는 슬라이더로 조절(아래).
const PASSES: ReadonlyArray<Pass> = [
  { id: 'shadow', label: 'G-Shadow', defaultQueue: 'graphics', baseDur: 3 },
  { id: 'gbuffer', label: 'G-GBuffer', defaultQueue: 'graphics', baseDur: 4 },
  { id: 'ssao', label: 'C-SSAO', defaultQueue: 'compute', baseDur: 4 },
  { id: 'particles', label: 'C-Particles', defaultQueue: 'compute', baseDur: 3 },
  { id: 'lighting', label: 'G-Lighting', defaultQueue: 'graphics', baseDur: 4 },
] as const;

// 교차 큐 의존: G-Lighting은 C-SSAO 결과(앰비언트 오클루전)가 필요.
const DEP_FROM = 'ssao';
const DEP_TO = 'lighting';

interface Scheduled {
  pass: Pass;
  queue: Queue;
  dur: number;
  start: number;
  end: number;
}

interface Schedule {
  items: Scheduled[];
  makespan: number;
  serial: number; // 모두 한 큐에 직렬로 둘 때 = 모든 길이 합
  /** 의존이 강제한 스톨(ms). DEP_TO가 의존 때문에 더 늦게 시작한 양. */
  stall: number;
  /** DEP_FROM 종료 시각(세마포어 신호 시각). 의존 화살표용. */
  depSignalT: number;
  /** DEP_TO가 (의존 없이) 자기 큐 FIFO상 시작 가능했던 시각. */
  depReadyT: number;
}

/**
 * 작은 리스트 스케줄러.
 * - 각 큐 안에서 PASSES의 등장 순서대로(FIFO) 직렬 배치.
 * - 패스의 시작 = max(자기 큐의 직전 패스 종료, 교차 큐 의존이 있으면 그 신호 시각).
 * - 의존이 켜져 있고 DEP_FROM/DEP_TO가 서로 다른 큐일 때만 세마포어 적용.
 */
function schedule(
  queues: Record<string, Queue>,
  durs: Record<string, number>,
  depOn: boolean,
): Schedule {
  // 큐별 "현재까지 채워진 시각"
  const queueEnd: Record<Queue, number> = { graphics: 0, compute: 0 };
  const endById: Record<string, number> = {};
  const items: Scheduled[] = [];

  let stall = 0;
  let depSignalT = 0;
  let depReadyT = 0;

  for (const pass of PASSES) {
    const q = queues[pass.id];
    const dur = durs[pass.id];
    const fifoStart = queueEnd[q]; // 같은 큐 직전 패스 종료
    let start = fifoStart;

    // 교차 큐 의존(세마포어): DEP_TO는 DEP_FROM 종료까지 기다림.
    const depActive =
      depOn && pass.id === DEP_TO && queues[DEP_FROM] !== queues[DEP_TO];
    if (depActive) {
      const signal = endById[DEP_FROM] ?? 0;
      depSignalT = signal;
      depReadyT = fifoStart;
      if (signal > fifoStart) {
        stall = signal - fifoStart; // 의존이 강제한 추가 대기 = 스톨
        start = signal;
      }
    }

    const end = start + dur;
    queueEnd[q] = end;
    endById[pass.id] = end;
    items.push({ pass, queue: q, dur, start, end });
  }

  const makespan = Math.max(queueEnd.graphics, queueEnd.compute);
  const serial = PASSES.reduce((s, p) => s + durs[p.id], 0);
  return { items, makespan, serial, stall, depSignalT, depReadyT };
}

const CANVAS_H = 320;

/**
 * 비동기 오버랩 타임라인 위젯.
 * 패스 블록을 탭하면 큐(그래픽스↔컴퓨트)가 토글되고, 스케줄러가
 * makespan·오버랩 절감·세마포어 스톨을 다시 계산해 간트 차트로 보여준다.
 */
export default function AsyncOverlapTimeline() {
  // 패스별 큐 배정(탭으로 토글). 기본값에서 시작.
  const [queues, setQueues] = useState<Record<string, Queue>>(() => {
    const q: Record<string, Queue> = {};
    for (const p of PASSES) q[p.id] = p.defaultQueue;
    return q;
  });
  const [ssaoDur, setSsaoDur] = useState(4);
  const [lightingDur, setLightingDur] = useState(4);
  const [depOn, setDepOn] = useState(false);

  // 블록 히트테스트용 사각형들을 ref에 저장(그리기 ↔ 탭 공유).
  const hitRef = useRef<Array<{ id: string; x: number; y: number; w: number; h: number }>>(
    [],
  );

  const durs = useMemo<Record<string, number>>(() => {
    const d: Record<string, number> = {};
    for (const p of PASSES) d[p.id] = p.baseDur;
    d.ssao = ssaoDur;
    d.lighting = lightingDur;
    return d;
  }, [ssaoDur, lightingDur]);

  const sched = useMemo(() => schedule(queues, durs, depOn), [queues, durs, depOn]);

  const flipQueue = (id: string): void => {
    setQueues((q) => ({ ...q, [id]: q[id] === 'graphics' ? 'compute' : 'graphics' }));
  };

  const reset = (): void => {
    const q: Record<string, Queue> = {};
    for (const p of PASSES) q[p.id] = p.defaultQueue;
    setQueues(q);
    setSsaoDur(4);
    setLightingDur(4);
    setDepOn(false);
  };

  const savings = sched.serial - sched.makespan;
  const savingsPct = sched.serial > 0 ? (savings / sched.serial) * 100 : 0;

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 14;
    const labelW = 78; // 레인 라벨 폭
    const plotX = padX + labelW;
    const plotW = w - plotX - padX;

    // 시간 축 스케일: 직렬 기준선과 makespan 중 큰 값을 다 담도록.
    const tMax = Math.max(sched.serial, sched.makespan, 1);
    const xOf = (t: number): number => plotX + (t / tMax) * plotW;
    const wOf = (dt: number): number => (dt / tMax) * plotW;

    const top = 30;
    const serialY = top; // 직렬 기준선 바
    const serialH = 22;
    const laneGap = 16;
    const laneH = 46;
    const gfxY = serialY + serialH + 26;
    const cmpY = gfxY + laneH + laneGap;

    // --- 직렬 기준선(faded) ---
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.muted;
    ctx.textBaseline = 'middle';
    ctx.fillText('직렬 기준선', plotX - 8, serialY + serialH / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    {
      let x = plotX;
      for (const p of PASSES) {
        const bw = wOf(durs[p.id]);
        roundRect(ctx, x + 1, serialY, Math.max(2, bw - 2), serialH, 4);
        ctx.fillStyle = withAlpha(
          p.defaultQueue === 'graphics' ? QUEUE_COLORS.graphics : QUEUE_COLORS.compute,
          0.22,
        );
        ctx.fill();
        ctx.strokeStyle = withAlpha(theme.muted, 0.4);
        ctx.lineWidth = 1;
        ctx.stroke();
        x += bw;
      }
      // 직렬 끝 마커
      ctx.strokeStyle = withAlpha(theme.muted, 0.5);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(xOf(sched.serial), serialY - 4);
      ctx.lineTo(xOf(sched.serial), cmpY + laneH + 6);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- 두 레인(그래픽스/컴퓨트) ---
    const lanes: Array<{ y: number; queue: Queue; label: string; color: string }> = [
      { y: gfxY, queue: 'graphics', label: '그래픽스 큐', color: QUEUE_COLORS.graphics },
      { y: cmpY, queue: 'compute', label: '컴퓨트 큐', color: QUEUE_COLORS.compute },
    ];

    const hits: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];

    for (const lane of lanes) {
      // 레인 배경 + 라벨
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = lane.color;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(lane.label, plotX - 8, lane.y + laneH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      roundRect(ctx, plotX, lane.y, plotW, laneH, 8);
      ctx.fillStyle = withAlpha(theme.border, 0.3);
      ctx.fill();
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 스톨 갭(주황) — DEP_TO 레인에서 ready→start 사이.
    if (depOn && sched.stall > 0) {
      const target = sched.items.find((it) => it.pass.id === DEP_TO);
      if (target) {
        const lane = lanes.find((l) => l.queue === target.queue);
        if (lane) {
          const sx = xOf(sched.depReadyT);
          const sw = wOf(sched.stall);
          roundRect(ctx, sx, lane.y + 6, Math.max(2, sw), laneH - 12, 4);
          ctx.fillStyle = withAlpha(QUEUE_COLORS.stall, 0.4);
          ctx.fill();
          ctx.strokeStyle = QUEUE_COLORS.stall;
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = '9px ui-monospace, monospace';
          ctx.fillStyle = QUEUE_COLORS.stall;
          ctx.textAlign = 'center';
          ctx.fillText('스톨', sx + Math.max(2, sw) / 2, lane.y + laneH / 2 + 3);
          ctx.textAlign = 'left';
        }
      }
    }

    // 패스 블록(간트). 탭 히트박스 기록.
    for (const it of sched.items) {
      const lane = lanes.find((l) => l.queue === it.queue);
      if (!lane) continue;
      const bx = xOf(it.start);
      const bw = Math.max(6, wOf(it.dur));
      const by = lane.y + 6;
      const bh = laneH - 12;
      roundRect(ctx, bx, by, bw, bh, 5);
      ctx.fillStyle = withAlpha(lane.color, 0.85);
      ctx.fill();
      ctx.strokeStyle = lane.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 라벨
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.pass.label, bx + bw / 2, by + bh / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      hits.push({ id: it.pass.id, x: bx, y: by, w: bw, h: bh });
    }
    hitRef.current = hits;

    // 의존 화살표(세마포어): C-SSAO 종료 → G-Lighting 시작.
    if (depOn && queues[DEP_FROM] !== queues[DEP_TO]) {
      const from = sched.items.find((it) => it.pass.id === DEP_FROM);
      const to = sched.items.find((it) => it.pass.id === DEP_TO);
      const fromLane = lanes.find((l) => l.queue === queues[DEP_FROM]);
      const toLane = lanes.find((l) => l.queue === queues[DEP_TO]);
      if (from && to && fromLane && toLane) {
        const x1 = xOf(from.end);
        const y1 = fromLane.y + laneH / 2;
        const x2 = xOf(to.start);
        const y2 = toLane.y + laneH / 2;
        drawArrow(ctx, x1, y1, x2, y2, QUEUE_COLORS.stall, {
          dashed: true,
          width: 1.5,
          head: 6,
        });
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillStyle = QUEUE_COLORS.stall;
        ctx.fillText('세마포어', (x1 + x2) / 2 - 18, (y1 + y2) / 2 - 4);
      }
    }

    // makespan 자(ruler) — 맨 아래.
    {
      const ry = cmpY + laneH + 12;
      ctx.strokeStyle = QUEUE_COLORS.ok;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(plotX, ry);
      ctx.lineTo(xOf(sched.makespan), ry);
      ctx.stroke();
      // 끝 캡
      ctx.beginPath();
      ctx.moveTo(xOf(sched.makespan), ry - 4);
      ctx.lineTo(xOf(sched.makespan), ry + 4);
      ctx.stroke();
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = QUEUE_COLORS.ok;
      ctx.fillText(`makespan ${sched.makespan.toFixed(1)}`, plotX + 4, ry - 5);
    }
  };

  const { ref } = useCanvas2d(draw, [sched, queues, durs, depOn]);

  usePointerDrag(ref, {
    onDown: (e, canvas) => {
      const p = pointerToCanvas(e, canvas);
      // 블록 히트테스트 — 탭 타깃 보강(상하 8px 여유).
      for (const r of hitRef.current) {
        if (
          p.x >= r.x &&
          p.x <= r.x + r.w &&
          p.y >= r.y - 8 &&
          p.y <= r.y + r.h + 8
        ) {
          flipQueue(r.id);
          return false; // 드래그로 끌지 않음 — 탭 토글만.
        }
      }
      return false; // 빈 곳 탭은 무시.
    },
  });

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block', cursor: 'pointer' }}
      />
      <ControlPanel>
        <Slider
          label="C-SSAO 길이"
          value={ssaoDur}
          min={1}
          max={10}
          step={0.5}
          onChange={setSsaoDur}
          format={(v) => `${v} ms`}
        />
        <Slider
          label="G-Lighting 길이"
          value={lightingDur}
          min={1}
          max={10}
          step={0.5}
          onChange={setLightingDur}
          format={(v) => `${v} ms`}
        />
        <ToggleControl
          label="교차 큐 의존(세마포어): Lighting ← SSAO"
          checked={depOn}
          onChange={setDepOn}
        />
        <Btn onClick={reset} variant="ghost">
          리셋
        </Btn>
      </ControlPanel>
      <div
        style={{
          marginTop: '0.6rem',
          fontSize: '0.85rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--muted)',
          lineHeight: 1.7,
        }}
      >
        직렬: {sched.serial.toFixed(1)} ms · makespan:{' '}
        <span style={{ color: QUEUE_COLORS.ok }}>{sched.makespan.toFixed(1)} ms</span> · 절감:{' '}
        <span style={{ color: savings > 0 ? QUEUE_COLORS.ok : 'var(--muted)' }}>
          {savings.toFixed(1)} ms ({savingsPct.toFixed(0)}%)
        </span>
        {depOn && (
          <>
            {' '}
            · 스톨:{' '}
            <span style={{ color: QUEUE_COLORS.stall }}>{sched.stall.toFixed(1)} ms</span>
          </>
        )}
      </div>
      <figcaption>
        독립적인 작업을 서로 다른 큐에 올리면 GPU에서 <strong>동시에</strong> 돌아갑니다 — 비동기
        컴퓨트가 그래픽스의 노는 ALU를 메워 지연을 숨깁니다. 같은 큐 안에서는 FIFO로 직렬 실행되고,{' '}
        <em>다른 큐끼리만</em> 겹칩니다. 하지만 교차 큐 의존이 생기면(예: 라이팅이 SSAO 결과를 필요로
        함) <strong>세마포어</strong>로 기다려야 하고, 그 대기가 <strong>스톨</strong>이라는 동기화
        비용을 만듭니다. 오버랩은 큐들이 독립적인 일을 가질 때, 그리고 의존이 가벼울 때 이득입니다.
        <br />
        <strong>직접 해보세요:</strong> 컴퓨트 패스(C-SSAO·C-Particles) 블록을 탭해 컴퓨트 레인에
        올려 보세요 — makespan이 줄고 절감 %가 뜁니다. 그다음 “교차 큐 의존”을 켜면 스톨이 생겨
        절감을 갉아먹습니다. SSAO 길이를 크게 키우면 스톨이 지배해 <em>오버랩이 더는 이득이 안 되는</em>{' '}
        지점이 보입니다.
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 작은 버튼 — 컨트롤 툴킷에 버튼 프리미티브가 없어 캔버스 밖(DOM)에서
// CSS 변수만 읽는 플레인 버튼으로 직접 만든다. 탭 타깃 ≥ 36px.
// ---------------------------------------------------------------------------
interface BtnProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'ghost';
  children: React.ReactNode;
}

function Btn({ onClick, disabled, variant = 'solid', children }: BtnProps) {
  const solid = variant === 'solid';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 38,
        padding: '0 0.85rem',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: solid ? 'var(--accent)' : 'var(--surface)',
        color: solid ? '#fff' : 'var(--text)',
        font: 'inherit',
        fontSize: '0.85rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        flex: '0 0 auto',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </button>
  );
}
