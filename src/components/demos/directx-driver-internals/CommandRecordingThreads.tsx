import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, label, drawArrow, withAlpha } from './dxd2d';

// 명령 기록 스레딩(정적): DX9 단일 / DX11 immediate+deferred(에뮬 흔함) / DX12 N스레드→큐.

export default function CommandRecordingThreads() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 10;
    const leftW = 52;
    const laneH = (h - pad * 2) / 3;
    const gpuX = w - pad - 64;
    const gpuW = 64;

    const gpuBox = (cy: number) => box(ctx, gpuX, cy - 16, gpuW, 32, COLORS.gpu, 'GPU', theme, { px: 12 });

    // --- DX9 ---
    let top = pad;
    label(ctx, pad + leftW / 2 - 4, top + laneH / 2, 'DX9', COLORS.dx9, 13, 'bold');
    {
      const cy = top + laneH / 2;
      const x = pad + leftW;
      box(ctx, x, cy - 15, 90, 30, COLORS.app, 'Thread', theme, { px: 11 });
      box(ctx, x + 104, cy - 15, 130, 30, COLORS.runtime, 'Immediate Ctx', theme, { px: 11 });
      drawArrow(ctx, x + 90 + 2, cy, x + 104 - 2, cy, theme.muted, 1.6, 6);
      drawArrow(ctx, x + 234 + 2, cy, gpuX - 2, cy, theme.muted, 1.6, 6);
      gpuBox(cy);
    }

    // --- DX11 ---
    top = pad + laneH;
    label(ctx, pad + leftW / 2 - 4, top + laneH / 2, 'DX11', COLORS.dx11, 13, 'bold');
    {
      const x = pad + leftW;
      const imy = top + 18;
      box(ctx, x, imy - 13, 120, 26, COLORS.runtime, 'Immediate', theme, { px: 10 });
      drawArrow(ctx, x + 120 + 2, imy, gpuX - 2, imy, theme.muted, 1.6, 6);
      // deferred
      const dy1 = top + laneH - 40;
      const dy2 = top + laneH - 14;
      box(ctx, x, dy1 - 11, 120, 22, COLORS.dx11, 'Deferred A', theme, { px: 10, alpha: 0.2 });
      box(ctx, x, dy2 - 11, 120, 22, COLORS.dx11, 'Deferred B', theme, { px: 10, alpha: 0.2 });
      box(ctx, x + 150, (dy1 + dy2) / 2 - 12, 110, 24, COLORS.dx11, 'command list', theme, { px: 9, alpha: 0.28 });
      drawArrow(ctx, x + 120 + 2, dy1, x + 150 - 2, (dy1 + dy2) / 2 - 4, COLORS.dx11, 1.4, 5);
      drawArrow(ctx, x + 120 + 2, dy2, x + 150 - 2, (dy1 + dy2) / 2 + 4, COLORS.dx11, 1.4, 5);
      // replay into immediate (dashed)
      ctx.setLineDash([5, 4]);
      drawArrow(ctx, x + 205, (dy1 + dy2) / 2 - 12, x + 60, imy + 13 + 2, withAlpha(theme.text, 0.55), 1.3, 5);
      ctx.setLineDash([]);
      label(ctx, x + 150, (dy1 + dy2) / 2 + 22, 'replay (드라이버 에뮬 흔함*)', theme.muted, 8, 'bold');
      gpuBox(imy);
    }

    // --- DX12 ---
    top = pad + laneH * 2;
    label(ctx, pad + leftW / 2 - 4, top + laneH / 2, 'DX12', COLORS.dx12, 13, 'bold');
    {
      const x = pad + leftW;
      const nT = 4;
      const th = (laneH - 16) / nT;
      const queues = ['Direct', 'Compute', 'Copy'];
      const qx = x + 168;
      // 스레드 → alloc+list
      for (let i = 0; i < nT; i++) {
        const cy = top + 8 + th * i + th / 2;
        box(ctx, x, cy - th / 2 + 2, 150, th - 4, COLORS.dx12, `T${i}: alloc+list`, theme, { px: 9, alpha: 0.18 });
        // 큐로
        const q = i === 0 ? 0 : i === 3 ? 2 : 1;
        const qy = top + 8 + (laneH - 16) * ((q + 0.5) / 3);
        drawArrow(ctx, x + 150 + 2, cy, qx - 2, qy, withAlpha(COLORS.dx12, 0.7), 1.2, 5);
      }
      // 큐 박스 3개
      queues.forEach((qn, q) => {
        const qy = top + 8 + (laneH - 16) * ((q + 0.5) / 3);
        box(ctx, qx, qy - 11, 92, 22, COLORS.kernel, qn, theme, { px: 9, alpha: 0.25 });
        drawArrow(ctx, qx + 92 + 2, qy, gpuX - 2, top + laneH / 2 + (q - 1) * 10, withAlpha(theme.text, 0.5), 1.2, 5);
      });
      gpuBox(top + laneH / 2);
    }
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 340, display: 'block' }} />
      <figcaption>
        명령을 누가·어떻게 기록하는가. <span style={{ color: COLORS.dx9 }}>DX9</span>는 device가 곧
        immediate context라, 사실상 한 스레드가 기록과 제출을 모두 합니다 — 멀티코어로 draw 제출을 나눌
        수 없습니다. <span style={{ color: COLORS.dx11 }}>DX11</span>은 immediate context(제출 담당) 외에
        <strong> deferred context</strong>를 두어 다른 스레드에서 command list를 기록할 수 있게 했지만,
        IHV 드라이버가 네이티브 command list(<code>DriverCommandLists</code>)를 지원하지 않으면 runtime이
        이를 <strong>에뮬레이트</strong>(immediate에서 replay)해 실질 병렬 이득이 작았습니다. 또한 자원
        생성은 free-threaded지만 렌더 명령 자체는 immediate 한 곳을 거칩니다. <span style={{ color: COLORS.dx12 }}>
        DX12</span>는 각 스레드가 자기 <strong>command allocator + command list</strong>에 독립적으로
        기록하고, <code>ExecuteCommandLists</code>로 <strong>Direct/Compute/Copy 큐</strong>에 제출합니다 —
        드라이버 직렬 지점이 사라져 코어 수만큼 기록이 확장됩니다. CPU-bound 렌더러에서 DX12의 가장 큰
        실이득이 여기서 나옵니다.
      </figcaption>
    </figure>
  );
}
