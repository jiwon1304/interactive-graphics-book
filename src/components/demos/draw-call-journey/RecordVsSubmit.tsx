import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, label, roundRect, withAlpha, monoFont, drawArrow } from './dcj2d';

// 정적 1컷: 한 프레임 draw 수(=DRAWS)를 제출당 PER_SUBMIT개씩 묶어 제출했을 때
// 커널 전환(user→kernel)이 분할 상환되는 모습을 한 상태로 고정해 그린다.
// 대표값으로 제출당 256 draws를 골랐다 — 제출 16회로 줄어 draw당 커널 비용이 작아지는
// "잘 배치된" 상태를 보인다. 위: 제출 묶음(칸). 아래: CPU/프레임 막대(기록+커널).
// 도식용 대표값(절대값 아님, 관계가 요점).

const DRAWS = 4096; // 한 프레임의 draw 수(고정)
const KERNEL_NS = 8000; // 제출 1회당 user→kernel 전환 대표 비용(ns)
const RECORD_NS = 250; // draw 1개 기록(user 변환) 대표 비용(ns)
const PER_SUBMIT = 256; // 대표값: 제출당 draw 수(잘 배치된 상태)

export default function RecordVsSubmit() {
  const submits = Math.ceil(DRAWS / PER_SUBMIT);
  const kernelTotalUs = (submits * KERNEL_NS) / 1000;
  const recordTotalUs = (DRAWS * RECORD_NS) / 1000;
  const kernelPerDrawNs = (submits * KERNEL_NS) / DRAWS;

  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;
    const pad = 12;

    // --- 위: 제출 묶음 시각화 ---
    // DRAWS개의 draw를 PER_SUBMIT씩 묶은 칸들. 칸 = 1회 제출.
    const topY = 16;
    const topH = 44;
    const trackX = pad;
    const trackW = w - pad * 2;
    label(ctx, pad, topY - 4, `${DRAWS} draws를 ${submits}회로 제출`, theme.muted, 12, 'bold');
    // 칸들 (칸 = 1회 제출), 각 칸 위에 제출 화살표
    const cell = trackW / submits;
    for (let i = 0; i < submits; i++) {
      const x = trackX + i * cell;
      roundRect(ctx, x + 0.5, topY + 8, Math.max(1, cell - 1.5), topH, 3);
      ctx.fillStyle = withAlpha(COLORS.umd, 0.18);
      ctx.fill();
      ctx.strokeStyle = withAlpha(COLORS.umd, 0.9);
      ctx.lineWidth = 1;
      ctx.stroke();
      if (cell > 18) {
        drawArrow(ctx, x + cell / 2, topY + 8 - 1, x + cell / 2, topY + 8 - 9, COLORS.submit, 1.4, 5);
      }
    }
    // 묶음 = 제출 1회 범례
    label(ctx, trackX + trackW / 2, topY + 8 + topH + 12, '칸 1개 = 제출 1회 = 커널 전환 1회', theme.muted, 12, 'bold');

    // --- 아래: CPU/프레임 막대 ---
    const barX = pad + 78;
    const barMaxW = w - barX - pad - 52;
    const baseY = topY + 8 + topH + 34;
    const barH = 26;

    // 기준 스케일: PER_SUBMIT=1(최악, 제출=DRAWS회)일 때의 커널 비용을 기준 max로.
    const kernelWorstUs = (DRAWS * KERNEL_NS) / 1000;
    const totalWorstUs = kernelWorstUs + recordTotalUs;
    const usToPx = barMaxW / (totalWorstUs * 1.02);

    // 막대: 이번 프레임 CPU = 기록(고정) + 커널(가변)
    const recordPx = recordTotalUs * usToPx;
    const kernelPx = kernelTotalUs * usToPx;
    label(ctx, pad, baseY + barH / 2, 'CPU/프레임', theme.muted, 12, 'bold');
    roundRect(ctx, barX, baseY, Math.max(1, recordPx), barH, 3);
    ctx.fillStyle = withAlpha(COLORS.umd, 0.85);
    ctx.fill();
    roundRect(ctx, barX + recordPx, baseY, Math.max(1, kernelPx), barH, 3);
    ctx.fillStyle = withAlpha(COLORS.submit, 0.85);
    ctx.fill();
    ctx.font = monoFont(12, 'bold');
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${(recordTotalUs + kernelTotalUs).toFixed(0)}µs`, barX + recordPx + kernelPx + 6, baseY + barH / 2);
    ctx.textBaseline = 'alphabetic';

    // 범례 — 세로로 쌓아 좁은 화면에서 넘치지 않게
    const ly = baseY + barH + 22;
    const legend: Array<[string, string]> = [
      ['기록 (user 변환, 고정)', COLORS.umd],
      ['커널 전환 (제출 × 전환비용)', COLORS.submit],
    ];
    let lx = barX;
    let lyCur = ly;
    ctx.font = monoFont(12);
    legend.forEach(([t, c]) => {
      const need = 18 + ctx.measureText(t).width + 18;
      if (lx + need > w - pad) {
        lx = barX;
        lyCur += 18;
      }
      roundRect(ctx, lx, lyCur - 8, 13, 13, 3);
      ctx.fillStyle = withAlpha(c, 0.85);
      ctx.fill();
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, lx + 18, lyCur - 1);
      ctx.textBaseline = 'alphabetic';
      lx += need;
    });

    // draw당 커널 비용 표시
    label(
      ctx,
      w / 2,
      lyCur + 22,
      `draw당 커널 비용 ≈ ${kernelPerDrawNs.toFixed(0)} ns  (제출 ${submits}회)`,
      kernelPerDrawNs > 40 ? COLORS.submit : COLORS.dx12,
      13,
      'bold',
    );
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ width: '100%', maxWidth: 400, height: 220, display: 'block' }}
      />
      <figcaption>
        한 프레임에 그릴 draw 수를 {DRAWS}개로 두고, 이를 <strong>제출당 {PER_SUBMIT}개씩</strong> 묶어{' '}
        {submits}회로 제출한 상태입니다(도식용 대표값). 위쪽의 칸 하나가 command buffer 한 개이자 제출 한
        번이고, 그때마다 비싼 user→kernel 전환이 한 번 일어납니다. 만약 draw마다 버퍼를 닫고 제출했다면{' '}
        <strong>{DRAWS}번의 전환</strong>이 일어나 아래 막대의 빨강(커널) 부분이 막대를 가득 채웠을 것입니다.
        제출을 {submits}회로 묶으면 그 <span style={{ color: COLORS.submit }}>커널 전환 총비용</span>이 작은
        조각으로 줄고, <strong>draw당 커널 비용</strong>도 약 {kernelPerDrawNs.toFixed(0)} ns까지 떨어집니다.
        기록(user 변환) 비용은 draw 수에 비례하므로 고정입니다. 이것이 1편에서 본 “비동기·배치”의 비용
        측면이고, Vulkan 문서가 “submission can be a high overhead operation … batch work into as few calls
        to <code>vkQueueSubmit</code> as possible”이라고 못 박는 이유입니다.
      </figcaption>
    </figure>
  );
}
