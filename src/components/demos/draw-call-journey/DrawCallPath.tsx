import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, label, drawArrow, withAlpha, monoFont } from './dcj2d';

// 드로우 콜 경로(정적, 천천히). 윗부분: 매 Draw마다 user 모드에서 도는 단계
// (Draw → runtime 검증 → DDI → UMD 변환 → command buffer append). 아랫부분: command buffer가
// 가득 차거나 Flush/Present 시에만 kernel로 제출(D3DKMTSubmitCommand) → residency → VidSch → GPU.
// 좁은 화면(모바일)에서는 세로로 쌓아 라벨이 넘치지 않게 한다.

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
    const { ctx, w, h, theme } = d;
    const narrow = w < 520;
    const pad = 10;

    if (!narrow) {
      // ---- 가로 레이아웃 ----
      const gap = 10;
      const colW = (w - pad * 2 - 3 * gap) / 4;
      const bh = 44;

      // Row 1: user 모드, per draw
      const y1 = 44;
      // per-draw 브래킷 + 캡션
      ctx.strokeStyle = withAlpha(theme.text, 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y1 - 10);
      ctx.lineTo(w - pad, y1 - 10);
      ctx.stroke();
      label(ctx, w / 2, y1 - 22, '매 Draw마다 — user mode CPU', theme.muted, 11, 'bold');

      USER_STEPS.forEach((b, i) => {
        const x = pad + i * (colW + gap);
        box(ctx, x, y1, colW, bh, b.c, b.t, theme, { px: 12, wrap: true });
        if (i > 0) drawArrow(ctx, x - gap + 1, y1 + bh / 2, x - 1, y1 + bh / 2, theme.muted, 1.6, 6);
      });

      // UMD → command buffer
      const cbX = pad + 3 * (colW + gap);
      const cbY = y1 + bh + 30;
      box(ctx, cbX, cbY, colW, 28, COLORS.umd, 'command buffer', theme, {
        px: 10,
        alpha: 0.3,
        wrap: true,
      });
      drawArrow(ctx, cbX + colW / 2, y1 + bh + 1, cbX + colW / 2, cbY - 1, COLORS.umd, 1.6, 6);
      label(ctx, cbX + colW / 2, y1 + bh + 16, 'append', theme.muted, 9, 'bold');

      // user / kernel 경계
      const y2 = cbY + 28 + 56;
      const lineY = cbY + 28 + 28;
      ctx.strokeStyle = withAlpha(theme.text, 0.5);
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(pad, lineY);
      ctx.lineTo(w - pad, lineY);
      ctx.stroke();
      ctx.setLineDash([]);
      // 경계 라벨(배경으로 선 덮기)
      ctx.font = monoFont(10, 'bold');
      const tw = ctx.measureText('user / kernel 경계').width + 12;
      ctx.fillStyle = theme.bg;
      ctx.fillRect(w - pad - tw, lineY - 8, tw, 16);
      label(ctx, w - pad - tw / 2, lineY, 'user / kernel 경계', theme.muted, 10, 'bold');

      // 제출 화살표(빨강) command buffer → kernel
      drawArrow(ctx, cbX + colW / 2, cbY + 28 + 1, cbX + colW / 2, lineY - 1, COLORS.submit, 1.8, 7);
      label(ctx, cbX + colW / 2, cbY + 28 + 14, 'Flush/Present', COLORS.submit, 9, 'bold');
      // kernel → 첫 박스로 잇기
      drawArrow(ctx, cbX + colW / 2, lineY + 1, pad + colW / 2, y2 - 1, theme.muted, 1.6, 6);

      // Row 2: kernel + GPU
      KERNEL_STEPS.forEach((b, i) => {
        const x = pad + i * (colW + gap);
        box(ctx, x, y2, colW, bh, b.c, b.t, theme, { px: 11, wrap: true });
        if (i > 0) drawArrow(ctx, x - gap + 1, y2 + bh / 2, x - 1, y2 + bh / 2, theme.muted, 1.6, 6);
      });
      label(ctx, w / 2, y2 + bh + 16, '제출 1회로 수백~수천 draw 처리 (분할 상환)', theme.muted, 11, 'bold');
      return;
    }

    // ---- 세로 레이아웃 (모바일) ----
    const colW = w - pad * 2;
    const bh = 34;
    const vgap = 24;
    let y = 26;

    label(ctx, w / 2, 12, '매 Draw마다 — user mode CPU', theme.muted, 11, 'bold');
    USER_STEPS.forEach((b, i) => {
      box(ctx, pad, y, colW, bh, b.c, b.t, theme, { px: 12 });
      if (i < USER_STEPS.length - 1) {
        drawArrow(ctx, w / 2, y + bh + 1, w / 2, y + bh + vgap - 1, theme.muted, 1.6, 6);
      }
      y += bh + (i < USER_STEPS.length - 1 ? vgap : 0);
    });

    // command buffer
    y += vgap;
    drawArrow(ctx, w / 2, y - vgap + bh - 33, w / 2, y - 1, COLORS.umd, 1.6, 6);
    box(ctx, pad + colW * 0.18, y, colW * 0.64, 28, COLORS.umd, 'command buffer', theme, {
      px: 11,
      alpha: 0.3,
    });
    y += 28;

    // 경계
    const lineY = y + vgap / 2 + 2;
    drawArrow(ctx, w / 2, y + 1, w / 2, lineY - 9, COLORS.submit, 1.8, 7);
    label(ctx, w / 2 + 48, y + 12, 'Flush', COLORS.submit, 9, 'bold');
    ctx.strokeStyle = withAlpha(theme.text, 0.5);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pad, lineY);
    ctx.lineTo(w - pad, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = monoFont(9, 'bold');
    const tw = ctx.measureText('user / kernel').width + 10;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(pad, lineY - 7, tw, 14);
    label(ctx, pad + tw / 2, lineY, 'user / kernel', theme.muted, 9, 'bold');
    y = lineY + vgap / 2 + 2;

    label(ctx, w / 2, y - 4, '제출 시에만 — 분할 상환', theme.muted, 10, 'bold');
    y += 12;
    KERNEL_STEPS.forEach((b, i) => {
      box(ctx, pad, y, colW, bh, b.c, b.t, theme, { px: 11 });
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
        style={{ height: 'min(78vw, 560px)', maxHeight: 560, minHeight: 300, display: 'block' }}
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
