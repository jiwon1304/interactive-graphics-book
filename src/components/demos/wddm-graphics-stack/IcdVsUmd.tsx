import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, drawArrow, monoFont, withAlpha, wrapText } from './wgs2d';

// IcdVsUmd (정적): 같은 커널(Dxgkrnl/VidMm/VidSch + KMD + GPU) 위에
// D3D(runtime + UMD) 와 Vulkan(loader + ICD) 두 user-mode 경로가 얹힌다.
// ICD가 UMD에 상당. 메모리 관리 위치가 다름(D3D는 드라이버/런타임이 더, Vulkan은 앱이 직접).

interface Node {
  fill: string;
  title: string;
  sub: string;
}

const D3D_NODES: Node[] = [
  { fill: COLORS.app, title: 'D3D 앱', sub: 'Draw / Present' },
  { fill: COLORS.runtime, title: 'D3D Runtime', sub: 'd3d11/12.dll · DDI' },
  { fill: COLORS.umd, title: 'UMD (IHV)', sub: '셰이더 JIT · cmd buffer' },
];

const VK_NODES: Node[] = [
  { fill: COLORS.app, title: 'Vulkan 앱', sub: 'VkDeviceMemory 직접' },
  { fill: COLORS.runtime, title: 'Vulkan Loader', sub: 'vulkan-1.dll · dispatch' },
  { fill: COLORS.umd, title: 'ICD (IHV)', sub: '= UMD: cmd buffer' },
];

export default function IcdVsUmd() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const padX = Math.max(10, w * 0.03);
    const gap = 12;
    const colW = (w - padX * 2 - gap) / 2;
    const d3dX = padX;
    const vkX = padX + colW + gap;
    const top = 28;
    const nodeH = 44;
    const nodeGap = 13;
    const titlePx = 11.5;
    const subPx = 10;

    // 컬럼 제목
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = monoFont(13, 'bold');
    ctx.fillStyle = theme.text;
    ctx.fillText('Direct3D', d3dX + colW / 2, 13);
    ctx.fillText('Vulkan', vkX + colW / 2, 13);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    const drawColumn = (x: number, nodes: Node[]) => {
      let y = top;
      nodes.forEach((nd, i) => {
        box(ctx, x, y, colW, nodeH, nd.fill, '', theme);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = monoFont(titlePx, 'bold');
        ctx.fillStyle = theme.text;
        ctx.fillText(nd.title, x + colW / 2, y + nodeH / 2 - 7);
        ctx.font = monoFont(subPx);
        ctx.fillStyle = theme.muted;
        const subLines = wrapText(ctx, nd.sub, colW - 12, subPx);
        // sub 한 줄만 들어가게 설계했지만, 좁으면 첫 줄만
        ctx.fillText(subLines[0] ?? nd.sub, x + colW / 2, y + nodeH / 2 + 9);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        y += nodeH;
        if (i < nodes.length - 1) {
          drawArrow(ctx, x + colW / 2, y + 2, x + colW / 2, y + nodeGap - 2, theme.muted, 1.5, 5);
          y += nodeGap;
        }
      });
      return y;
    };

    const yD3d = drawColumn(d3dX, D3D_NODES);
    const yVk = drawColumn(vkX, VK_NODES);
    let y = Math.max(yD3d, yVk) + nodeGap;

    // user/kernel 경계 점선(두 컬럼 폭 전체)
    const lineY = y;
    ctx.strokeStyle = withAlpha(theme.text, 0.5);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padX, lineY);
    ctx.lineTo(w - padX, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = monoFont(9.5, 'bold');
    const tag = 'user / kernel';
    const tw = ctx.measureText(tag).width + 12;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(w - padX - tw, lineY - 8, tw, 16);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, w - padX - 6, lineY);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // 두 경로가 같은 커널로 합류
    drawArrow(ctx, d3dX + colW / 2, lineY + 2, w / 2 - 30, lineY + 20, theme.muted, 1.5, 6);
    drawArrow(ctx, vkX + colW / 2, lineY + 2, w / 2 + 30, lineY + 20, theme.muted, 1.5, 6);
    y = lineY + 26;

    // 공유 커널 박스
    const kernW = w - padX * 2;
    const kernH = 58;
    box(ctx, padX, y, kernW, kernH, COLORS.kernel, '', theme, { alpha: 0.16 });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = monoFont(12.5, 'bold');
    ctx.fillStyle = theme.text;
    ctx.fillText('공유: Dxgkrnl → KMD → GPU', w / 2, y + 20);
    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.fillText('같은 D3DKMT* · GPUVA · residency', w / 2, y + 40);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    void h;
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ width: '100%', maxWidth: 400, height: 440, display: 'block' }}
      />
      <figcaption>
        Windows에서 Vulkan은 별도 드라이버 스택이 아닙니다. <span style={{ color: COLORS.runtime }}>
        Vulkan loader</span>(<code>vulkan-1.dll</code>)는 D3D runtime 자리에 해당하는데, 앱의 Vulkan
        호출을 <strong>trampoline/dispatch</strong>로 받아 적절한 드라이버로 보냅니다. 그 드라이버가
        <span style={{ color: COLORS.umd }}> ICD</span>(installable client driver)이고, ICD는 사실상
        <strong> UMD에 상당</strong>합니다 — 셰이더 컴파일과 command buffer 생성을 합니다(loader는
        레지스트리에서 ICD manifest를 찾아 DLL을 로드). 그 아래는 <strong>똑같은</strong>
        <span style={{ color: COLORS.kernel }}> Dxgkrnl/VidMm/VidSch</span>와 KMD·GPU입니다 — 같은
        D3DKMT* 제출 경로, 같은 GPUVA, 같은 residency 보장. 가장 큰 차이는 위쪽에 있습니다: Vulkan은
        <strong> VkDeviceMemory</strong>로 메모리 할당·배치를 앱이 직접 결정하는 반면, D3D11은 그 결정을
        runtime/드라이버가 더 많이 대신합니다.
      </figcaption>
    </figure>
  );
}
