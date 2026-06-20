import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, label, drawArrow, withAlpha } from './dev2d';

// 명령 기록 스레딩(정적): DX9 단일 / DX11 immediate+deferred(에뮬 흔함) / DX12 N스레드→큐 /
// Vulkan N스레드 VkCommandBuffer→VkQueue. directx 챕터의 3-레인에 Vulkan 레인을 더한 확장판.
// 핵심: 직렬 지점(DX9 한 스레드, DX11 immediate 한 곳)이 DX12·Vulkan에서 사라져 코어 수만큼 확장.

export default function CommandRecordingThreads() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 8;
    const leftW = 46;
    const laneH = (h - pad * 2) / 4;
    const gpuX = w - pad - 54;
    const gpuW = 54;

    const gpuBox = (cy: number) =>
      box(ctx, gpuX, cy - 15, gpuW, 30, COLORS.gpu, 'GPU', theme, { px: 11 });

    const xBase = pad + leftW;
    const innerW = gpuX - xBase - 8;

    // --- DX9 ---
    let top = pad;
    label(ctx, pad + leftW / 2 - 2, top + laneH / 2, 'DX9', COLORS.dx9, 12, 'bold');
    {
      const cy = top + laneH / 2;
      const bw = Math.min(86, innerW * 0.32);
      box(ctx, xBase, cy - 14, bw, 28, COLORS.app, 'Thread', theme, { px: 10 });
      const ix = xBase + bw + 14;
      box(ctx, ix, cy - 14, Math.min(128, innerW * 0.42), 28, COLORS.runtime, 'Immediate', theme, { px: 10 });
      drawArrow(ctx, xBase + bw + 2, cy, ix - 2, cy, theme.muted, 1.5, 6);
      drawArrow(ctx, ix + Math.min(128, innerW * 0.42) + 2, cy, gpuX - 2, cy, theme.muted, 1.5, 6);
      gpuBox(cy);
    }

    // --- DX11 ---
    top = pad + laneH;
    label(ctx, pad + leftW / 2 - 2, top + laneH / 2, 'DX11', COLORS.dx11, 12, 'bold');
    {
      const imy = top + 16;
      const bw = Math.min(110, innerW * 0.4);
      box(ctx, xBase, imy - 12, bw, 24, COLORS.runtime, 'Immediate', theme, { px: 10 });
      drawArrow(ctx, xBase + bw + 2, imy, gpuX - 2, imy, theme.muted, 1.5, 6);
      const dy1 = top + laneH - 36;
      const dy2 = top + laneH - 13;
      box(ctx, xBase, dy1 - 10, bw, 20, COLORS.dx11, 'Deferred A', theme, { px: 9, alpha: 0.2 });
      box(ctx, xBase, dy2 - 10, bw, 20, COLORS.dx11, 'Deferred B', theme, { px: 9, alpha: 0.2 });
      const clx = xBase + bw + 18;
      box(ctx, clx, (dy1 + dy2) / 2 - 11, Math.min(96, innerW * 0.34), 22, COLORS.dx11, 'cmd list', theme, { px: 9, alpha: 0.28 });
      drawArrow(ctx, xBase + bw + 2, dy1, clx - 2, (dy1 + dy2) / 2 - 4, COLORS.dx11, 1.3, 5);
      drawArrow(ctx, xBase + bw + 2, dy2, clx - 2, (dy1 + dy2) / 2 + 4, COLORS.dx11, 1.3, 5);
      // replay into immediate (dashed)
      ctx.setLineDash([5, 4]);
      drawArrow(ctx, clx + 30, (dy1 + dy2) / 2 - 11, xBase + 40, imy + 12 + 2, withAlpha(theme.text, 0.55), 1.2, 5);
      ctx.setLineDash([]);
      label(ctx, clx + 8, (dy1 + dy2) / 2 + 22, 'replay (에뮬*)', theme.muted, 8, 'bold');
      gpuBox(imy + 4);
    }

    // --- DX12 ---
    top = pad + laneH * 2;
    label(ctx, pad + leftW / 2 - 2, top + laneH / 2, 'DX12', COLORS.dx12, 12, 'bold');
    drawParallelLanes(ctx, theme, {
      top,
      laneH,
      xBase,
      gpuX,
      color: COLORS.dx12,
      threadLabel: (i) => `T${i}: alloc+list`,
      queues: ['Direct', 'Compute', 'Copy'],
      gpuBox,
    });

    // --- Vulkan ---
    top = pad + laneH * 3;
    label(ctx, pad + leftW / 2 - 2, top + laneH / 2, 'Vk', COLORS.vulkan, 12, 'bold');
    drawParallelLanes(ctx, theme, {
      top,
      laneH,
      xBase,
      gpuX,
      color: COLORS.vulkan,
      threadLabel: (i) => `T${i}: pool+cmdbuf`,
      queues: ['Graphics Q', 'Compute Q', 'Transfer Q'],
      gpuBox,
    });
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 380, display: 'block' }} />
      <figcaption>
        명령을 누가·어떻게 기록하는가. <span style={{ color: COLORS.dx9 }}>DX9</span>는 device가 곧
        immediate context라, 사실상 한 스레드가 기록과 제출을 모두 합니다 — 멀티코어로 draw 제출을 나눌
        수 없습니다. <span style={{ color: COLORS.dx11 }}>DX11</span>은 immediate context 외에{' '}
        <strong>deferred context</strong>로 다른 스레드에서 command list를 기록할 수 있게 했지만, IHV
        드라이버가 네이티브 command list(<code>DriverCommandLists</code>)를 지원하지 않으면 runtime이 이를{' '}
        <strong>에뮬레이트</strong>(immediate에서 replay)해 실질 병렬 이득이 작았습니다.{' '}
        <span style={{ color: COLORS.dx12 }}>DX12</span>는 각 스레드가 자기{' '}
        <strong>command allocator + command list</strong>에 독립적으로 기록하고{' '}
        <code>ExecuteCommandLists</code>로 <strong>Direct/Compute/Copy 큐</strong>에 제출합니다.{' '}
        <span style={{ color: COLORS.vulkan }}>Vulkan</span>은 같은 모양입니다 — 스레드마다{' '}
        <strong>VkCommandPool + VkCommandBuffer</strong>, 그리고{' '}
        <code>vkQueueSubmit</code>으로 queue family별 <strong>VkQueue</strong>에 제출합니다. 두 API 모두
        드라이버의 직렬 지점이 사라져 기록이 코어 수만큼 확장됩니다 — CPU-bound 렌더러에서 가장 큰
        실이득이 여기서 나옵니다.
      </figcaption>
    </figure>
  );
}

// DX12/Vulkan 공통: N스레드(각자 기록) → 큐 3개 → GPU. 구조가 같으므로 라벨만 바꿔 재사용.
function drawParallelLanes(
  ctx: CanvasRenderingContext2D,
  theme: import('./dev2d').ThemeColors,
  opts: {
    top: number;
    laneH: number;
    xBase: number;
    gpuX: number;
    color: string;
    threadLabel: (i: number) => string;
    queues: [string, string, string];
    gpuBox: (cy: number) => void;
  },
): void {
  const { top, laneH, xBase, gpuX, color, threadLabel, queues, gpuBox } = opts;
  const nT = 3;
  const innerTop = top + 6;
  const innerH = laneH - 12;
  const th = innerH / nT;
  const listW = Math.min(150, (gpuX - xBase) * 0.46);
  const qW = Math.min(96, (gpuX - xBase) * 0.3);
  const qx = xBase + listW + 14;

  // 스레드 → alloc+list / pool+cmdbuf
  for (let i = 0; i < nT; i++) {
    const cy = innerTop + th * i + th / 2;
    box(ctx, xBase, cy - th / 2 + 2, listW, th - 4, color, threadLabel(i), theme, { px: 8, alpha: 0.18 });
    const qy = innerTop + innerH * ((i + 0.5) / 3);
    drawArrow(ctx, xBase + listW + 2, cy, qx - 2, qy, withAlpha(color, 0.7), 1.2, 5);
  }
  // 큐 3개 → GPU
  queues.forEach((qn, q) => {
    const qy = innerTop + innerH * ((q + 0.5) / 3);
    box(ctx, qx, qy - 10, qW, 20, COLORS.kernel, qn, theme, { px: 8, alpha: 0.25 });
    drawArrow(ctx, qx + qW + 2, qy, gpuX - 2, top + laneH / 2 + (q - 1) * 9, withAlpha(theme.text, 0.5), 1.2, 5);
  });
  gpuBox(top + laneH / 2);
}
