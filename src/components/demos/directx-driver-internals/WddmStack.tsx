import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, label, drawArrow, withAlpha, monoFont } from './dxd2d';

// WDDM 그래픽스 스택(정적): App → D3D runtime → UMD →[user/kernel]→ Dxgkrnl(VidMM/VidSch) → KMD → GPU.

export default function WddmStack() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const bx = Math.max(12, w * 0.06);
    const bw = w - bx * 2;
    const n = 6;
    const gap = 14;
    const top = 10;
    const bh = (h - top - 12 - gap * (n - 1) - 22) / n; // 22 = 경계선 여유

    let y = top;
    const layer = (fill: string, title: string, sub: string, extra = 0) => {
      box(ctx, bx, y, bw, bh, fill, '', theme);
      label(ctx, bx + bw / 2, y + bh / 2 - 7, title, theme.text, 13, 'bold');
      label(ctx, bx + bw / 2, y + bh / 2 + 10, sub, theme.muted, 10);
      const cy = y;
      y += bh + gap + extra;
      return cy;
    };

    layer(COLORS.app, '애플리케이션', 'Draw / SetState / Map / Present');
    drawArrow(ctx, w / 2, y - gap - 1, w / 2, y - 2, theme.muted, 1.6, 6);
    layer(COLORS.runtime, 'D3D Runtime', 'd3d9.dll · d3d11.dll · d3d12.dll — 검증 · DDI');
    drawArrow(ctx, w / 2, y - gap - 1, w / 2, y - 2, theme.muted, 1.6, 6);

    // UMD (user/kernel 경계 직전)
    const umdY = y;
    box(ctx, bx, umdY, bw, bh, COLORS.umd, '', theme);
    label(ctx, bx + bw / 2, umdY + bh / 2 - 7, 'UMD (user-mode driver)', theme.text, 13, 'bold');
    label(ctx, bx + bw / 2, umdY + bh / 2 + 10, '셰이더 JIT(ISA) · command buffer 생성', theme.muted, 10);
    y += bh + gap;

    // user / kernel 경계
    const lineY = y - gap / 2 - 1;
    ctx.strokeStyle = withAlpha(theme.text, 0.5);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx, lineY);
    ctx.lineTo(bx + bw, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = monoFont(10, 'bold');
    ctx.fillStyle = theme.bg;
    const tw = ctx.measureText('user / kernel').width + 10;
    ctx.fillRect(bx + bw - tw, lineY - 7, tw, 14);
    label(ctx, bx + bw - tw / 2, lineY, 'user / kernel', theme.muted, 10, 'bold');
    y += 10;

    drawArrow(ctx, w / 2, y - 9, w / 2, y - 1, theme.muted, 1.6, 6);
    // Dxgkrnl + 서브노드
    const kY = y;
    box(ctx, bx, kY, bw, bh, COLORS.kernel, '', theme);
    label(ctx, bx + bw / 2, kY + bh / 2 - 8, 'Dxgkrnl (그래픽스 커널)', theme.text, 13, 'bold');
    // 서브칩 VidMM / VidSch
    const chipW = Math.min(140, bw * 0.32);
    const chy = kY + bh / 2 + 4;
    box(ctx, bx + bw / 2 - chipW - 6, chy - 8, chipW, 17, COLORS.kernel, 'VidMM (residency)', theme, { px: 9, alpha: 0.28, r: 4 });
    box(ctx, bx + bw / 2 + 6, chy - 8, chipW, 17, COLORS.kernel, 'VidSch (scheduler)', theme, { px: 9, alpha: 0.28, r: 4 });
    y += bh + gap;
    drawArrow(ctx, w / 2, y - gap - 1, w / 2, y - 2, theme.muted, 1.6, 6);

    box(ctx, bx, y, bh > 0 ? bw : bw, bh, COLORS.gpu, '', theme);
    label(ctx, bx + bw / 2, y + bh / 2 - 7, 'KMD + GPU', theme.text, 13, 'bold');
    label(ctx, bx + bw / 2, y + bh / 2 + 10, 'ring buffer · GPU engines', theme.muted, 10);
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 420, display: 'block' }} />
      <figcaption>
        Windows의 WDDM 그래픽스 스택. <span style={{ color: COLORS.runtime }}>D3D runtime</span>
        (<code>d3d9/11/12.dll</code>)은 API 호출을 검증하고 <strong>DDI</strong>(device driver
        interface)로 user-mode driver를 호출합니다. <span style={{ color: COLORS.umd }}>UMD</span>는
        IHV가 제공하는 user 공간 DLL로, 셰이더 바이트코드를 하드웨어 ISA로 JIT 컴파일하고 API 명령을
        하드웨어 <strong>command buffer</strong>로 변환합니다. 여기까지가 user 모드 — 프로세스 안에서
        커널 진입 없이 돕니다. command buffer를 제출할 때 비로소 <span style={{ color: COLORS.kernel }}>
        Dxgkrnl</span>로 내려가는데, <strong>VidMM</strong>이 참조 allocation의 residency를 보장하고
        <strong>VidSch</strong>가 GPU 엔진의 ring buffer에 스케줄합니다. KMD는 실제 하드웨어 레지스터·
        doorbell을 건드립니다. (WDDM 2.0 이전에는 VidMM이 command buffer의 patch list로 물리주소를
        메웠지만, WDDM 2.0의 per-process GPUVA 이후로는 UMD가 가상주소를 직접 기록합니다.)
        <strong> 이 레이어 구조는 DX9·11·12가 공유합니다.</strong>
        세 API의 차이는 “어느 레이어가 무엇을, 언제 하느냐”의 분담에 있습니다.
      </figcaption>
    </figure>
  );
}
