import { useState } from 'react';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, roundRect, withAlpha, label, wrapText } from './pss2d';
import { ControlPanel, SelectControl, ToggleControl, type SelectOption } from '../../controls';

// PSO / VkPipeline이 한 객체로 묶는 상태들(인터랙티브).
// API를 고르면 라벨이 D3D12/Vulkan 용어로 바뀌고, "dynamic state 분리" 토글을 켜면
// 일부 상태(viewport/scissor 등)가 번들에서 빠져 draw 시점에 설정되는 모습을 보인다.
// → "무엇이 baked-in이고 무엇이 dynamic으로 남길 수 있나"의 과정을 드러냄.

type Api = 'dx12' | 'vk';

interface Piece {
  // dx12 / vk 라벨, 색, dynamic으로 뺄 수 있는가
  dx12: string;
  vk: string;
  color: string;
  dynamic?: boolean; // dynamic state로 분리 가능
}

const PIECES: Piece[] = [
  { dx12: 'VS / PS / GS …', vk: 'shader stages', color: COLORS.shader },
  { dx12: 'InputLayout', vk: 'vertex input', color: COLORS.input },
  { dx12: 'RasterizerState', vk: 'rasterization', color: COLORS.raster },
  { dx12: 'BlendState', vk: 'color blend', color: COLORS.blend },
  { dx12: 'DepthStencilState', vk: 'depth / stencil', color: COLORS.depth },
  { dx12: 'PrimitiveTopologyType', vk: 'input assembly', color: COLORS.input },
  { dx12: 'RTV / DSV formats', vk: 'attachment formats', color: COLORS.rtformat },
  { dx12: 'SampleDesc (MSAA)', vk: 'multisample', color: COLORS.raster },
  { dx12: 'RootSignature', vk: 'pipeline layout', color: COLORS.rootsig },
  // dynamic으로 뺄 수 있는 것들
  { dx12: 'Viewport / Scissor', vk: 'viewport / scissor', color: COLORS.depth, dynamic: true },
];

const API_OPTS: SelectOption<Api>[] = [
  { value: 'dx12', label: 'D3D12 (PSO)' },
  { value: 'vk', label: 'Vulkan (VkPipeline)' },
];

export default function PsoBundle() {
  const [api, setApi] = useState<Api>('dx12');
  const [splitDynamic, setSplitDynamic] = useState(false);

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 12;

    const baked = PIECES.filter((p) => !(splitDynamic && p.dynamic));
    const dynamic = splitDynamic ? PIECES.filter((p) => p.dynamic) : [];

    // 오른쪽에 dynamic 칼럼을 둘지에 따라 번들 폭이 달라짐
    const hasDyn = dynamic.length > 0;
    const bundleW = hasDyn ? (w - pad * 3) * 0.66 : w - pad * 2;
    const bundleX = pad;

    // 번들 컨테이너
    const titleH = 30;
    const bundleY = pad;
    const bundleH = h - pad * 2;
    roundRect(ctx, bundleX, bundleY, bundleW, bundleH, 10);
    ctx.fillStyle = withAlpha(api === 'dx12' ? COLORS.dx12 : COLORS.vk, 0.06);
    ctx.fill();
    ctx.strokeStyle = api === 'dx12' ? COLORS.dx12 : COLORS.vk;
    ctx.lineWidth = 2;
    ctx.stroke();
    const titleTxt = api === 'dx12' ? 'PSO (불변 객체 1개)' : 'VkPipeline (불변 객체 1개)';
    label(
      ctx,
      bundleX + bundleW / 2,
      bundleY + titleH / 2 + 2,
      titleTxt,
      api === 'dx12' ? COLORS.dx12 : COLORS.vk,
      12,
      'bold',
    );

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
      const txt = api === 'dx12' ? p.dx12 : p.vk;
      wrapText(ctx, txt, x + cellW / 2, y + cellH / 2, cellW - 8, theme.text, {
        px: 9.5,
        weight: 'bold',
        lineH: 11,
      });
    });

    // dynamic 칼럼
    if (hasDyn) {
      const dynX = bundleX + bundleW + pad;
      const dynW = w - pad - dynX;
      roundRect(ctx, dynX, bundleY, dynW, bundleH, 10);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = withAlpha(theme.text, 0.5);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
      wrapText(ctx, 'dynamic state — draw 시 설정', dynX + dynW / 2, bundleY + 18, dynW - 8, theme.muted, {
        px: 9.5,
        weight: 'bold',
        lineH: 11,
      });
      const dh = 40;
      dynamic.forEach((p, i) => {
        const y = bundleY + 38 + i * (dh + 8);
        roundRect(ctx, dynX + 10, y, dynW - 20, dh, 6);
        ctx.fillStyle = withAlpha(p.color, 0.18);
        ctx.fill();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.3;
        ctx.stroke();
        const txt = api === 'dx12' ? p.dx12 : p.vk;
        wrapText(ctx, txt, dynX + dynW / 2, y + dh / 2, dynW - 24, theme.text, {
          px: 9.5,
          weight: 'bold',
          lineH: 11,
        });
      });
    }
  };

  const { ref } = useCanvas2d(draw, [api, splitDynamic]);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 320, display: 'block' }} />
      <ControlPanel>
        <SelectControl label="API" value={api} options={API_OPTS} onChange={setApi} />
        <ToggleControl
          label="dynamic state 분리"
          checked={splitDynamic}
          onChange={setSplitDynamic}
        />
      </ControlPanel>
      <figcaption>
        DX9에서는 이 조각들을 <code>SetRenderState</code>·<code>VSSetShader</code>처럼 따로따로 꽂았고,
        드라이버는 draw 순간에야 전체 조합을 알 수 있었습니다. <strong>PSO</strong>(D3D12)와{' '}
        <strong>VkPipeline</strong>(Vulkan)은 셰이더 전 단계, input layout, rasterizer/blend/depth-stencil,
        topology, 렌더 타깃 포맷, 그리고 바인딩 레이아웃(root signature / pipeline layout)까지{' '}
        <strong>하나의 불변 객체</strong>로 묶습니다. 조합이 통째로 정해지므로 드라이버가 생성 시점에 전부
        컴파일·최적화할 수 있습니다(<span style={{ color: COLORS.dx12 }}>API</span>를 바꿔 두 용어 대응을
        확인하세요). 다만 전부를 굳히면 viewport 하나 바꾸려 해도 PSO를 새로 만들어야 하므로, 자주 바뀌는
        일부 상태는 <strong>dynamic state</strong>로 빼서 draw 시점에 명령으로 설정할 수 있습니다
        (<code>VkDynamicState</code> / <code>RSSetViewports</code> 등). “dynamic state 분리”를 켜면 그
        조각이 번들 밖으로 빠져나갑니다 — baked-in과 dynamic의 경계가 여기서 갈립니다.
      </figcaption>
    </figure>
  );
}
