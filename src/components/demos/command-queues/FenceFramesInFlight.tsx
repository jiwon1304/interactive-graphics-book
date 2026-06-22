import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { QUEUE_COLORS, roundRect, withAlpha, drawArrow } from './cq2d';

// ---------------------------------------------------------------------------
// 정적 도식: 프레임 인플라이트(frames in flight) + 펜스(fence)
//
// CPU는 프레임 k(=0,1,2,…)를 cpuTime ms 동안 "기록"하고, GPU는 같은 프레임을
// gpuTime ms 동안 "실행"한다. 둘은 병렬로 흐르며 디커플링되어 있다.
//
// 핵심 규칙(정확):
//  - 프레임 k는 슬롯 (k mod N)의 프레임별 리소스에 기록된다.
//  - CPU가 프레임 k 기록을 "시작"하려면 그 슬롯을 이전에 쓴 프레임 k−N을
//    GPU가 끝냈어야 한다. 즉 fence ≥ k−N+1.
//  - GPU는 프레임을 순서대로 실행. 프레임 k는 (CPU 기록 끝) ∧ (GPU가 k−1 끝) 후 시작.
//  - 펜스: GPU가 프레임 k를 끝낼 때 fence = k+1.
//
// 이 위젯은 두 장의 정적 비교 패널을 나란히 그린다(라이브 조작 없음):
//  - N=1: CPU·GPU가 핑퐁(둘 다 절반은 논다).
//  - N=3: 두 레인이 거의 꽉 참(겹침 → 더블/트리플 버퍼링의 이유).
// 같은 프레임 시간(cpu=gpu=8ms)에서 N만 바꿔 차이를 직접 비교하게 한다.
// ---------------------------------------------------------------------------

interface Block {
  frame: number;
  start: number;
  end: number;
  stall: boolean;
}

interface SimResult {
  cpu: Block[];
  gpu: Block[];
  cpuRecEnd: number[];
  gpuExecEnd: number[];
}

/** 결정론적 이벤트 시뮬레이션을 maxFrames만큼 돌려 블록 목록을 만든다. */
function simulate(N: number, cpuTime: number, gpuTime: number, maxFrames: number): SimResult {
  const cpu: Block[] = [];
  const gpu: Block[] = [];
  const cpuRecEnd: number[] = [];
  const gpuExecEnd: number[] = [];

  let cpuFree = 0;
  let gpuFree = 0;

  for (let k = 0; k < maxFrames; k++) {
    // CPU가 프레임 k 기록: 슬롯 (k mod N)을 쓴 프레임 k−N이 GPU에서 끝나야 시작.
    let cpuStart = cpuFree;
    if (k >= N) {
      const slotFreeAt = gpuExecEnd[k - N];
      if (slotFreeAt > cpuStart) {
        cpu.push({ frame: k, start: cpuStart, end: slotFreeAt, stall: true });
        cpuStart = slotFreeAt;
      }
    }
    const cpuEnd = cpuStart + cpuTime;
    cpu.push({ frame: k, start: cpuStart, end: cpuEnd, stall: false });
    cpuRecEnd[k] = cpuEnd;
    cpuFree = cpuEnd;

    // GPU가 프레임 k 실행: (CPU 기록 끝) ∧ (GPU가 직전 프레임 끝).
    const gpuStart = Math.max(gpuFree, cpuEnd);
    if (gpuStart > gpuFree) {
      gpu.push({ frame: k, start: gpuFree, end: gpuStart, stall: true });
    }
    const gpuEnd = gpuStart + gpuTime;
    gpu.push({ frame: k, start: gpuStart, end: gpuEnd, stall: false });
    gpuExecEnd[k] = gpuEnd;
    gpuFree = gpuEnd;
  }

  return { cpu, gpu, cpuRecEnd, gpuExecEnd };
}

const CANVAS_W = 380;
const CANVAS_H = 440;
const FRAME_TIME = 8; // cpu=gpu=8ms 고정(균형 워크로드)
const SIM_FRAMES = 8;

// 두 패널 공통: 같은 ms→px 스케일을 써야 N=1 vs N=3 폭이 정직하게 비교됨.
const WINDOW_MS = 56; // 두 패널 모두 0..56ms 창을 보여줌

interface PanelSpec {
  N: number;
  title: string;
  note: string;
}

const PANELS: PanelSpec[] = [
  { N: 1, title: 'N = 1 (버퍼 1개)', note: '핑퐁 — 둘 다 절반은 논다' },
  { N: 3, title: 'N = 3 (트리플 버퍼)', note: '레인이 겹쳐 거의 꽉 참' },
];

export default function FenceFramesInFlight() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 14;
    const panelH = (h - 16) / 2;
    const laneH = 40;

    const plotX = padX + 8;
    const plotW = w - plotX - padX - 86; // 우측에 펜스 박스 공간
    // x 매핑은 패널과 무관(두 패널 같은 ms→px 스케일).
    const xOf = (t: number): number => plotX + (t / WINDOW_MS) * plotW;

    const drawPanel = (spec: PanelSpec, panelTop: number): void => {
      const sim = simulate(spec.N, FRAME_TIME, FRAME_TIME, SIM_FRAMES);

      // 패널 제목 + 노트 (제목·노트·레인 라벨이 겹치지 않게 충분히 띄움)
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillStyle = theme.text;
      ctx.fillText(spec.title, plotX, panelTop + 14);
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.fillText(spec.note, plotX, panelTop + 32);

      const cpuLaneY = panelTop + 58;
      const gpuLaneY = cpuLaneY + laneH + 24;

      // 레인 라벨
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.fillText('CPU 기록', plotX, cpuLaneY - 6);
      ctx.fillText('GPU 실행', plotX, gpuLaneY - 6);

      // 레인 배경
      for (const y of [cpuLaneY, gpuLaneY]) {
        roundRect(ctx, plotX, y, plotW, laneH, 8);
        ctx.fillStyle = withAlpha(theme.border, 0.35);
        ctx.fill();
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const drawBlocks = (blocks: Block[], laneY: number, busyColor: string): void => {
        for (const b of blocks) {
          if (b.start > WINDOW_MS) continue;
          const bx = xOf(b.start);
          const bxe = xOf(Math.min(b.end, WINDOW_MS));
          const bw = Math.max(1, bxe - bx);
          const by = laneY + 6;
          const bh = laneH - 12;
          if (b.stall) {
            // 주황 해치(대기/스톨)
            ctx.save();
            roundRect(ctx, bx, by, bw, bh, 4);
            ctx.clip();
            ctx.fillStyle = withAlpha(QUEUE_COLORS.stall, 0.15);
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = withAlpha(QUEUE_COLORS.stall, 0.85);
            ctx.lineWidth = 1;
            for (let x = bx - bh; x < bx + bw; x += 7) {
              ctx.beginPath();
              ctx.moveTo(x, by + bh);
              ctx.lineTo(x + bh, by);
              ctx.stroke();
            }
            ctx.restore();
          } else {
            roundRect(ctx, bx, by, bw, bh, 4);
            ctx.fillStyle = withAlpha(busyColor, 0.85);
            ctx.fill();
            if (bw > 16) {
              ctx.font = '12px ui-monospace, monospace';
              ctx.fillStyle = '#ffffff';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(`f${b.frame}`, bx + bw / 2, by + bh / 2);
              ctx.textAlign = 'start';
              ctx.textBaseline = 'alphabetic';
            }
          }
        }
      };

      drawBlocks(sim.cpu, cpuLaneY, QUEUE_COLORS.graphics);
      drawBlocks(sim.gpu, gpuLaneY, QUEUE_COLORS.compute);

      // 펜스 시그널 화살표: GPU가 프레임 k를 끝내면 슬롯이 비어 프레임 k+N의
      // CPU 기록이 풀린다. 창 안에 보이는 한 쌍만 대표로 그린다.
      for (let k = 0; k < sim.gpuExecEnd.length; k++) {
        const gEnd = sim.gpuExecEnd[k];
        const target = k + spec.N;
        if (target >= sim.cpuRecEnd.length) break;
        const cpuStart = sim.cpuRecEnd[target] - FRAME_TIME;
        if (gEnd > WINDOW_MS || cpuStart > WINDOW_MS) break;
        // 스톨로 풀어준 경우(=cpuStart가 gEnd와 맞닿음)만 1개 그린다.
        if (Math.abs(cpuStart - gEnd) < 0.5 && gEnd > 0) {
          drawArrow(
            ctx,
            xOf(gEnd),
            gpuLaneY + 4,
            xOf(cpuStart),
            cpuLaneY + laneH - 4,
            withAlpha(QUEUE_COLORS.ok, 0.9),
            { dashed: true, width: 1.4, head: 6 },
          );
          ctx.font = '8px ui-monospace, monospace';
          ctx.fillStyle = QUEUE_COLORS.ok;
          ctx.fillText('펜스 시그널', xOf(gEnd) + 3, gpuLaneY + laneH + 12);
          break;
        }
      }

      // 펜스 값 박스(우측). 창 끝(WINDOW_MS) 시점의 완료 프레임 수.
      let fence = 0;
      for (const e of sim.gpuExecEnd) if (e <= WINDOW_MS + 1e-6) fence += 1;
      {
        const bw = 72;
        const bx = w - padX - bw;
        const by = cpuLaneY; // CPU 레인 상단에 맞춤
        roundRect(ctx, bx, by, bw, 50, 10);
        ctx.fillStyle = withAlpha(theme.border, 0.4);
        ctx.fill();
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = theme.muted;
        ctx.fillText('FENCE', bx + 10, by + 15);
        ctx.font = '700 22px ui-monospace, monospace';
        ctx.fillStyle = theme.accent;
        ctx.fillText(String(fence), bx + 10, by + 40);
      }

      // 슬롯 표시(N개) — 펜스 박스 아래
      {
        const sx = w - padX - 72;
        const sy = cpuLaneY + 56; // 펜스 박스(높이 50) 바로 아래
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = theme.muted;
        ctx.fillText('슬롯:', sx, sy - 2);
        const sw = 16;
        for (let i = 0; i < spec.N; i++) {
          roundRect(ctx, sx + i * (sw + 4), sy + 2, sw, 16, 4);
          ctx.fillStyle = withAlpha(theme.accent, 0.18);
          ctx.fill();
          ctx.strokeStyle = withAlpha(theme.accent, 0.6);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    };

    drawPanel(PANELS[0], 8);
    drawPanel(PANELS[1], 8 + panelH);

    // 두 패널 구분선
    ctx.strokeStyle = withAlpha(theme.border, 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, 8 + panelH - 4);
    ctx.lineTo(w - padX, 8 + panelH - 4);
    ctx.stroke();
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, display: 'block' }}
      />
      <figcaption>
        <strong>펜스(fence)</strong>는 CPU와 GPU를 잇는 동기화 카운터입니다. GPU가 프레임 k를
        끝내면 펜스를 k+1로 올리고(초록 점선 = 펜스 시그널), CPU는 슬롯 (k mod N)을 다시 쓰기 전에
        그 슬롯을 쓰던 옛 프레임이 끝났는지(펜스 ≥ k−N+1) 기다립니다. 위 두 패널은 <em>같은 프레임
        시간(CPU=GPU=8&nbsp;ms)</em>에서 N만 바꾼 결과입니다. <strong>N=1</strong>이면 CPU·GPU가
        번갈아 멈춰(주황 해치) 두 레인이 핑퐁합니다 — 둘 다 절반은 놉니다. 프레임별 리소스를{' '}
        <strong>N벌</strong> 두면(더블·트리플 버퍼링) <strong>N=3</strong>처럼 CPU가 프레임 i+1을
        기록하는 동안 GPU가 프레임 i를 실행해 두 레인이 <em>겹칩니다</em> — 같은 시간 창에서 더 많은
        프레임이 끝나 펜스 값이 더 큽니다. 대신 N이 클수록 입력→화면 <em>레이턴시</em>가 길어지고
        메모리도 N배가 듭니다. 처리량·레이턴시·메모리의 삼각 트레이드오프입니다.
      </figcaption>
    </figure>
  );
}
