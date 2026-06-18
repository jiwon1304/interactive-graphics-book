import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { QUEUE_COLORS, withAlpha, roundRect, drawArrow, pill } from './cq2d';

// ─────────────────────────────────────────────────────────────────────────────
// 정적 도식: 타임라인 세마포어 — 큐↔큐 happens-before
//
// 두 개의 큐(그래픽스/컴퓨트)가 각자 작업 블록을 순서대로 실행한다. 공유된
// "타임라인 세마포어"는 단조 증가하는 64비트 값을 갖는다. 그래픽스 블록 G1은
// 끝날 때 그 값을 2로 "시그널"하고, 컴퓨트 큐의 C1 블록은 "값 ≥ 2"가 될 때까지
// "대기"한다 — 임계값에 도달하기 전이면 C1은 정지(스톨)한다. 이것이 큐↔큐
// happens-before 순서를 만든다.
//
// 비-렌더링 시스템 주제이므로 라이브 스크럽 대신, 스케줄이 끝난 시점의 "한 장의
// 정지 화면"으로 가르친다. 대표 설정: G1이 값 2를 시그널, C1은 ≥2를 대기.
// ─────────────────────────────────────────────────────────────────────────────

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

interface ScheduledBlock {
  id: string;
  label: string;
  start: number;
  end: number;
  signalValue?: number;
  stallFrom?: number;
}

const TIMELINE_END = 6.4;
const C1_NATURAL_GAP = 0.3;

// 고정 설정: G1이 값 2를 시그널, C1은 ≥2를 대기.
const SIGNALER = 'G1';
const SIGNAL_VALUE = 2;
const WAIT_W = 2;

interface Schedule {
  gfx: ScheduledBlock[];
  cmp: ScheduledBlock[];
  edge: { fromX: number } | null;
}

function buildSchedule(): Schedule {
  const gfx: ScheduledBlock[] = [];
  let gt = 0;
  for (const b of GFX_BLOCKS) {
    const start = gt;
    const end = gt + b.dur;
    gfx.push({
      id: b.id,
      label: b.label,
      start,
      end,
      signalValue: b.id === SIGNALER ? SIGNAL_VALUE : undefined,
    });
    gt = end;
  }

  const signalEvents = gfx
    .filter((b) => b.signalValue !== undefined)
    .map((b) => ({ t: b.end, value: b.signalValue as number }))
    .sort((a, b) => a.t - b.t);

  const c0 = CMP_BLOCKS[0];
  const c0End = c0.dur;
  const c1 = CMP_BLOCKS[1];
  const naturalStart = c0End + C1_NATURAL_GAP;

  // C1은 값 ≥ W가 되는 가장 이른 시각까지 정지.
  let releaseAt = naturalStart;
  for (const ev of signalEvents) {
    if (ev.value >= WAIT_W) {
      releaseAt = ev.t;
      break;
    }
  }
  const c1Start = Math.max(naturalStart, releaseAt);
  const c1StallFrom = c1Start > naturalStart ? naturalStart : undefined;

  const sBlock = gfx.find((b) => b.id === SIGNALER);
  const edge = sBlock ? { fromX: sBlock.end } : null;

  const cmp: ScheduledBlock[] = [
    { id: c0.id, label: c0.label, start: 0, end: c0End },
    { id: c1.id, label: c1.label, start: c1Start, end: c1Start + c1.dur, stallFrom: c1StallFrom },
  ];

  return { gfx, cmp, edge };
}

const PAD_L = 16;
const PAD_R = 16;
const LANE_GFX_Y = 70;
const LANE_CMP_Y = 150;
const LANE_H = 40;
const AXIS_Y = 220;
const VALUE_BOX_Y = 252;

export default function TimelineSemaphoreGater() {
  const sched = buildSchedule();
  // 정적 화면: 스케줄이 끝난 시점(모든 블록 완료)을 보여준다.
  const finalValue = SIGNAL_VALUE; // G1이 시그널한 최종 타임라인 값
  const c1 = sched.cmp[1];

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
    ctx.fillText('그래픽스 큐  (G1이 값 2를 시그널)', x0, LANE_GFX_Y - LANE_H / 2 - 12);
    ctx.fillStyle = QUEUE_COLORS.compute;
    ctx.fillText('컴퓨트 큐  (C1은 값 ≥ 2를 대기)', x0, LANE_CMP_Y - LANE_H / 2 - 12);

    for (const ly of [LANE_GFX_Y, LANE_CMP_Y]) {
      ctx.fillStyle = withAlpha(theme.border, 0.5);
      roundRect(ctx, x0, ly - LANE_H / 2, innerW, LANE_H, 6);
      ctx.fill();
    }

    // 블록(모두 실행 완료 = 꽉 채움).
    const drawBlock = (b: ScheduledBlock, laneY: number, color: string) => {
      const bx0 = toX(b.start);
      const bx1 = toX(b.end);
      const bw = Math.max(2, bx1 - bx0);
      const by = laneY - LANE_H / 2 + 4;
      const bh = LANE_H - 8;

      roundRect(ctx, bx0, by, bw, bh, 5);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = withAlpha(color, 0.9);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, (bx0 + bx1) / 2, laneY);
      ctx.textAlign = 'start';

      // 시그널 마커(블록 끝).
      if (b.signalValue !== undefined) {
        const sx = bx1;
        ctx.beginPath();
        ctx.arc(sx, by - 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = QUEUE_COLORS.ok;
        ctx.fill();
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = QUEUE_COLORS.ok;
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
      ctx.fillStyle = QUEUE_COLORS.stall;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('대기(스톨)', (sx0 + sx1) / 2, LANE_CMP_Y);
      ctx.textAlign = 'start';
    }

    for (const b of sched.gfx) drawBlock(b, LANE_GFX_Y, QUEUE_COLORS.graphics);
    for (const b of sched.cmp) drawBlock(b, LANE_CMP_Y, QUEUE_COLORS.compute);

    // happens-before 에지: G1 끝 → C1 시작(점선 화살표).
    if (sched.edge) {
      const fx = toX(sched.edge.fromX);
      const fy = LANE_GFX_Y + LANE_H / 2 - 4;
      const tx = toX(c1.start);
      const ty = LANE_CMP_Y - LANE_H / 2 + 2;
      drawArrow(ctx, fx, fy, tx, ty, QUEUE_COLORS.ok, { dashed: true, width: 1.5, head: 7 });
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = QUEUE_COLORS.ok;
      ctx.textAlign = 'center';
      ctx.fillText('happens-before', (fx + tx) / 2, (fy + ty) / 2 - 3);
      ctx.textAlign = 'start';
    }

    // 시각 축.
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
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = theme.muted;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('시간 →', x1 - 34, AXIS_Y + 14);

    // 타임라인 값 카운터(큰 단조 숫자) + 틱.
    ctx.fillStyle = theme.text;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('타임라인 세마포어 값', x0, VALUE_BOX_Y);
    const tickX0 = x0 + 160;
    for (let vv = 0; vv <= 3; vv++) {
      const tx = tickX0 + vv * 26;
      const on = vv <= finalValue;
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
    ctx.font = 'bold 22px ui-monospace, monospace';
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'right';
    ctx.fillText(`v = ${finalValue}`, x1, VALUE_BOX_Y);
    ctx.textAlign = 'start';

    // C1 대기 임계값 알약.
    pill(
      ctx,
      tickX0 + 3 * 26 + 64,
      VALUE_BOX_Y,
      `C1: wait ≥ ${WAIT_W}`,
      withAlpha(QUEUE_COLORS.ok, 0.9),
      '#ffffff',
      '10px ui-monospace, monospace',
    );

    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 300, display: 'block' }}
      />
      <figcaption>
        세마포어는 <strong>큐와 큐 사이</strong>(또는 큐↔표시)를 동기화합니다 — CPU와 GPU를 잇는
        펜스와는 다릅니다. 타임라인 세마포어는 단조 증가하는 값을 들고, 어떤 작업이 “끝나면 값을 v로
        시그널”하고 다른 작업이 “값 ≥ v가 될 때까지 대기”합니다. 위 그림에서 그래픽스 큐의{' '}
        <strong>G1</strong>이 끝나며 값을 <strong>2</strong>로 시그널하고(초록 점), 컴퓨트 큐의{' '}
        <strong>C1</strong>은 “값 ≥ 2”를 기다립니다. C0가 끝난 뒤 C1이 곧장 달리고 싶어도, 값이 아직
        2가 아니므로 G1이 끝날 때까지 <em>정지</em>합니다(주황 스톨 구간 = 동기화가 사 온 GPU 유휴
        시간). G1이 끝나 값이 2에 도달하는 순간 C1이 풀립니다 — 이 초록 화살표가{' '}
        <em>G1이 C1보다 먼저 일어남(happens-before)</em>을 못 박은 것입니다. 만약 대기 임계값을
        0으로 두면 C1은 큐가 허락하는 만큼 일찍 달려 <em>G1의 결과가 준비되기도 전에 읽는</em>{' '}
        경쟁 상태가 됩니다. 이진 세마포어는 값이 0/1뿐인 특수한 경우일 뿐입니다.
      </figcaption>
    </figure>
  );
}
