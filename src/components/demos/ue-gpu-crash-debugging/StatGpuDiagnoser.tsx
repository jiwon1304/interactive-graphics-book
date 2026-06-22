import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { UE_COLORS, roundRect, withAlpha, monoFont } from './ue2d';

// ---------------------------------------------------------------------------
// 정적 도식: Stat GPU — Busy / Wait / Idle 진단 (Luke Thatcher (Epic) 발표)
//
// 각 GPU 큐(그래픽스/컴퓨트)의 시간은 Busy / Wait / Idle로 쪼개진다.
// 발표의 진단 규칙(직관에 반함):
//  - 그래픽스 큐의 Wait이 크면 → 문제 (큐가 펜스/리소스를 기다림).
//  - 컴퓨트 큐의 Wait → 정상 (AsyncCompute는 wait이 자연스러움).
//  - Idle > 0 → CPU bound (CPU가 일감을 못 대줘 GPU가 굶음).
//
// 이 그림은 세 시나리오를 한 화면에 나란히 정지시켜, "같은 Wait 막대라도
// 어느 큐에 있느냐에 따라 결론이 정반대"가 됨을 각 패널의 판정 라벨로 보여준다
// (인터랙티브 아님).
// ---------------------------------------------------------------------------

const CANVAS_H = 440;
const CANVAS_MAXW = 360; // 모바일 우선: 내부 렌더 폭 상한

interface QueueBar {
  name: string;
  busy: number;
  wait: number;
  idle: number;
  /** 이 큐의 Wait이 "문제"로 칠해져야 하는가(그래픽스 큐만 빨강) */
  waitIsBad: boolean;
}

interface ScenarioFig {
  title: string;
  queues: QueueBar[];
  verdict: string;
  verdictColor: string;
}

// 세 대표 시나리오(발표의 진단 규칙을 그대로 박아 둔다).
const SCENARIOS: ReadonlyArray<ScenarioFig> = [
  {
    title: '① 그래픽스 큐 Wait이 큼',
    queues: [
      { name: '그래픽스', busy: 47, wait: 45, idle: 0, waitIsBad: true },
      { name: '컴퓨트', busy: 80, wait: 20, idle: 0, waitIsBad: false },
    ],
    verdict: '⚠ 문제: 그래픽스 큐가 펜스·리소스 대기로 멈춤',
    verdictColor: UE_COLORS.bad,
  },
  {
    title: '② 컴퓨트 큐 Wait이 큼 (같은 양의 Wait)',
    queues: [
      { name: '그래픽스', busy: 94, wait: 6, idle: 0, waitIsBad: true },
      { name: '컴퓨트', busy: 45, wait: 55, idle: 0, waitIsBad: false },
    ],
    verdict: '정상: AsyncCompute는 그래픽스 결과를 기다리도록 설계 — Wait이 보이는 게 자연스러움',
    verdictColor: UE_COLORS.ok,
  },
  {
    title: '③ Idle > 0',
    queues: [
      { name: '그래픽스', busy: 55, wait: 10, idle: 35, waitIsBad: true },
      { name: '컴퓨트', busy: 55, wait: 15, idle: 30, waitIsBad: false },
    ],
    verdict: 'CPU bound: GPU가 다 비웠는데 CPU가 일감을 못 대줘 굶음 — GPU 최적화로는 안 빨라짐',
    verdictColor: UE_COLORS.stall,
  },
];

export default function StatGpuDiagnoser() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 16;
    const labelW = 64;
    const plotX = padX + labelW;
    const plotW = w - plotX - padX;

    // 범례(상단)
    ctx.font = monoFont(11);
    ctx.textBaseline = 'middle';
    const legend: Array<{ c: string; t: string }> = [
      { c: UE_COLORS.graphics, t: 'Busy' },
      { c: UE_COLORS.stall, t: 'Wait' },
      { c: withAlpha(theme.muted, 0.5), t: 'Idle' },
    ];
    let lx = plotX;
    for (const item of legend) {
      ctx.fillStyle = item.c;
      roundRect(ctx, lx, 8, 12, 12, 3);
      ctx.fill();
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.fillText(item.t, lx + 17, 14);
      lx += 17 + ctx.measureText(item.t).width + 16;
    }
    ctx.textBaseline = 'alphabetic';

    // 한 큐의 스택 막대.
    const drawQueue = (q: QueueBar, y: number, barH: number): void => {
      ctx.font = monoFont(10.5);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(q.name, plotX - 8, y + barH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // 배경 트랙
      roundRect(ctx, plotX, y, plotW, barH, 6);
      ctx.fillStyle = withAlpha(theme.border, 0.25);
      ctx.fill();

      const segs: Array<{ frac: number; color: string; label: string }> = [
        { frac: q.busy / 100, color: UE_COLORS.graphics, label: 'Busy' },
        {
          frac: q.wait / 100,
          // 그래픽스 Wait은 빨강(문제), 컴퓨트 Wait은 주황(정상이지만 wait).
          color: q.waitIsBad && q.wait >= 25 ? UE_COLORS.bad : UE_COLORS.stall,
          label: 'Wait',
        },
        { frac: q.idle / 100, color: withAlpha(theme.muted, 0.45), label: 'Idle' },
      ];
      let x = plotX;
      for (const s of segs) {
        const sw = s.frac * plotW;
        if (sw <= 0.5) continue;
        ctx.save();
        roundRect(ctx, plotX, y, plotW, barH, 6);
        ctx.clip();
        ctx.fillStyle = s.color;
        ctx.fillRect(x, y, sw, barH);
        ctx.restore();
        if (sw > 40) {
          ctx.font = monoFont(11);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${s.label} ${Math.round(s.frac * 100)}`, x + sw / 2, y + barH / 2);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
        }
        x += sw;
      }

      roundRect(ctx, plotX, y, plotW, barH, 6);
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    // 시나리오 패널들을 세로로 쌓는다.
    const topStart = 30;
    const panelGap = 8;
    const panelH = (h - topStart - padX - panelGap * (SCENARIOS.length - 1)) / SCENARIOS.length;
    const barH = 26;
    const barGap = 6;
    const verdictH = 26;

    for (let s = 0; s < SCENARIOS.length; s++) {
      const sc = SCENARIOS[s];
      const py = topStart + s * (panelH + panelGap);

      // 시나리오 제목
      ctx.font = monoFont(11);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(sc.title, padX, py + 10);

      // 두 큐 막대
      const barsTop = py + 18;
      for (let qi = 0; qi < sc.queues.length; qi++) {
        drawQueue(sc.queues[qi], barsTop + qi * (barH + barGap), barH);
      }

      // 판정 배너
      const vy = barsTop + sc.queues.length * (barH + barGap) + 2;
      roundRect(ctx, padX, vy, w - padX * 2, verdictH, 6);
      ctx.fillStyle = withAlpha(sc.verdictColor, 0.14);
      ctx.fill();
      ctx.strokeStyle = withAlpha(sc.verdictColor, 0.7);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = monoFont(11);
      ctx.fillStyle = sc.verdictColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      // 한 줄로 — 폭이 좁으면 줄여 그리되 핵심 결론 유지.
      ctx.fillText(sc.verdict, padX + 10, vy + verdictH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
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
        <strong>Stat GPU</strong>는 각 큐의 시간을 <strong>Busy / Wait / Idle</strong>로 쪼개
        보여줍니다 (Luke Thatcher (Epic) 발표). 핵심 진단 규칙은 직관적이지 않습니다 — 위 세 패널이
        "같은 막대, 다른 결론"을 한눈에 보여 줍니다. ①과 ②는 <em>똑같은 양의 Wait</em>이지만, ①처럼{' '}
        <strong>그래픽스 큐에 있으면 문제</strong>(메인 큐가 펜스·리소스를 기다리며 멈춤)이고 ②처럼{' '}
        <strong>컴퓨트 큐에 있으면 정상</strong>입니다(AsyncCompute는 그래픽스 결과를 기다리도록
        설계됐으니까요). ③처럼 어느 큐든 <strong>Idle &gt; 0이면 CPU bound</strong> — GPU가 다
        처리했는데 CPU가 다음 일감을 못 만들어 GPU가 굶고 있는 상황이라, GPU를 아무리 최적화해도
        프레임이 빨라지지 않습니다. 각 패널 아래의 <em>판정 라벨</em>이 이 규칙의 결론입니다.
      </figcaption>
    </figure>
  );
}
