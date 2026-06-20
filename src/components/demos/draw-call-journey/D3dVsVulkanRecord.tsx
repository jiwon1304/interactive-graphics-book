import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, label, roundRect, withAlpha, monoFont, drawArrow, wrapText } from './dcj2d';

// 기록 경로 대비(정적). 위 레인: D3D11 immediate — 매 Draw()가 곧장 드라이버 변환을 거쳐 immediate
// context의 명령 스트림에 들어간다(per-draw 드라이버 변환). 아래 레인: D3D12 command list / Vulkan
// VkCommandBuffer — 앱이 vkCmdDraw/cmd로 버퍼에 *직접 기록*만 하고(드라이버 per-draw 변환이 적음),
// 나중에 ExecuteCommandLists / vkQueueSubmit으로 배치 제출. 좁은 화면에서도 두 레인을 세로로 유지.

export default function D3dVsVulkanRecord() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 12;
    const narrow = w < 480;
    const laneH = (h - pad * 2 - 18) / 2;
    const lane1Y = pad + 16;
    const lane2Y = lane1Y + laneH + 6;

    const dotN = 3; // Draw() 개수(예시)
    const cellW = narrow ? 52 : 64;
    const gap = narrow ? 12 : 18;

    // ===== 레인 1: D3D11 immediate =====
    label(ctx, pad, pad + 4, 'D3D11 immediate context', COLORS.dx11, 12, 'bold');
    const r1y = lane1Y + 14;
    const boxH = 30;
    let x = pad;
    for (let i = 0; i < dotN; i++) {
      // Draw()
      roundRect(ctx, x, r1y, cellW, boxH, 6);
      ctx.fillStyle = withAlpha(COLORS.app, 0.16);
      ctx.fill();
      ctx.strokeStyle = COLORS.app;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      label(ctx, x + cellW / 2, r1y + boxH / 2, 'Draw()', theme.text, 11, 'bold');
      // → 드라이버 변환(매번)
      const tx = x + cellW + gap;
      drawArrow(ctx, x + cellW + 1, r1y + boxH / 2, tx - 1, r1y + boxH / 2, COLORS.umd, 1.6, 6);
      label(ctx, (x + cellW + tx) / 2, r1y - 8, '변환', COLORS.umd, 8, 'bold');
      // 드라이버 변환 박스
      roundRect(ctx, tx, r1y, cellW * 0.7, boxH, 6);
      ctx.fillStyle = withAlpha(COLORS.umd, 0.22);
      ctx.fill();
      ctx.strokeStyle = COLORS.umd;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      label(ctx, tx + cellW * 0.35, r1y + boxH / 2, 'UMD', COLORS.umd, 10, 'bold');
      x = tx + cellW * 0.7 + gap;
    }
    // immediate 명령 스트림으로
    const streamY1 = r1y + boxH + 16;
    roundRect(ctx, pad, streamY1, x - pad - gap, 22, 5);
    ctx.fillStyle = withAlpha(COLORS.umd, 0.12);
    ctx.fill();
    ctx.strokeStyle = withAlpha(COLORS.umd, 0.8);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    label(ctx, pad + (x - pad - gap) / 2, streamY1 + 11, 'immediate command buffer (드라이버가 즉시 채움)', theme.muted, 9, 'bold');

    // 구분선
    ctx.strokeStyle = withAlpha(theme.text, 0.14);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, lane2Y - 4);
    ctx.lineTo(w - pad, lane2Y - 4);
    ctx.stroke();

    // ===== 레인 2: D3D12 / Vulkan =====
    label(ctx, pad, lane2Y + 10, 'D3D12 command list / Vulkan VkCommandBuffer', COLORS.vk, 12, 'bold');
    const r2y = lane2Y + 22;
    let x2 = pad;
    for (let i = 0; i < dotN; i++) {
      roundRect(ctx, x2, r2y, cellW, boxH, 6);
      ctx.fillStyle = withAlpha(COLORS.app, 0.16);
      ctx.fill();
      ctx.strokeStyle = COLORS.app;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      wrapText(ctx, narrow ? 'cmd Draw' : 'vkCmdDraw', x2 + cellW / 2, r2y + boxH / 2, cellW - 4, theme.text, 9, 'bold');
      // 곧장 버퍼로(변환 박스 없음)
      drawArrow(ctx, x2 + cellW / 2, r2y + boxH + 1, x2 + cellW / 2, r2y + boxH + 13, COLORS.vk, 1.5, 5);
      x2 += cellW + gap;
    }
    // command buffer
    const cbY = r2y + boxH + 16;
    const cbW = x2 - pad - gap;
    roundRect(ctx, pad, cbY, cbW, 22, 5);
    ctx.fillStyle = withAlpha(COLORS.vk, 0.12);
    ctx.fill();
    ctx.strokeStyle = withAlpha(COLORS.vk, 0.8);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    label(ctx, pad + cbW / 2, cbY + 11, '앱이 직접 기록한 command buffer', theme.muted, 9, 'bold');
    // 나중에 배치 제출
    const subX = pad + cbW + gap;
    if (subX + 8 < w - pad) {
      drawArrow(ctx, pad + cbW + 1, cbY + 11, subX - 1, cbY + 11, COLORS.submit, 1.6, 6);
    }
    ctx.font = monoFont(8, 'bold');
    label(ctx, pad + cbW / 2, cbY + 32, 'ExecuteCommandLists / vkQueueSubmit 로 나중에 배치 제출', COLORS.submit, 8, 'bold');
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 250, display: 'block' }} />
      <figcaption>
        같은 일을 적는 두 가지 방식. <span style={{ color: COLORS.dx11 }}>D3D11 immediate context</span>는
        앱이 <code>Draw()</code>를 부를 때마다 드라이버(UMD)가 <strong>그 자리에서 바로</strong> 현재 상태를
        하드웨어 명령으로 변환해 immediate command buffer를 채웁니다 — 변환이{' '}
        <strong>매 draw에 묶여</strong> 있고, 이 변환은 immediate context 하나에서만 일어나 병렬화가
        어렵습니다. <span style={{ color: COLORS.vk }}>D3D12 command list와 Vulkan VkCommandBuffer</span>는
        다릅니다. <code>vkCmdDraw</code> 같은 호출(Vulkan 명세의 “Action Command”)은 드라이버에게 즉시
        변환을 시키는 게 아니라 명령을 <strong>command buffer에 직접 기록</strong>만 하고, 다 적은 뒤{' '}
        <code>ExecuteCommandLists</code> / <code>vkQueueSubmit</code>으로 <strong>배치 제출</strong>합니다.
        그래서 여러 스레드가 각자의 버퍼에 동시에 기록할 수 있고, draw마다 드라이버가 다시 변환하는 일이
        줄어듭니다. D3D11이 draw마다 변환하던 일을 D3D12/Vulkan이 어떻게 “미리·앱 쪽에서” 처리하는지의 더
        깊은 대비(상태/PSO 변환의 내용)는 4·5편에서 다룹니다.
      </figcaption>
    </figure>
  );
}
