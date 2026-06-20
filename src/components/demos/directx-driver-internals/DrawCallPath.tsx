import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, label, drawArrow, withAlpha, monoFont } from './dxd2d';

// 드로우 콜 경로(정적): user 모드 per-draw 단계 → command buffer → 제출 시 kernel → GPU.

export default function DrawCallPath() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 10;
    const colW = (w - pad * 2 - 3 * 10) / 4;
    const bh = 46;

    // --- Row 1: user 모드, per draw ---
    const y1 = 40;
    const r1 = [
      { c: COLORS.app, t: 'Draw()' },
      { c: COLORS.runtime, t: 'Runtime 검증' },
      { c: COLORS.runtime, t: 'DDI 호출' },
      { c: COLORS.umd, t: 'UMD 변환' },
    ];
    r1.forEach((b, i) => {
      const x = pad + i * (colW + 10);
      box(ctx, x, y1, colW, bh, b.c, b.t, theme, { px: 12 });
      if (i > 0) drawArrow(ctx, x - 9, y1 + bh / 2, x - 1, y1 + bh / 2, theme.muted, 1.6, 6);
    });
    // per-draw 브래킷
    ctx.strokeStyle = withAlpha(theme.text, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, y1 - 9);
    ctx.lineTo(pad + colW * 4 + 30, y1 - 9);
    ctx.stroke();
    label(ctx, pad + (colW * 4 + 30) / 2, y1 - 20, '프레임당 수천 번 — user mode CPU', theme.muted, 11, 'bold');

    // UMD → command buffer
    const cbY = y1 + bh + 28;
    const cbW = colW * 1.4;
    const cbX = pad + colW * 3 + 30 - cbW + colW; // UMD 박스 아래 정렬
    const cbX2 = pad + (colW + 10) * 3;
    box(ctx, cbX2, cbY, colW, 30, COLORS.umd, 'command buffer', theme, { px: 10, alpha: 0.28 });
    void cbW;
    void cbX;
    drawArrow(ctx, cbX2 + colW / 2, y1 + bh + 1, cbX2 + colW / 2, cbY - 1, COLORS.umd, 1.6, 6);

    // --- Row 2: kernel + GPU, 제출 시 ---
    const y2 = cbY + 30 + 40;
    // user/kernel 경계 점선
    const lineY = (cbY + 30 + y2) / 2 - 6;
    ctx.strokeStyle = withAlpha(theme.text, 0.5);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pad, lineY);
    ctx.lineTo(w - pad, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = monoFont(10, 'bold');
    label(ctx, pad + 60, lineY - 9, '제출 시에만 ↓', COLORS.submit, 10, 'bold');
    ctx.fillStyle = theme.bg;
    const tw = ctx.measureText('user / kernel').width + 10;
    ctx.fillRect(w - pad - tw, lineY - 7, tw, 14);
    label(ctx, w - pad - tw / 2, lineY, 'user / kernel', theme.muted, 10, 'bold');

    drawArrow(ctx, cbX2 + colW / 2, cbY + 30 + 1, cbX2 + colW / 2, lineY - 1, COLORS.submit, 1.6, 6);
    label(ctx, cbX2 + colW / 2 + 4, cbY + 44, 'Flush / Present', COLORS.submit, 9, 'bold');

    const r2 = [
      { c: COLORS.kernel, t: '제출(KMT)' },
      { c: COLORS.kernel, t: 'VidMM residency' },
      { c: COLORS.kernel, t: 'VidSch ring' },
      { c: COLORS.gpu, t: 'GPU 실행' },
    ];
    r2.forEach((b, i) => {
      const x = pad + i * (colW + 10);
      box(ctx, x, y2, colW, bh, b.c, b.t, theme, { px: 11 });
      if (i > 0) drawArrow(ctx, x - 9, y2 + bh / 2, x - 1, y2 + bh / 2, theme.muted, 1.6, 6);
    });
    drawArrow(ctx, pad + colW / 2, lineY + 1, pad + colW / 2, y2 - 1, theme.muted, 1.6, 6);
    label(ctx, pad + (colW * 4 + 30) / 2, y2 + bh + 14, 'batched — 제출 1회로 다수 draw 처리', theme.muted, 11, 'bold');
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 320, display: 'block' }} />
      <figcaption>
        한 번의 <code>Draw()</code>가 GPU에 닿기까지. 윗줄은 <strong>매 draw마다, user 모드에서</strong>
        도는 부분입니다 — runtime이 인자·바인딩을 검증하고, DDI로 UMD를 호출하면, UMD가 현재 바인딩된
        상태·리소스를 하드웨어 명령으로 변환해 프로세스 메모리의 <span style={{ color: COLORS.umd }}>
        command buffer</span>에 append합니다. <strong>여기엔 커널 진입이 없습니다.</strong> command
        buffer가 가득 차거나 <code>Flush</code>/<code>Present</code>가 호출될 때 비로소
        <span style={{ color: COLORS.submit }}> 커널로 제출</span>(<code>D3DKMTSubmitCommand</code>)되고,
        Dxgkrnl의 VidMM이 참조 allocation의 residency를 보장한 뒤 VidSch가 ring buffer에 넣습니다(WDDM
        2.0 GPUVA에서는 UMD가 가상주소를 직접 기록하므로 주소 patch 단계가 없습니다). 즉
        <strong> per-draw 비용은 거의 전부 윗줄(user CPU)</strong>이고, 커널 전환은 제출 단위로 분할
        상환됩니다. DX12가 줄인 것이 바로 이 윗줄의 draw당 비용입니다.
      </figcaption>
    </figure>
  );
}
