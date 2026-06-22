import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, label, roundRect, withAlpha, monoFont, drawArrow } from './pss2d';

// 상태→하드웨어 변환이 "언제" 일어나는가(정적). 4 레인 타임라인.
// DX9: draw마다 / DX11: state object 생성 + 작은 draw 비용 / DX12: PSO 생성에 몰아넣음 /
// Vulkan: VkPipeline 생성에 몰아넣음(PSO와 동형). 막대 높이 = 그 시점의 상태 변환 CPU 비용.

interface Lane {
  name: string;
  color: string;
  creates: Array<{ x: number; hh: number; t: string }>;
  drawCost: number;
}

export default function StateTranslationTiming() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const leftW = 56;
    const pad = 10;
    const nLanes = 4;
    const laneH = (h - pad * 2) / nLanes;
    const x0 = pad + leftW;
    const x1 = w - pad - 8;

    const drawLane = (idx: number, ln: Lane) => {
      const top = pad + idx * laneH;
      const base = top + laneH - 22;
      // 레인 라벨
      label(ctx, pad + leftW / 2 - 2, top + laneH / 2 - 6, ln.name, ln.color, 12, 'bold');
      // baseline
      ctx.strokeStyle = withAlpha(theme.text, 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, base);
      ctx.lineTo(x1, base);
      ctx.stroke();
      drawArrow(ctx, x1 - 2, base, x1 + 4, base, withAlpha(theme.text, 0.4), 1.2, 5);
      label(ctx, x1 - 16, base + 12, 'time', theme.muted, 12);

      const maxBar = laneH - 32;
      // 생성 이벤트(큰 선행 막대)
      ln.creates.forEach((c) => {
        const bh = c.hh * maxBar;
        roundRect(ctx, c.x - 7, base - bh, 14, bh, 3);
        ctx.fillStyle = withAlpha(ln.color, 0.85);
        ctx.fill();
        label(ctx, c.x + 2, base - bh - 8, c.t, ln.color, 12, 'bold');
      });
      // draw 이벤트들(같은 간격, 회색)
      const n = 6;
      const startX = x0 + 140;
      const step = (x1 - 20 - startX) / (n - 1);
      for (let i = 0; i < n; i++) {
        const x = startX + i * step;
        const bh = Math.max(2, ln.drawCost * maxBar);
        roundRect(ctx, x - 5, base - bh, 10, bh, 2);
        ctx.fillStyle = withAlpha(theme.text, 0.55);
        ctx.fill();
      }
      ctx.font = monoFont(12);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'center';
      ctx.fillText('draws →', startX + 2.5 * step, base + 12);
      ctx.textAlign = 'start';
    };

    const lanes: Lane[] = [
      { name: 'DX9', color: COLORS.dx9, creates: [], drawCost: 0.85 },
      {
        name: 'DX11',
        color: COLORS.dx11,
        creates: [{ x: x0 + 36, hh: 0.3, t: 'state obj' }],
        drawCost: 0.4,
      },
      {
        name: 'DX12',
        color: COLORS.dx12,
        creates: [{ x: x0 + 50, hh: 0.95, t: 'PSO' }],
        drawCost: 0.06,
      },
      {
        name: 'Vulkan',
        color: COLORS.vk,
        creates: [{ x: x0 + 50, hh: 0.95, t: 'VkPipeline' }],
        drawCost: 0.06,
      },
    ];
    lanes.forEach((ln, i) => drawLane(i, ln));
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 340, display: 'block', width: '100%', maxWidth: 380 }}
      />
      <figcaption>
        막대 높이 = 그 시점에 드는 상태 변환 CPU 비용. <span style={{ color: COLORS.dx9 }}>DX9</span>는
        생성 시 변환이 없는 대신 <strong>매 draw마다</strong> 바인딩된 dirty 상태 전부를 하드웨어 명령으로
        변환합니다(draw-time validation) — 회색 draw 막대가 높습니다. <span style={{ color: COLORS.dx11 }}>
        DX11</span>은 blend/rasterizer/depth-stencil/sampler를 immutable <strong>state object</strong>로
        만들 때 한 번 변환해 두므로 draw당 비용이 줄지만, 드라이버가 여전히 바인딩·hazard를 검사해 0은
        아닙니다. <span style={{ color: COLORS.dx12 }}>DX12</span>의 <strong>PSO</strong>와{' '}
        <span style={{ color: COLORS.vk }}>Vulkan</span>의 <strong>VkPipeline</strong>은 셰이더 컴파일까지
        포함한 거의 모든 변환을 <strong>생성 한 번</strong>에 몰아넣어(앞쪽 큰 막대) draw당 비용이 바닥에
        붙습니다. 비용이 사라진 게 아니라 <strong>hot loop(draw) 밖, 차가운 생성 경로</strong>로 옮겨진
        것입니다 — 그래서 PSO/pipeline 생성이 무겁고 첫 사용 시 hitching의 원인이 되며, pipeline cache가
        중요해집니다.
      </figcaption>
    </figure>
  );
}
