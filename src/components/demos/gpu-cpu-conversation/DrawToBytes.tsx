import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, label, roundRect, withAlpha, monoFont, drawArrow, textL } from './gcc2d';

// Draw() 한 줄이 command buffer 안의 명령(바이트열)로 기록되는 모습(정적).
// 왼쪽: 앱이 부르는 API 호출 몇 줄. 오른쪽: 그 호출들이 command buffer에 남기는 opcode+payload.
// D3D / Vulkan 명칭 병기.

interface Op {
  api: string; // 앱이 부른 한 줄
  op: string; // command buffer에 남는 opcode
  payload: string; // 대략의 인자(바이트)
}

const OPS: Op[] = [
  { api: 'SetPipelineState', op: 'BIND_PIPELINE', payload: 'pso handle' },
  { api: 'SetVertexBuffers', op: 'SET_VTX_BUF', payload: 'addr · stride' },
  { api: 'SetConstants', op: 'SET_CONST', payload: 'addr · size' },
  { api: 'DrawIndexed(36)', op: 'DRAW_INDEXED', payload: 'count=36' },
];

export default function DrawToBytes() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 10;
    const colGap = 12;
    const colW = (w - pad * 2 - colGap) / 2;
    const leftX = pad;
    const rightX = pad + colW + colGap;
    const top = 32;

    // 헤더
    label(ctx, leftX + colW / 2, 15, '앱이 부르는 API', COLORS.app, 12, 'bold');
    label(ctx, rightX + colW / 2, 15, 'command buffer', COLORS.cmd, 12, 'bold');

    const rowH = (h - top - 16) / OPS.length;
    OPS.forEach((o, i) => {
      const y = top + i * rowH;
      const cy = y + rowH / 2;
      const bh = Math.min(rowH - 12, 40);
      const by = cy - bh / 2;

      // 왼쪽: API 호출
      roundRect(ctx, leftX, by, colW, bh, 6);
      ctx.fillStyle = withAlpha(COLORS.app, 0.1);
      ctx.fill();
      ctx.strokeStyle = withAlpha(COLORS.app, 0.5);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = monoFont(11);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.api, leftX + 7, cy);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';

      // 화살표 record →
      drawArrow(ctx, leftX + colW + 2, cy, rightX - 2, cy, withAlpha(theme.text, 0.4), 1.4, 6);

      // 오른쪽: opcode + payload
      roundRect(ctx, rightX, by, colW, bh, 6);
      ctx.fillStyle = withAlpha(COLORS.cmd, 0.12);
      ctx.fill();
      ctx.strokeStyle = COLORS.cmd;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      // opcode 작은 칩
      const chipW = Math.min(colW * 0.72, 130);
      roundRect(ctx, rightX + 6, by + 6, chipW, 16, 3);
      ctx.fillStyle = withAlpha(COLORS.cmd, 0.85);
      ctx.fill();
      label(ctx, rightX + 6 + chipW / 2, by + 6 + 8, o.op, theme.bg, 11, 'bold');
      // payload
      textL(ctx, rightX + 7, by + bh - 11, o.payload, theme.muted, 11);
    });
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ width: '100%', height: 300, maxWidth: 400, display: 'block' }}
      />
      <figcaption>
        앱이 부르는 한 줄 한 줄은 GPU로 곧장 가지 않습니다 — 드라이버가 그 의미를 그 하드웨어가
        이해하는 <strong>command buffer</strong>(opcode + payload의 바이트열)로 <strong>기록(record)</strong>
        합니다. 그림은 개념을 보이기 위한 단순화이고, opcode 이름·인코딩은 하드웨어·드라이버마다 다릅니다.
        같은 일을 두 API가 부르는 이름만 다릅니다: 명령을 담는 객체가 D3D12에서는{' '}
        <code>ID3D12GraphicsCommandList</code>, Vulkan에서는 <code>VkCommandBuffer</code>이고,
        기록을 시작·끝내는 건 D3D12의 <code>Reset</code>/<code>Close</code>, Vulkan의{' '}
        <code>vkBeginCommandBuffer</code>/<code>vkEndCommandBuffer</code>입니다. 중요한 건{' '}
        <strong>Draw()가 “지금 그려라”가 아니라 “나중에 그릴 명령을 적어 둬라”</strong>라는 점입니다 —
        실제 실행은 이 buffer를 GPU에 <em>제출</em>한 뒤에 일어납니다.
      </figcaption>
    </figure>
  );
}
