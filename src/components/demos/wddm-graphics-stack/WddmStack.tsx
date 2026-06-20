import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, label, drawArrow, withAlpha, monoFont, wrapText, type ThemeColors } from './wgs2d';

// WDDM 그래픽스 스택(정적, 상세판). 각 레이어의 역할 한 줄 + user/kernel 경계.
// App → D3D runtime → UMD →[user/kernel]→ Dxgkrnl(VidMm/VidSch) → KMD → GPU.
// directx-driver-internals/WddmStack 보다 자세히: 메모리/스케줄 서브노드, 역할 wrapText.

interface Layer {
  fill: string;
  title: string;
  role: string;
}

const LAYERS: Layer[] = [
  { fill: COLORS.app, title: '애플리케이션', role: 'Draw / SetState / Map / Present 호출' },
  { fill: COLORS.runtime, title: 'D3D Runtime  (d3d9/11/12.dll)', role: '인자·상태 검증 후 DDI로 UMD 호출' },
  { fill: COLORS.umd, title: 'UMD  (user-mode display driver)', role: 'IHV DLL: 셰이더 JIT(ISA) · command buffer 생성 · GPUVA 기록 · residency 추적' },
];

export default function WddmStack() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;
    const bx = Math.max(12, w * 0.05);
    const bw = w - bx * 2;
    const narrow = w < 460;
    const titlePx = narrow ? 11 : 12.5;
    const rolePx = narrow ? 9.5 : 10.5;
    const lineH = rolePx + 3;
    const gap = narrow ? 16 : 18;
    const pad = 9;
    const inner = bw - pad * 2;

    // 각 레이어 높이를 역할 텍스트 줄 수로 계산
    const heights = LAYERS.map((l) => {
      const lines = wrapText(ctx, l.role, inner, rolePx);
      return Math.max(narrow ? 46 : 44, pad + titlePx + 6 + lines.length * lineH + pad);
    });
    // Dxgkrnl + KMD/GPU 는 별도 계산(서브노드 포함)
    const kernelH = narrow ? 92 : 84;
    const gpuH = narrow ? 48 : 46;

    let y = 8;

    const drawLayer = (l: Layer, bh: number) => {
      box(ctx, bx, y, bw, bh, l.fill, '', theme);
      // title을 좌측 정렬로 직접 그림(label 헬퍼는 center 정렬)
      ctx.textAlign = 'left';
      ctx.font = monoFont(titlePx, 'bold');
      ctx.fillStyle = theme.text;
      ctx.textBaseline = 'middle';
      ctx.fillText(l.title, bx + pad, y + pad + titlePx / 2);
      const lines = wrapText(ctx, l.role, inner, rolePx);
      ctx.font = monoFont(rolePx);
      ctx.fillStyle = theme.muted;
      let ly = y + pad + titlePx + 8;
      for (const ln of lines) {
        ctx.fillText(ln, bx + pad, ly);
        ly += lineH;
      }
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'start';
      y += bh;
    };

    const arrowDown = () => {
      drawArrow(ctx, bx + bw / 2, y + 2, bx + bw / 2, y + gap - 3, theme.muted, 1.6, 6);
      y += gap;
    };

    drawLayer(LAYERS[0], heights[0]);
    arrowDown();
    drawLayer(LAYERS[1], heights[1]);
    arrowDown();
    drawLayer(LAYERS[2], heights[2]);

    // user / kernel 경계선 (arrow 자리 가운데에)
    const lineY = y + gap / 2;
    ctx.strokeStyle = withAlpha(theme.text, 0.5);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx, lineY);
    ctx.lineTo(bx + bw, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = monoFont(9.5, 'bold');
    const tag = 'user / kernel';
    const tw = ctx.measureText(tag).width + 12;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(bx + bw - tw, lineY - 8, tw, 16);
    label(ctx, bx + bw - tw / 2, lineY, tag, theme.muted, 9.5, 'bold');
    drawArrow(ctx, bx + bw / 2, y + 2, bx + bw / 2, lineY - 7, theme.muted, 1.6, 6);
    drawArrow(ctx, bx + bw / 2, lineY + 7, bx + bw / 2, y + gap - 3, theme.muted, 1.6, 6);
    y += gap;

    // Dxgkrnl (서브노드 VidMm / VidSch)
    const kY = y;
    box(ctx, bx, kY, bw, kernelH, COLORS.kernel, '', theme);
    ctx.font = monoFont(titlePx, 'bold');
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Dxgkrnl  (DirectX 그래픽스 커널)', bx + pad, kY + pad + titlePx / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    // 서브칩 두 개를 세로(narrow) 또는 가로로
    const chipTop = kY + pad + titlePx + 8;
    const chipH = narrow ? 24 : 22;
    if (narrow) {
      const cw = bw - pad * 2;
      subChip(ctx, bx + pad, chipTop, cw, chipH, 'VidMm', '메모리·residency·paging', theme);
      subChip(ctx, bx + pad, chipTop + chipH + 6, cw, chipH, 'VidSch', '엔진 스케줄러·ring buffer 큐잉', theme);
    } else {
      const cw = (bw - pad * 2 - 10) / 2;
      subChip(ctx, bx + pad, chipTop, cw, chipH, 'VidMm', '메모리·residency·paging', theme);
      subChip(ctx, bx + pad + cw + 10, chipTop, cw, chipH, 'VidSch', '엔진 스케줄러·ring buffer', theme);
    }
    y += kernelH;
    arrowDown();

    // KMD + GPU
    box(ctx, bx, y, bw, gpuH, COLORS.gpu, '', theme);
    ctx.font = monoFont(titlePx, 'bold');
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('KMD  (display miniport)  →  GPU', bx + pad, y + gpuH / 2 - 7);
    ctx.font = monoFont(rolePx);
    ctx.fillStyle = theme.muted;
    ctx.fillText('하드웨어 레지스터·doorbell · GPU engines', bx + pad, y + gpuH / 2 + 9);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  };

  const subChip = (
    ctx: CanvasRenderingContext2D,
    x: number,
    yy: number,
    cw: number,
    ch: number,
    name: string,
    role: string,
    theme: ThemeColors,
  ) => {
    box(ctx, x, yy, cw, ch, COLORS.kernel, '', theme, { alpha: 0.3, r: 5 });
    ctx.font = monoFont(10, 'bold');
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x + 8, yy + ch / 2);
    ctx.font = monoFont(9);
    ctx.fillStyle = theme.muted;
    ctx.fillText(role, x + 8 + ctx.measureText(name + '  ').width + 6, yy + ch / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 540, display: 'block' }} />
      <figcaption>
        Windows의 WDDM(Windows Display Driver Model) 스택. 위 세 칸은 모두 <strong>user 모드 —
        애플리케이션 프로세스 안</strong>에서 돕니다. <span style={{ color: COLORS.runtime }}>D3D
        runtime</span>(<code>d3d9/11/12.dll</code>)이 호출을 검증하고 <strong>DDI</strong>(device
        driver interface)로 <span style={{ color: COLORS.umd }}>UMD</span>를 부릅니다. UMD는 IHV가
        제공하는 user 공간 DLL(예 <code>nvwgf2um.dll</code>)로, 셰이더를 하드웨어 ISA로 JIT하고 API
        명령을 <strong>command buffer</strong>로 변환합니다. command buffer를 제출할 때 비로소 커널의
        <span style={{ color: COLORS.kernel }}> Dxgkrnl</span>로 내려가는데, <strong>VidMm</strong>이
        참조 allocation의 residency를 보장하고 <strong>VidSch</strong>가 GPU 엔진의 ring buffer에
        스케줄합니다. <span style={{ color: COLORS.gpu }}>KMD</span>(display miniport)가 실제 레지스터·
        doorbell을 건드려 GPU를 깨웁니다. <strong>이 구조는 DX9·11·12가 공유</strong>하며, 뒤에서 보듯
        Windows Vulkan도 같은 커널 위에서 돕니다.
      </figcaption>
    </figure>
  );
}
