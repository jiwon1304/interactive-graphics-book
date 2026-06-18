import { useMemo, useState } from 'react';
import { ControlPanel, Slider, SelectControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import {
  UE_COLORS,
  roundRect,
  withAlpha,
  drawArrow,
  monoFont,
} from './ue2d';

// ---------------------------------------------------------------------------
// 모델: Unreal Insights 멀티 큐 타임라인 + 펜스(fence) 화살표
//
// 출처: Luke Thatcher (Epic) 발표.
// - Insights는 CPU·GPU 작업을 하나의 타임라인에 그리고, GPU의
//   graphics 큐 / compute(async) 큐 각각의 busy/wait/idle을 보여준다.
// - fence arrow: 한 큐의 signal → 다른 큐의 wait. fence number + latency 표기.
//   latency = signal을 받은 시각부터 GPU 셰이더를 준비해 실제 커널을
//   런치하기까지의 시간.
//
// 이 위젯은 두 시나리오를 만질 수 있게 한다:
//   (1) 정상(비순환): compute가 graphics의 펜스를 기다린다(또는 반대).
//       펜스 지연이 작은 스톨을 만들고, makespan이 늘어난다.
//   (2) 순환 의존(deadlock): graphics가 compute의 펜스를 기다리는데
//       compute도 graphics의 펜스를 기다림 → 서로 영원히 대기.
//       → 두 큐를 빨갛게 얼리고 판정을 띄운다 (출처 예시 #2).
// ---------------------------------------------------------------------------

type Dir = 'c-waits-g' | 'g-waits-c' | 'deadlock';

const CANVAS_H = 330;

const DIR_OPTIONS = [
  { value: 'c-waits-g' as Dir, label: 'AsyncCompute가 Graphics 펜스 대기' },
  { value: 'g-waits-c' as Dir, label: 'Graphics가 AsyncCompute 펜스 대기' },
  { value: 'deadlock' as Dir, label: '순환 의존 (deadlock)' },
];

interface Block {
  /** 큐 안에서의 시작/끝 (펜스 지연 적용 전, 단위 ms) */
  start: number;
  dur: number;
  label: string;
}

/**
 * 두 큐의 작업 블록과 펜스 한 쌍을 배치한다.
 * graphics: [G0][G1] ... 중간에 펜스 신호/대기 지점.
 * compute:  [C0][C1] ...
 * 정상 시나리오에서는 한 큐의 특정 블록이 다른 큐의 펜스 신호를
 * 기다리므로, 대기쪽 블록 시작이 (신호시각 + latency)로 밀린다.
 */
function buildSchedule(
  dir: Dir,
  gDur: number,
  cDur: number,
  latency: number,
): {
  gfx: Block[];
  cmp: Block[];
  makespan: number;
  signalT: number;
  waitT: number;
  stall: number;
  // 펜스 화살표: 신호 큐/대기 큐와 위치
  fenceFromQueue: 'graphics' | 'compute';
  fenceToQueue: 'graphics' | 'compute';
  fenceNo: number;
  deadlock: boolean;
} {
  // 기본 직렬 블록 배치(펜스 적용 전)
  // graphics: G-Prepass(2) → G-BasePass(gDur)
  // compute : C-Cull(2)    → C-Light(cDur)
  const gfx: Block[] = [
    { start: 0, dur: 2, label: 'G-Prepass' },
    { start: 2, dur: gDur, label: 'G-BasePass' },
  ];
  const cmp: Block[] = [
    { start: 0, dur: 2, label: 'C-Cull' },
    { start: 2, dur: cDur, label: 'C-Light' },
  ];

  if (dir === 'deadlock') {
    return {
      gfx,
      cmp,
      makespan: Math.max(gfx[1].start + gfx[1].dur, cmp[1].start + cmp[1].dur),
      signalT: 0,
      waitT: 0,
      stall: 0,
      fenceFromQueue: 'graphics',
      fenceToQueue: 'compute',
      fenceNo: 41,
      deadlock: true,
    };
  }

  // 정상: 신호 큐의 첫 블록(인덱스 0)이 끝나면 펜스를 신호하고,
  // 대기 큐의 둘째 블록(인덱스 1)이 (신호 + latency)까지 기다린다.
  const signalQueue = dir === 'c-waits-g' ? 'graphics' : 'compute';
  const waitQueue = dir === 'c-waits-g' ? 'compute' : 'graphics';
  const signalBlocks = signalQueue === 'graphics' ? gfx : cmp;
  const waitBlocks = waitQueue === 'graphics' ? gfx : cmp;

  const signalT = signalBlocks[0].start + signalBlocks[0].dur; // 첫 블록 끝
  const fifoReady = waitBlocks[0].start + waitBlocks[0].dur; // 대기 큐 둘째 블록의 자연 시작
  const releaseT = signalT + latency; // 신호 + 펜스 latency
  const newStart = Math.max(fifoReady, releaseT);
  const stall = Math.max(0, newStart - fifoReady);
  waitBlocks[1].start = newStart;

  const makespan = Math.max(
    gfx[1].start + gfx[1].dur,
    cmp[1].start + cmp[1].dur,
  );

  return {
    gfx,
    cmp,
    makespan,
    signalT,
    waitT: newStart,
    stall,
    fenceFromQueue: signalQueue,
    fenceToQueue: waitQueue,
    fenceNo: 42,
    deadlock: false,
  };
}

/**
 * Unreal Insights 풍의 멀티 큐 타임라인.
 * 두 GPU 큐(graphics / async compute)의 busy/wait/idle을 한 타임라인에 그리고,
 * 큐 사이를 잇는 펜스 화살표(번호 + latency)를 표시한다.
 * "펜스 방향"을 순환으로 두면 deadlock을 직접 만들 수 있다.
 */
export default function InsightsFenceTimeline() {
  const [dir, setDir] = useState<Dir>('c-waits-g');
  const [latency, setLatency] = useState(1.2);
  const [gDur, setGDur] = useState(5);
  const [cDur, setCDur] = useState(4);

  const sched = useMemo(
    () => buildSchedule(dir, gDur, cDur, latency),
    [dir, gDur, cDur, latency],
  );

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const deadlock = sched.deadlock;

    const padX = 14;
    const labelW = 96;
    const plotX = padX + labelW;
    const plotW = w - plotX - padX;

    // 시간 축: makespan + 펜스 release까지 담도록 여유.
    const tMax = Math.max(sched.makespan, sched.waitT, sched.signalT + 1, 12) * 1.05;
    const xOf = (t: number): number => plotX + (t / tMax) * plotW;
    const wOf = (dt: number): number => (dt / tMax) * plotW;

    // 제목
    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Unreal Insights — GPU 큐 타임라인', plotX, 18);

    const laneH = 50;
    const laneGap = 26;
    const gfxY = 36;
    const cmpY = gfxY + laneH + laneGap;

    const lanes: Array<{
      y: number;
      queue: 'graphics' | 'compute';
      label: string;
      color: string;
      blocks: Block[];
    }> = [
      {
        y: gfxY,
        queue: 'graphics',
        label: 'graphics 큐',
        color: UE_COLORS.graphics,
        blocks: sched.gfx,
      },
      {
        y: cmpY,
        queue: 'compute',
        label: 'compute(async) 큐',
        color: UE_COLORS.compute,
        blocks: sched.cmp,
      },
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

    // 정상 시나리오: 대기 큐의 스톨(wait) 갭을 주황으로.
    if (!deadlock && sched.stall > 0) {
      const lane = lanes.find((l) => l.queue === sched.fenceToQueue);
      if (lane) {
        const sx = xOf(sched.waitT - sched.stall);
        const sw = wOf(sched.stall);
        roundRect(ctx, sx, lane.y + 8, Math.max(2, sw), laneH - 16, 4);
        ctx.fillStyle = withAlpha(UE_COLORS.stall, 0.35);
        ctx.fill();
        ctx.strokeStyle = UE_COLORS.stall;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = monoFont(9);
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
        ctx.font = monoFont(10);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (bw > 40) ctx.fillText(b.label, bx + bw / 2, by + bh / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }

    if (deadlock) {
      // 양방향 펜스 화살표 — 서로를 기다림(순환).
      const gMid = gfxY + laneH;
      const cMid = cmpY;
      const ax = xOf(sched.makespan * 0.5);
      // graphics → compute 대기
      drawArrow(ctx, ax - 30, gMid + 4, ax - 30, cMid - 4, UE_COLORS.bad, {
        dashed: true,
        width: 2,
        head: 7,
      });
      // compute → graphics 대기
      drawArrow(ctx, ax + 30, cMid - 4, ax + 30, gMid + 4, UE_COLORS.bad, {
        dashed: true,
        width: 2,
        head: 7,
      });
      ctx.font = monoFont(10);
      ctx.fillStyle = UE_COLORS.bad;
      ctx.textAlign = 'center';
      ctx.fillText('fence #41', ax - 30, (gMid + cMid) / 2);
      ctx.fillText('fence #41', ax + 30, (gMid + cMid) / 2 + 12);
      ctx.textAlign = 'left';

      // 큰 빨간 판정 바
      const vy = cmpY + laneH + 18;
      roundRect(ctx, plotX, vy, plotW, 30, 6);
      ctx.fillStyle = withAlpha(UE_COLORS.bad, 0.16);
      ctx.fill();
      ctx.strokeStyle = UE_COLORS.bad;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = monoFont(11);
      ctx.fillStyle = UE_COLORS.bad;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⛔ DEADLOCK — 두 큐가 서로의 펜스를 무한 대기', plotX + plotW / 2, vy + 15);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    } else {
      // 정상: 신호 큐 첫 블록 끝 → 대기 큐 둘째 블록 시작으로 펜스 화살표.
      const fromLane = lanes.find((l) => l.queue === sched.fenceFromQueue);
      const toLane = lanes.find((l) => l.queue === sched.fenceToQueue);
      if (fromLane && toLane) {
        const x1 = xOf(sched.signalT);
        const y1 = fromLane.y + laneH / 2;
        const x2 = xOf(sched.waitT);
        const y2 = toLane.y + laneH / 2;
        drawArrow(ctx, x1, y1, x2, y2, UE_COLORS.active, {
          dashed: true,
          width: 1.5,
          head: 7,
        });
        // 펜스 번호 + latency 라벨
        ctx.font = monoFont(9);
        ctx.fillStyle = UE_COLORS.active;
        ctx.textAlign = 'center';
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        ctx.fillText(`fence #${sched.fenceNo}`, mx, my - 4);
        ctx.fillText(`latency ${latency.toFixed(1)} ms`, mx, my + 8);
        ctx.textAlign = 'left';
      }

      // makespan 자(ruler)
      const ry = cmpY + laneH + 16;
      ctx.strokeStyle = UE_COLORS.ok;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(plotX, ry);
      ctx.lineTo(xOf(sched.makespan), ry);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xOf(sched.makespan), ry - 4);
      ctx.lineTo(xOf(sched.makespan), ry + 4);
      ctx.stroke();
      ctx.font = monoFont(10);
      ctx.fillStyle = UE_COLORS.ok;
      ctx.fillText(`makespan ${sched.makespan.toFixed(1)} ms`, plotX + 4, ry - 5);
    }
  };

  const { ref } = useCanvas2d(draw, [sched, latency]);

  const deadlock = sched.deadlock;

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block' }}
      />
      <ControlPanel>
        <SelectControl
          label="펜스 방향"
          value={dir}
          options={DIR_OPTIONS}
          onChange={setDir}
        />
        <Slider
          label="펜스 latency"
          value={latency}
          min={0}
          max={4}
          step={0.1}
          onChange={setLatency}
          format={(v) => `${v.toFixed(1)} ms`}
        />
        <Slider
          label="G-BasePass 길이"
          value={gDur}
          min={2}
          max={9}
          step={0.5}
          onChange={setGDur}
          format={(v) => `${v} ms`}
        />
        <Slider
          label="C-Light 길이"
          value={cDur}
          min={2}
          max={9}
          step={0.5}
          onChange={setCDur}
          format={(v) => `${v} ms`}
        />
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
        {deadlock ? (
          <span style={{ color: UE_COLORS.bad }}>
            deadlock: AsyncCompute가 Graphics 큐의 펜스를 무한 대기 (서로 순환) → 진행 불가
          </span>
        ) : (
          <>
            펜스 #{sched.fenceNo} latency:{' '}
            <span style={{ color: UE_COLORS.active }}>{latency.toFixed(1)} ms</span> · 강제 스톨:{' '}
            <span style={{ color: sched.stall > 0 ? UE_COLORS.stall : 'var(--muted)' }}>
              {sched.stall.toFixed(1)} ms
            </span>{' '}
            · makespan: <span style={{ color: UE_COLORS.ok }}>{sched.makespan.toFixed(1)} ms</span>
          </>
        )}
      </div>
      <figcaption>
        Unreal Insights는 CPU와 GPU 작업을 <strong>하나의 타임라인</strong>에 올리고, GPU의{' '}
        <strong>graphics 큐</strong>와 <strong>compute(async) 큐</strong> 각각의 busy/wait/idle을
        보여줍니다. 큐 사이의 순서는 <strong>펜스 화살표</strong>로 따라갑니다 — 한 큐가 펜스를
        signal하면 다른 큐가 그 값을 wait합니다. 화살표에는 <em>펜스 번호</em>와 <em>latency</em>가
        붙는데, 여기서 latency란 signal을 받은 순간부터 GPU가 셰이더를 준비해 실제 커널을 런치하기까지의
        시간입니다(작은 스톨로 나타나 makespan을 늘립니다). 위험은 의존이 <strong>순환</strong>할 때
        생깁니다: graphics가 compute의 펜스를 기다리는데 compute도 graphics의 펜스를 기다리면 둘 다
        영원히 멈춥니다 — 이것이 발표에서 본 “AsyncCompute가 active인데 알고 보니 Graphics 큐의 펜스를
        대기 중”이던 <strong>deadlock</strong>입니다. (참고: 기존 immediate cmdlist를 쓰면 RHI 커맨드를
        병렬로 변환할 수 없어 single thread로만 처리됩니다.)
        <br />
        <strong>직접 해보세요:</strong> “펜스 방향”을 바꿔 어느 큐가 기다리는지 보고, latency 슬라이더를
        키워 wait 갭이 커지는 걸 확인하세요. 그다음 방향을 <em>순환 의존 (deadlock)</em>으로 바꾸면 두
        큐가 빨갛게 얼어붙고 영원히 진행되지 않습니다 — Luke Thatcher (Epic) 발표의 실제 사례입니다.
      </figcaption>
    </figure>
  );
}
