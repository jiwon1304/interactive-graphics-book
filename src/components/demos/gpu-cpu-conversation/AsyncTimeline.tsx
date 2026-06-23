import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, label, roundRect, withAlpha, monoFont, drawArrow } from './gcc2d';

// frames-in-flight 타임라인(정적). 두 레인:
//  - CPU: 프레임을 차례로 "기록"(record). 단 GPU보다 최대 F프레임 앞설 수 있음(F=frames in flight).
//  - GPU: CPU가 제출한 프레임을 차례로 "실행", 끝에 present.
// 대표 상태로 F=1을 고른다: CPU가 GPU를 기다리는(idle/wait) 구간이 또렷이 보여,
// "F가 작으면 stall"이라는 핵심을 한 컷으로 가장 잘 보여준다.
//
// 도식용 단순 모델: CPU 기록시간 tc, GPU 실행시간 tg를 고정 칸으로. 핵심은 절대값이 아니라
// "F가 작으면 stall, 크면 파이프라인이 채워진다"는 구조.

const TC = 1.0; // CPU가 한 프레임 기록하는 데 드는 칸
const TG = 1.45; // GPU가 한 프레임 실행하는 데 드는 칸 (GPU가 더 오래 걸리는 경우)
const FRAMES = 5;
const FLIGHT = 1; // 대표 상태: frames in flight = 1 (stall이 보이는 경우)

export default function AsyncTimeline() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;
    const pad = 12;
    const leftW = 44;
    const x0 = pad + leftW;
    const x1 = w - pad - 8;

    // 시뮬레이션: 각 프레임의 CPU 기록 시작/끝, GPU 실행 시작/끝(칸 단위 시간)
    const cpuStart: number[] = [];
    const cpuEnd: number[] = [];
    const gpuStart: number[] = [];
    const gpuEnd: number[] = [];
    for (let i = 0; i < FRAMES; i++) {
      // CPU는 이전 프레임 기록 끝난 뒤 시작하되, GPU보다 FLIGHT개 넘게 앞서면 대기:
      // 프레임 i 기록을 시작하려면 프레임 (i-FLIGHT)의 GPU 실행이 끝나야 한다.
      const afterPrevRecord = i === 0 ? 0 : cpuEnd[i - 1];
      const waitFor = i - FLIGHT >= 0 ? gpuEnd[i - FLIGHT] : 0;
      const cs = Math.max(afterPrevRecord, waitFor);
      cpuStart[i] = cs;
      cpuEnd[i] = cs + TC;
      // GPU는 해당 프레임 제출(=CPU 기록 끝) 이후, 그리고 이전 GPU 작업이 끝난 뒤 시작
      const afterPrevGpu = i === 0 ? 0 : gpuEnd[i - 1];
      const gs = Math.max(cpuEnd[i], afterPrevGpu);
      gpuStart[i] = gs;
      gpuEnd[i] = gs + TG;
    }
    const totalT = Math.max(cpuEnd[FRAMES - 1], gpuEnd[FRAMES - 1]);
    const scale = (x1 - x0) / (totalT + 0.2);
    const tx = (t: number) => x0 + t * scale;

    const laneTop = 30;
    const laneH = 44;
    const gap = 40;
    const cpuY = laneTop;
    const gpuY = laneTop + laneH + gap;

    // 레인 라벨 + baseline
    const drawLaneBase = (y: number, name: string, color: string) => {
      label(ctx, pad + leftW / 2 - 4, y + laneH / 2, name, color, 13, 'bold');
      ctx.strokeStyle = withAlpha(theme.text, 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y + laneH + 6);
      ctx.lineTo(x1, y + laneH + 6);
      ctx.stroke();
    };
    drawLaneBase(cpuY, 'CPU', COLORS.cpu);
    drawLaneBase(gpuY, 'GPU', COLORS.gpu);

    // CPU idle 음영(기록 사이 빈 구간)
    for (let i = 1; i < FRAMES; i++) {
      const a = cpuEnd[i - 1];
      const b = cpuStart[i];
      if (b - a > 0.01) {
        roundRect(ctx, tx(a), cpuY + 4, (b - a) * scale, laneH - 8, 3);
        ctx.fillStyle = withAlpha(COLORS.idle, 0.3);
        ctx.fill();
        if ((b - a) * scale > 22) {
          label(ctx, tx(a) + ((b - a) * scale) / 2, cpuY + laneH / 2, 'wait', COLORS.fence, 12, 'bold');
        }
      }
    }

    // 블록 그리기
    const block = (x: number, y: number, ww: number, color: string, txt: string) => {
      roundRect(ctx, x + 1, y + 4, Math.max(2, ww - 2), laneH - 8, 4);
      ctx.fillStyle = withAlpha(color, 0.85);
      ctx.fill();
      if (ww > 16) {
        label(ctx, x + ww / 2, y + laneH / 2, txt, theme.bg, 12, 'bold');
      }
    };
    for (let i = 0; i < FRAMES; i++) {
      block(tx(cpuStart[i]), cpuY, (cpuEnd[i] - cpuStart[i]) * scale, COLORS.cpu, `F${i}`);
      block(tx(gpuStart[i]), gpuY, (gpuEnd[i] - gpuStart[i]) * scale, COLORS.gpu, `F${i}`);
      // present 마커(GPU 끝)
      const px = tx(gpuEnd[i]);
      ctx.fillStyle = COLORS.present;
      ctx.beginPath();
      ctx.moveTo(px, gpuY + laneH + 6);
      ctx.lineTo(px - 4, gpuY + laneH + 13);
      ctx.lineTo(px + 4, gpuY + laneH + 13);
      ctx.closePath();
      ctx.fill();
      // submit 화살표: CPU 기록 끝 → GPU 시작
      if ((gpuStart[i] - cpuEnd[i]) * scale < 40) {
        drawArrow(ctx, tx(cpuEnd[i]), cpuY + laneH + 2, tx(gpuStart[i]), gpuY - 2, withAlpha(theme.text, 0.3), 1.1, 5);
      }
    }

    // present 범례
    ctx.font = monoFont(12);
    ctx.fillStyle = COLORS.present;
    ctx.textAlign = 'left';
    ctx.fillText('▲ present', x0, gpuY + laneH + 26);
    ctx.textAlign = 'start';
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ width: '100%', height: 220, maxWidth: 400, display: 'block' }}
      />
      <figcaption>
        위 레인은 <span style={{ color: COLORS.cpu }}>CPU가 프레임을 기록</span>하는 시간,
        아래는 <span style={{ color: COLORS.gpu }}>GPU가 그 프레임을 실행</span>하는 시간입니다
        (<span style={{ color: COLORS.present }}>▲ = present</span>). 이 그림은{' '}
        <strong>frames in flight = 1</strong>인 경우입니다: CPU는 프레임 N을 제출한 뒤 GPU가 그 프레임을
        끝낼 때까지 다음 프레임 기록을 시작하지 못해 <span style={{ color: COLORS.fence }}>wait</span>{' '}
        구간이 생깁니다 — CPU와 GPU가 번갈아 유휴 상태가 됩니다. frames in flight를 2~3으로 늘리면 CPU가 GPU보다
        한두 프레임 앞서 달릴 수 있어 두 레인이 겹치고, 빈 구간이 사라져 처리량이 올라갑니다. 이것이
        double/triple buffering의 정체입니다: GPU가 N을 그리는 동안 CPU가 N+1을 기록합니다. 공짜는
        아닙니다 — F가 클수록 입력 지연(latency)이 커지고, 프레임마다 별도의 버퍼·자원이 필요해집니다.
        그리고 “F개 넘게 앞서지 않기”를 강제하려면 CPU가 GPU의 진행을 <em>알아야</em> 합니다 — 다음의 fence입니다.
      </figcaption>
    </figure>
  );
}
