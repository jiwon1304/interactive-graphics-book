import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { UE_COLORS, roundRect, withAlpha, monoFont } from './ue2d';

// ---------------------------------------------------------------------------
// 정적 도식: TDR (Timeout Detection and Recovery) — 2초 타임아웃
//
// 출처: Luke Thatcher (Epic) 발표.
// - GPU 크래시가 나도 CPU가 인식하는 건 약 2초 뒤.
// - TDR: OS가 정한 시간 안에 GPU 작업이 끝나지 않으면 프로세스를 강제 종료.
//   Windows 기본값 = 2초.
// - 예시 #1: 잘못된 주소 참조 → 큰 수로 루프 → 행(hang) → OS가 종료(TDR).
//
// 이 그림은 같은 2초 축 위에 두 작업을 정지시켜 임계 규칙을 보여준다
// (인터랙티브 아님):
//   (위) 정상: 작업이 2초 전에 끝남 → ✅ 정상 완료.
//   (아래) 행(hang): 끝나지 않고 길어짐 → t=2.0s에서 OS가 강제 종료(TDR).
// ---------------------------------------------------------------------------

const CANVAS_H = 320;
const CANVAS_MAXW = 360; // 모바일 우선: 내부 렌더 폭 상한(360px 화면에서 글자가 1:1로 보이게)
const TDR_LIMIT = 2.0; // 초 (Windows 기본)
const AXIS_MAX = 2.6; // 축 최대(2초 마커가 가운데쯤 오도록)

const OK_LEN = 1.2; // 정상 작업 길이(초)

interface JobFig {
  title: string;
  /** 막대를 어디까지 채울지(초). TDR면 2.0에서 잘림. */
  fillTo: number;
  /** hang(끝없이 길어짐)이면 화살표로 표시 */
  hang: boolean;
  tdr: boolean;
  verdict: string;
  color: string;
}

const JOBS: ReadonlyArray<JobFig> = [
  {
    title: '정상: 작업 길이 1.2s',
    fillTo: OK_LEN,
    hang: false,
    tdr: false,
    verdict: '✅ 정상 완료 — GPU 작업이 2초 안에 끝남',
    color: UE_COLORS.ok,
  },
  {
    title: '행(hang): 잘못된 주소로 무한 루프 (발표 예시 #1)',
    fillTo: TDR_LIMIT, // 2.0초에서 OS가 자름
    hang: true,
    tdr: true,
    verdict: '⛔ TDR: OS가 2.0s에서 미완료 GPU를 강제 종료 (드라이버 리셋)',
    color: UE_COLORS.bad,
  },
];

export default function TdrCountdown() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 16;
    const plotX = padX;
    const plotW = w - padX * 2;
    const xOf = (t: number): number => plotX + (Math.min(t, AXIS_MAX) / AXIS_MAX) * plotW;

    // 제목
    ctx.font = monoFont(13);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('GPU 작업 — TDR 2초 타임아웃', plotX, 20);

    const rowTop = 40;
    const barH = 40;
    const rowGap = 64; // 막대 + 라벨 + 판정 공간
    const tx = xOf(TDR_LIMIT);

    const drawJob = (job: JobFig, top: number): void => {
      const barY = top;

      // 작업 제목
      ctx.font = monoFont(12);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(job.title, plotX, barY - 6);

      // 트랙
      roundRect(ctx, plotX, barY, plotW, barH, 8);
      ctx.fillStyle = withAlpha(theme.border, 0.3);
      ctx.fill();
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.stroke();

      // 채워진 진행분
      const fillW = (Math.min(job.fillTo, AXIS_MAX) / AXIS_MAX) * plotW;
      roundRect(ctx, plotX, barY, Math.max(2, fillW), barH, 8);
      ctx.fillStyle = withAlpha(job.color, 0.85);
      ctx.fill();

      if (job.hang) {
        // 끝없이 길어짐을 나타내는 화살표(2초 잘림 지점에서 오른쪽으로)
        const ay = barY + barH / 2;
        ctx.strokeStyle = job.color;
        ctx.fillStyle = job.color;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(plotX + fillW, ay);
        ctx.lineTo(plotX + plotW - 4, ay);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(plotX + plotW - 4, ay);
        ctx.lineTo(plotX + plotW - 12, ay - 5);
        ctx.lineTo(plotX + plotW - 12, ay + 5);
        ctx.closePath();
        ctx.fill();
        ctx.font = monoFont(12);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('영원히…', plotX + fillW / 2, ay);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      } else {
        // 작업 끝 점선 마커
        const lx = xOf(job.fillTo);
        ctx.strokeStyle = withAlpha(theme.text, 0.4);
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx, barY - 4);
        ctx.lineTo(lx, barY + barH + 4);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = monoFont(12);
        ctx.fillStyle = theme.muted;
        ctx.textAlign = 'center';
        ctx.fillText('작업 끝', lx, barY + barH + 14);
        ctx.textAlign = 'left';
      }

      // 2초 TDR 한계 마커(빨간 굵은 선)
      ctx.strokeStyle = UE_COLORS.bad;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(tx, barY - 12);
      ctx.lineTo(tx, barY + barH + 12);
      ctx.stroke();
      ctx.font = monoFont(12);
      ctx.fillStyle = UE_COLORS.bad;
      ctx.textAlign = 'center';
      ctx.fillText('TDR 2.0s', tx, barY - 16);
      ctx.textAlign = 'left';

      // 판정 바
      const vy = barY + barH + 20;
      roundRect(ctx, plotX, vy, plotW, 26, 6);
      ctx.fillStyle = withAlpha(job.color, 0.14);
      ctx.fill();
      ctx.strokeStyle = job.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = monoFont(11);
      ctx.fillStyle = job.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(job.verdict, plotX + plotW / 2, vy + 13);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    };

    drawJob(JOBS[0], rowTop);
    drawJob(JOBS[1], rowTop + barH + rowGap + 26);
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
        GPU가 작업을 마치지 못하고 멈추면, OS의 <strong>TDR</strong>(Timeout Detection and
        Recovery)이 개입합니다 — Windows 기본값은 <strong>2초</strong>입니다. 위 그림은 같은 2초 축
        위에 두 경우를 정지시킨 것입니다. <strong>위 막대(정상)</strong>는 작업이 1.2초에 끝나 2초
        한계(빨간 선)를 넘지 않으므로 ✅ 정상 완료됩니다. <strong>아래 막대(hang)</strong>는 잘못된
        주소를 참조해 큰 수로 루프를 돌다 끝나지 않고 길어지다가, 정확히 <strong>t=2.0초</strong>에서
        OS가 드라이버를 리셋하며 <strong>프로세스를 강제 종료</strong>합니다. 발표의 예시 #1이 바로 이
        경우였습니다. 중요한 점은 GPU 크래시를 CPU가 인식하는 건 보통 <strong>약 2초 뒤</strong>라는
        것 — 따라서 GPU hang은 발생 시점보다 약 2초 늦게 크래시로 보고됩니다. (출처: Luke Thatcher (Epic)
        발표.)
      </figcaption>
    </figure>
  );
}
