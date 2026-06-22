import { useMemo } from 'react';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { UE_COLORS, roundRect, withAlpha, drawArrow, monoFont } from './ue2d';

// ---------------------------------------------------------------------------
// 정적 도식: Unreal Insights 멀티 큐 타임라인 + 펜스(fence) 화살표
//
// 출처: Luke Thatcher (Epic) 발표.
// - Insights는 CPU·GPU 작업을 하나의 타임라인에 그리고, GPU의
//   graphics 큐 / compute(async) 큐 각각의 busy/wait/idle을 보여준다.
// - fence arrow: 한 큐의 signal → 다른 큐의 wait. fence number + latency 표기.
//   latency = signal을 받은 시각부터 GPU 셰이더를 준비해 실제 커널을
//   런치하기까지의 시간.
//
// 이 그림은 두 경우를 위·아래로 정지시켜 보여준다(인터랙티브 아님):
//   (위) 정상(비순환): compute가 graphics의 펜스를 기다린다.
//        펜스 latency가 작은 스톨(wait)을 만들고 makespan을 늘린다.
//   (아래) 순환 의존(deadlock): graphics가 compute 펜스를 기다리는데
//        compute도 graphics 펜스를 기다림 → 서로 영원히 대기.
//        두 큐가 빨갛게 얼어붙는다 (발표 예시 #2).
// ---------------------------------------------------------------------------

const CANVAS_H = 440;
const CANVAS_MAXW = 360; // 모바일 우선: 내부 렌더 폭 상한

// 정적 대표값.
const LATENCY = 1.2; // 펜스 latency (ms)
const G_DUR = 5; // G-BasePass 길이
const C_DUR = 4; // C-Light 길이

interface Block {
  start: number;
  dur: number;
  label: string;
}

interface NormalSched {
  gfx: Block[];
  cmp: Block[];
  makespan: number;
  signalT: number;
  waitT: number;
  stall: number;
  fenceNo: number;
}

/**
 * 정상 시나리오: compute가 graphics의 펜스를 기다린다.
 * graphics의 첫 블록이 끝나면 펜스를 신호하고, compute의 둘째 블록이
 * (신호 + latency)까지 밀린다 → 스톨.
 */
function buildNormal(): NormalSched {
  const gfx: Block[] = [
    { start: 0, dur: 2, label: 'G-Prepass' },
    { start: 2, dur: G_DUR, label: 'G-BasePass' },
  ];
  const cmp: Block[] = [
    { start: 0, dur: 2, label: 'C-Cull' },
    { start: 2, dur: C_DUR, label: 'C-Light' },
  ];

  const signalT = gfx[0].start + gfx[0].dur; // graphics 첫 블록 끝 = 2
  const fifoReady = cmp[0].start + cmp[0].dur; // compute 둘째 블록 자연 시작 = 2
  const releaseT = signalT + LATENCY;
  const newStart = Math.max(fifoReady, releaseT);
  const stall = Math.max(0, newStart - fifoReady);
  cmp[1].start = newStart;

  const makespan = Math.max(gfx[1].start + gfx[1].dur, cmp[1].start + cmp[1].dur);
  return { gfx, cmp, makespan, signalT, waitT: newStart, stall, fenceNo: 42 };
}

// deadlock 시나리오의 블록(펜스 적용 없음 — 그냥 직렬 배치).
function deadlockBlocks(): { gfx: Block[]; cmp: Block[] } {
  return {
    gfx: [
      { start: 0, dur: 2, label: 'G-Prepass' },
      { start: 2, dur: G_DUR, label: 'G-BasePass' },
    ],
    cmp: [
      { start: 0, dur: 2, label: 'C-Cull' },
      { start: 2, dur: C_DUR, label: 'C-Light' },
    ],
  };
}

export default function InsightsFenceTimeline() {
  const normal = useMemo(() => buildNormal(), []);
  const dead = useMemo(() => deadlockBlocks(), []);

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 14;
    const labelW = 80;
    const plotX = padX + labelW;
    const plotW = w - plotX - padX;

    const tMax = Math.max(normal.makespan, normal.waitT, 12) * 1.05;
    const xOf = (t: number): number => plotX + (t / tMax) * plotW;
    const wOf = (dt: number): number => (dt / tMax) * plotW;

    const laneH = 44;
    const laneGap = 24;

    // 한 멀티 큐 타임라인 블록(정상/데드락)을 그린다. y0 = 제목 baseline.
    const drawTimeline = (
      title: string,
      gfx: Block[],
      cmp: Block[],
      y0: number,
      deadlock: boolean,
    ): number => {
      ctx.font = monoFont(12);
      ctx.fillStyle = deadlock ? UE_COLORS.bad : theme.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(title, padX, y0);

      const gfxY = y0 + 10;
      const cmpY = gfxY + laneH + laneGap;

      const lanes: Array<{
        y: number;
        queue: 'graphics' | 'compute';
        label: string;
        color: string;
        blocks: Block[];
      }> = [
        { y: gfxY, queue: 'graphics', label: 'graphics', color: UE_COLORS.graphics, blocks: gfx },
        { y: cmpY, queue: 'compute', label: 'compute', color: UE_COLORS.compute, blocks: cmp },
      ];

      // 레인 배경 + 라벨
      for (const lane of lanes) {
        ctx.font = monoFont(11);
        ctx.fillStyle = deadlock ? UE_COLORS.bad : lane.color;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(lane.label, plotX - 8, lane.y + laneH / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        roundRect(ctx, plotX, lane.y, plotW, laneH, 8);
        ctx.fillStyle = withAlpha(theme.border, 0.3);
        ctx.fill();
        ctx.strokeStyle = deadlock ? UE_COLORS.bad : theme.border;
        ctx.lineWidth = deadlock ? 1.5 : 1;
        ctx.stroke();
      }

      // 정상: compute 큐의 스톨(wait) 갭을 주황으로.
      if (!deadlock && normal.stall > 0) {
        const lane = lanes.find((l) => l.queue === 'compute');
        if (lane) {
          const sx = xOf(normal.waitT - normal.stall);
          const sw = wOf(normal.stall);
          roundRect(ctx, sx, lane.y + 8, Math.max(2, sw), laneH - 16, 4);
          ctx.fillStyle = withAlpha(UE_COLORS.stall, 0.35);
          ctx.fill();
          ctx.strokeStyle = UE_COLORS.stall;
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = monoFont(11);
          ctx.fillStyle = UE_COLORS.stall;
          ctx.textAlign = 'center';
          if (sw > 26) ctx.fillText('wait', sx + sw / 2, lane.y + laneH / 2 + 3);
          ctx.textAlign = 'left';
        }
      }

      // 작업 블록(busy)
      for (const lane of lanes) {
        for (const b of lane.blocks) {
          const bx = xOf(b.start);
          const bw = Math.max(8, wOf(b.dur));
          const by = lane.y + 8;
          const bh = laneH - 16;
          roundRect(ctx, bx, by, bw, bh, 5);
          const fill = deadlock ? UE_COLORS.bad : lane.color;
          ctx.fillStyle = withAlpha(fill, deadlock ? 0.55 : 0.85);
          ctx.fill();
          ctx.strokeStyle = fill;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.font = monoFont(11);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (bw > 46) ctx.fillText(b.label, bx + bw / 2, by + bh / 2);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
        }
      }

      if (deadlock) {
        // 양방향 펜스 화살표 — 서로를 기다림(순환).
        const gMid = gfxY + laneH;
        const cMid = cmpY;
        const ax = xOf(Math.max(normal.makespan, 9) * 0.5);
        drawArrow(ctx, ax - 30, gMid + 2, ax - 30, cMid - 2, UE_COLORS.bad, {
          dashed: true,
          width: 2,
          head: 7,
        });
        drawArrow(ctx, ax + 30, cMid - 2, ax + 30, gMid + 2, UE_COLORS.bad, {
          dashed: true,
          width: 2,
          head: 7,
        });
        ctx.font = monoFont(11);
        ctx.fillStyle = UE_COLORS.bad;
        ctx.textAlign = 'center';
        ctx.fillText('fence #41', ax - 30, (gMid + cMid) / 2);
        ctx.fillText('fence #41', ax + 30, (gMid + cMid) / 2 + 12);
        ctx.textAlign = 'left';

        // 빨간 판정 바
        const vy = cmpY + laneH + 8;
        roundRect(ctx, plotX, vy, plotW, 26, 6);
        ctx.fillStyle = withAlpha(UE_COLORS.bad, 0.16);
        ctx.fill();
        ctx.strokeStyle = UE_COLORS.bad;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = monoFont(11);
        ctx.fillStyle = UE_COLORS.bad;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          '⛔ DEADLOCK — 서로의 펜스 무한 대기',
          plotX + plotW / 2,
          vy + 13,
        );
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        return vy + 26;
      }

      // 정상: graphics 첫 블록 끝 → compute 둘째 블록 시작으로 펜스 화살표.
      const fromLane = lanes.find((l) => l.queue === 'graphics');
      const toLane = lanes.find((l) => l.queue === 'compute');
      if (fromLane && toLane) {
        const x1 = xOf(normal.signalT);
        const y1 = fromLane.y + laneH / 2;
        const x2 = xOf(normal.waitT);
        const y2 = toLane.y + laneH / 2;
        drawArrow(ctx, x1, y1, x2, y2, UE_COLORS.active, {
          dashed: true,
          width: 1.5,
          head: 7,
        });
        ctx.font = monoFont(11);
        ctx.fillStyle = UE_COLORS.active;
        ctx.textAlign = 'center';
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        ctx.fillText(`fence #${normal.fenceNo}`, mx, my - 4);
        ctx.fillText(`latency ${LATENCY.toFixed(1)} ms`, mx, my + 8);
        ctx.textAlign = 'left';
      }

      // makespan 자(ruler)
      const ry = cmpY + laneH + 14;
      ctx.strokeStyle = UE_COLORS.ok;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(plotX, ry);
      ctx.lineTo(xOf(normal.makespan), ry);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xOf(normal.makespan), ry - 4);
      ctx.lineTo(xOf(normal.makespan), ry + 4);
      ctx.stroke();
      ctx.font = monoFont(11);
      ctx.fillStyle = UE_COLORS.ok;
      ctx.textAlign = 'left';
      ctx.fillText(`makespan ${normal.makespan.toFixed(1)} ms`, plotX + 4, ry - 5);
      return ry + 6;
    };

    const afterNormal = drawTimeline(
      '정상: compute가 graphics 펜스 대기',
      normal.gfx,
      normal.cmp,
      18,
      false,
    );
    drawTimeline(
      'deadlock: 서로의 펜스 무한 대기 (예시 #2)',
      dead.gfx,
      dead.cmp,
      afterNormal + 16,
      true,
    );
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{
          height: CANVAS_H,
          display: 'block',
          width: '100%',
          maxWidth: CANVAS_MAXW,
          minWidth: 0,
        }}
      />
      <figcaption>
        Unreal Insights는 CPU와 GPU 작업을 <strong>하나의 타임라인</strong>에 올리고, GPU의{' '}
        <strong>graphics 큐</strong>와 <strong>compute(async) 큐</strong> 각각의 busy/wait/idle을
        보여줍니다. 큐 사이의 순서는 <strong>펜스 화살표</strong>로 따라갑니다 — 한 큐가 펜스를
        signal하면 다른 큐가 그 값을 wait합니다. <strong>위 타임라인(정상)</strong>에서 화살표에는{' '}
        <em>펜스 번호 #42</em>와 <em>latency</em>가 붙는데, latency란 signal을 받은 순간부터 GPU가
        셰이더를 준비해 실제 커널을 런치하기까지의 시간으로, 작은 <strong>스톨(wait)</strong>로 나타나
        makespan을 늘립니다. <strong>아래 타임라인(deadlock)</strong>은 위험한 경우입니다: graphics가
        compute의 펜스를 기다리는데 compute도 graphics의 펜스를 기다려 의존이 <strong>순환</strong>하면
        둘 다 영원히 멈춥니다 — 이것이 발표에서 본 "AsyncCompute가 active인데 알고 보니 Graphics 큐의
        펜스를 대기 중"이던 <strong>deadlock</strong>입니다(예시 #2). (참고: 기존 immediate cmdlist를
        쓰면 RHI 커맨드를 병렬로 변환할 수 없어 single thread로만 처리됩니다.) (Luke Thatcher (Epic)
        발표)
      </figcaption>
    </figure>
  );
}
