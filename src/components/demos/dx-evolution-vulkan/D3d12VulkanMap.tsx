import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, roundRect, withAlpha, monoFont, wrapText } from './dev2d';

// D3D12 ↔ Vulkan 개념 1:1 대응(정적). 좌=D3D12, 우=Vulkan, 가운데 연결선.
// 같은 explicit 모델이라 개념이 거의 일대일 대응한다는 것을 한 장으로.
// 모바일에서 좁으므로 박스 텍스트는 wrapText로 줄바꿈.

interface Pair {
  d3d12: string;
  vulkan: string;
  note: string; // 가운데 라벨(역할). 매우 짧게.
}

const PAIRS: Pair[] = [
  { d3d12: 'PipelineState (PSO)', vulkan: 'VkPipeline', note: '파이프라인' },
  { d3d12: 'Root Signature', vulkan: 'VkPipelineLayout', note: '바인딩 레이아웃' },
  { d3d12: 'Descriptor Heap', vulkan: 'VkDescriptorSet', note: '디스크립터' },
  { d3d12: 'Command List', vulkan: 'VkCommandBuffer', note: '명령 기록' },
  { d3d12: 'Command Allocator', vulkan: 'VkCommandPool', note: '기록 메모리' },
  { d3d12: 'Command Queue', vulkan: 'VkQueue', note: '제출' },
  { d3d12: 'Fence', vulkan: 'VkFence / Semaphore', note: '동기화' },
  { d3d12: 'ResourceBarrier', vulkan: 'PipelineBarrier', note: 'hazard/전이' },
];

export default function D3d12VulkanMap() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 8;
    const headH = 26;
    const n = PAIRS.length;
    const rowGap = 7;
    const top = pad + headH + 6;
    const rowH = (h - top - pad - (n - 1) * rowGap) / n;

    const midGap = Math.min(96, w * 0.26); // 가운데 연결 영역 폭
    const colW = (w - pad * 2 - midGap) / 2;
    const leftX = pad;
    const rightX = pad + colW + midGap;
    const px = colW < 120 ? 9 : 10;

    // 헤더
    const head = (x: number, text: string, c: string) => {
      ctx.fillStyle = withAlpha(c, 0.9);
      roundRect(ctx, x + 2, pad, colW - 4, headH - 4, 6);
      ctx.fill();
      ctx.font = monoFont(12, 'bold');
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + colW / 2, pad + (headH - 4) / 2);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    };
    head(leftX, 'D3D12', COLORS.dx12);
    head(rightX, 'Vulkan', COLORS.vulkan);

    PAIRS.forEach((p, i) => {
      const y = top + i * (rowH + rowGap);
      const cy = y + rowH / 2;

      // 연결선 + 가운데 역할 라벨
      ctx.strokeStyle = withAlpha(theme.text, 0.28);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(leftX + colW, cy);
      ctx.lineTo(rightX, cy);
      ctx.stroke();
      // 양끝 점
      ctx.fillStyle = withAlpha(theme.text, 0.5);
      for (const dotx of [leftX + colW, rightX]) {
        ctx.beginPath();
        ctx.arc(dotx, cy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // 역할 라벨(연결선 위)
      ctx.font = monoFont(8, 'bold');
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(p.note, (leftX + colW + rightX) / 2, cy - 1);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';

      // 박스(좌/우)
      drawCell(ctx, theme, leftX, y, colW, rowH, COLORS.dx12, p.d3d12, px);
      drawCell(ctx, theme, rightX, y, colW, rowH, COLORS.vulkan, p.vulkan, px);
    });
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 360, display: 'block' }} />
      <figcaption>
        D3D12와 Vulkan은 같은 문제(드라이버 per-draw 오버헤드)에 대한 같은 답이라, 개념이 거의{' '}
        <strong>일대일로</strong> 대응합니다. 파이프라인 상태는{' '}
        <span style={{ color: COLORS.dx12 }}>PSO</span> ↔{' '}
        <span style={{ color: COLORS.vulkan }}>VkPipeline</span>, 바인딩 레이아웃은 root signature ↔
        VkPipelineLayout, 디스크립터는 descriptor heap ↔ VkDescriptorSet, 명령 기록은 command list ↔
        VkCommandBuffer(기록 메모리는 command allocator ↔ VkCommandPool), 제출은 command queue ↔
        VkQueue, hazard/전이는 <code>ResourceBarrier</code> ↔ <code>vkCmdPipelineBarrier</code>입니다.
        동기화만 살짝 다릅니다 — D3D12의 <code>ID3D12Fence</code> 하나가 host 대기와 GPU↔GPU 대기를 모두
        맡는 반면, Vulkan은 host↔device 대기는 <code>VkFence</code>, queue↔queue 대기는{' '}
        <code>VkSemaphore</code>로 나눕니다(Vulkan 1.2의 timeline semaphore는 둘을 다시 통합). 이름만 다를
        뿐, 두 API를 한 번 익히면 다른 하나는 거의 번역입니다.
      </figcaption>
    </figure>
  );
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  theme: import('./dev2d').ThemeColors,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  text: string,
  px: number,
): void {
  box(ctx, x, y, w, h, color, '', theme, { alpha: 0.14, r: 6 });
  ctx.font = monoFont(px, 'bold');
  const lines = wrapText(ctx, text, w - 10);
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineH = px + 2;
  const total = (lines.length - 1) * lineH;
  lines.forEach((ln, i) => {
    ctx.fillText(ln, x + w / 2, y + h / 2 - total / 2 + i * lineH);
  });
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}
