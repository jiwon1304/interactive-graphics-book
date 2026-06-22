import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, label, drawArrow, withAlpha, monoFont } from './dcj2d';

// 드로우 콜 경로(정적 1컷, 세로 스택). 윗부분: 매 Draw마다 user 모드에서 도는 단계
// (Draw → runtime 검증 → DDI → UMD 변환 → command buffer append). 아랫부분: command buffer가
// 가득 차거나 Flush/Present 시에만 kernel로 제출(D3DKMTSubmitCommand) → residency → VidSch → GPU.
// 모바일 우선: 항상 세로로 쌓아 좁은 내부폭(≤400)에서도 라벨이 넘치지 않게 한다.

const USER_STEPS = [
  { c: COLORS.app, t: 'Draw()' },
  { c: COLORS.runtime, t: 'Runtime 검증' },
  { c: COLORS.runtime, t: 'DDI 호출' },
  { c: COLORS.umd, t: 'UMD 변환' },
];

const KERNEL_STEPS = [
  { c: COLORS.kernel, t: 'KMT 제출' },
  { c: COLORS.kernel, t: 'VidMM residency' },
  { c: COLORS.kernel, t: 'VidSch ring' },
  { c: COLORS.gpu, t: 'GPU 실행' },
];

export default function DrawCallPath() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;
    const pad = 10;
    const colW = w - pad * 2;
    const bh = 34;
    const vgap = 24;
    let y = 28;

    label(ctx, w / 2, 13, '매 Draw마다 — user mode CPU', theme.muted, 12, 'bold');
    USER_STEPS.forEach((b, i) => {
      box(ctx, pad, y, colW, bh, b.c, b.t, theme, { px: 13 });
      if (i < USER_STEPS.length - 1) {
        drawArrow(ctx, w / 2, y + bh + 1, w / 2, y + bh + vgap - 1, theme.muted, 1.6, 6);
      }
      y += bh + (i < USER_STEPS.length - 1 ? vgap : 0);
    });

    // command buffer
    y += vgap;
    drawArrow(ctx, w / 2, y - vgap + bh - 33, w / 2, y - 1, COLORS.umd, 1.6, 6);
    label(ctx, w / 2 + 52, y - vgap + 4, 'append', theme.muted, 11, 'bold');
    box(ctx, pad + colW * 0.16, y, colW * 0.68, 28, COLORS.umd, 'command buffer', theme, {
      px: 12,
      alpha: 0.3,
    });
    y += 28;

    // 경계
    const lineY = y + vgap / 2 + 2;
    drawArrow(ctx, w / 2, y + 1, w / 2, lineY - 9, COLORS.submit, 1.8, 7);
    label(ctx, w / 2 + 52, y + 12, 'Flush', COLORS.submit, 11, 'bold');
    ctx.strokeStyle = withAlpha(theme.text, 0.5);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pad, lineY);
    ctx.lineTo(w - pad, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = monoFont(11, 'bold');
    const tw = ctx.measureText('user / kernel').width + 10;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(pad, lineY - 8, tw, 16);
    label(ctx, pad + tw / 2, lineY, 'user / kernel', theme.muted, 11, 'bold');
    y = lineY + vgap / 2 + 2;

    label(ctx, w / 2, y - 2, '제출 시에만 — 분할 상환', theme.muted, 12, 'bold');
    y += 14;
    KERNEL_STEPS.forEach((b, i) => {
      box(ctx, pad, y, colW, bh, b.c, b.t, theme, { px: 12 });
      if (i < KERNEL_STEPS.length - 1) {
        drawArrow(ctx, w / 2, y + bh + 1, w / 2, y + bh + vgap - 1, theme.muted, 1.6, 6);
      }
      y += bh + vgap;
    });
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ width: '100%', maxWidth: 400, height: 520, display: 'block' }}
      />
      <figcaption>
        한 번의 <code>Draw()</code>가 GPU에 닿기까지. <strong>윗줄은 매 draw마다, 전부 user 모드에서</strong>{' '}
        도는 부분입니다 — runtime이 인자·바인딩을 검증하고, DDI로 UMD를 호출하면, UMD가 현재 바인딩된
        상태·리소스를 그 하드웨어가 이해하는 명령으로 변환해 프로세스 메모리의{' '}
        <span style={{ color: COLORS.umd }}>command buffer</span>에 append합니다.{' '}
        <strong>여기엔 커널 진입이 없습니다.</strong> command buffer가 가득 차거나{' '}
        <code>Flush</code>/<code>Present</code>가 호출될 때 비로소{' '}
        <span style={{ color: COLORS.submit }}>커널로 제출</span>(<code>D3DKMTSubmitCommand</code>)되고,
        Dxgkrnl의 VidMM이 참조 allocation의 residency를 보장한 뒤 VidSch가 GPU 엔진의 ring buffer에
        넣습니다. WDDM 2.0의 GPUVA에서는 UMD가 가상주소를 직접 기록하므로 주소 patch 단계가 없습니다(2편).
        핵심: <strong>per-draw 비용은 거의 전부 윗줄(user CPU)</strong>이고, 비싼 user→kernel 전환은 제출
        단위로 분할 상환됩니다.
      </figcaption>
    </figure>
  );
}
