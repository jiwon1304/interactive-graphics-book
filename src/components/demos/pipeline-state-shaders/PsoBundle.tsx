import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, roundRect, withAlpha, label, wrapText } from './pss2d';

// PSO / VkPipeline이 한 객체로 묶는 상태들(정적 도식).
// 가장 설명력 있는 한 상태로 고정: D3D12 PSO에 거의 모든 상태가 baked-in되고,
// viewport/scissor만 dynamic state로 빠져 draw 시점에 설정되는 모습을 한 컷으로 보인다.
// → "무엇이 baked-in이고 무엇이 dynamic으로 남나"의 경계를 한눈에.

interface Piece {
  label: string;
  color: string;
  dynamic?: boolean; // dynamic state로 분리 가능
}

// 대표 상태: D3D12(PSO) 용어. 마지막 한 조각만 dynamic으로 분리.
const PIECES: Piece[] = [
  { label: 'VS / PS / GS …', color: COLORS.shader },
  { label: 'InputLayout', color: COLORS.input },
  { label: 'RasterizerState', color: COLORS.raster },
  { label: 'BlendState', color: COLORS.blend },
  { label: 'DepthStencilState', color: COLORS.depth },
  { label: 'PrimitiveTopology', color: COLORS.input },
  { label: 'RTV / DSV formats', color: COLORS.rtformat },
  { label: 'SampleDesc (MSAA)', color: COLORS.raster },
  { label: 'RootSignature', color: COLORS.rootsig },
  // dynamic으로 분리되는 조각
  { label: 'Viewport / Scissor', color: COLORS.depth, dynamic: true },
];

const CANVAS_MAX_W = 380;

export default function PsoBundle() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 12;

    const baked = PIECES.filter((p) => !p.dynamic);
    const dynamic = PIECES.filter((p) => p.dynamic);

    // 세로 스택: 위쪽이 PSO 번들(baked-in), 아래가 dynamic state.
    const dynBlockH = 64;
    const gapY = 12;
    const bundleX = pad;
    const bundleW = w - pad * 2;
    const bundleY = pad;
    const bundleH = h - pad * 2 - dynBlockH - gapY;

    // 번들 컨테이너
    const titleH = 28;
    roundRect(ctx, bundleX, bundleY, bundleW, bundleH, 10);
    ctx.fillStyle = withAlpha(COLORS.dx12, 0.06);
    ctx.fill();
    ctx.strokeStyle = COLORS.dx12;
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, bundleX + bundleW / 2, bundleY + titleH / 2 + 2, 'PSO (불변 객체 1개)', COLORS.dx12, 14, 'bold');

    // 내부 조각들 — 2열 그리드
    const gridTop = bundleY + titleH + 6;
    const gridBot = bundleY + bundleH - 8;
    const cols = 2;
    const cellGapX = 8;
    const cellGapY = 7;
    const rows = Math.ceil(baked.length / cols);
    const cellW = (bundleW - 12 * 2 - cellGapX * (cols - 1)) / cols;
    const cellH = (gridBot - gridTop - cellGapY * (rows - 1)) / rows;

    baked.forEach((p, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = bundleX + 12 + c * (cellW + cellGapX);
      const y = gridTop + r * (cellH + cellGapY);
      roundRect(ctx, x, y, cellW, cellH, 6);
      ctx.fillStyle = withAlpha(p.color, 0.18);
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      wrapText(ctx, p.label, x + cellW / 2, y + cellH / 2, cellW - 8, theme.text, {
        px: 12,
        weight: 'bold',
        lineH: 13,
      });
    });

    // dynamic state 블록(아래, 점선 — 번들 밖)
    const dynY = bundleY + bundleH + gapY;
    roundRect(ctx, bundleX, dynY, bundleW, dynBlockH, 10);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = withAlpha(theme.text, 0.5);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, bundleX + bundleW / 2, dynY + 15, 'dynamic state — draw 시 설정', theme.muted, 12, 'bold');
    dynamic.forEach((p) => {
      const dh = 26;
      const dw = bundleW - 24;
      const x = bundleX + 12;
      const y = dynY + 28;
      roundRect(ctx, x, y, dw, dh, 6);
      ctx.fillStyle = withAlpha(p.color, 0.18);
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      label(ctx, x + dw / 2, y + dh / 2, p.label, theme.text, 12, 'bold');
    });
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 420, display: 'block', width: '100%', maxWidth: CANVAS_MAX_W }}
      />
      <figcaption>
        DX9에서는 이 조각들을 <code>SetRenderState</code>·<code>VSSetShader</code>처럼 따로따로 꽂았고,
        드라이버는 draw 순간에야 전체 조합을 알 수 있었습니다. <strong>PSO</strong>(D3D12)와{' '}
        <strong>VkPipeline</strong>(Vulkan)은 셰이더 전 단계, input layout, rasterizer/blend/depth-stencil,
        topology, 렌더 타깃 포맷, 그리고 바인딩 레이아웃(root signature / pipeline layout)까지{' '}
        <strong>하나의 불변 객체</strong>로 묶습니다(그림은 D3D12 PSO 기준; Vulkan도 같은 조각을
        VkPipeline로 묶습니다). 조합이 통째로 정해지므로 드라이버가 생성 시점에 전부 컴파일·최적화할 수
        있습니다. 다만 전부를 굳히면 viewport 하나 바꾸려 해도 PSO를 새로 만들어야 하므로, 자주 바뀌는 일부
        상태는 <strong>dynamic state</strong>로 빼서 draw 시점에 명령으로 설정합니다
        (<code>VkDynamicState</code> / <code>RSSetViewports</code> 등). 아래 점선 블록의{' '}
        <strong>Viewport / Scissor</strong>가 바로 그렇게 번들 밖으로 빠진 조각으로, baked-in과 dynamic의
        경계가 여기서 갈립니다.
      </figcaption>
    </figure>
  );
}
