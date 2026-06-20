import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, roundRect, withAlpha, label, drawArrow, wrapText } from './pss2d';

// 바인딩/디스크립터 모델 대응(정적). 세로로 3블록을 쌓는다(모바일 열 겹침 방지).
//   D3D11 : 고정 슬롯(PSSetShaderResources 등) — 드라이버가 슬롯→하드웨어 디스크립터 패치
//   D3D12 : root signature(레이아웃) → descriptor table → descriptor heap(실제 디스크립터)
//   Vulkan: pipeline layout(레이아웃) → descriptor set → descriptor pool(backing)
// 같은 역할은 같은 색: 레이아웃=rootsig, 그룹/테이블=heap(청록), 슬롯=slot(주황).

interface Node {
  t: string;
  color: string;
}

interface Model {
  api: string;
  apiColor: string;
  // 좌→우 노드 사슬. 마지막이 "실제 디스크립터 저장소".
  chain: Node[];
  note: string;
}

const MODELS: Model[] = [
  {
    api: 'D3D11',
    apiColor: COLORS.dx11,
    chain: [
      { t: 'PSSetShaderResources(slot)', color: COLORS.slot },
      { t: '고정 슬롯 테이블', color: COLORS.slot },
      { t: '드라이버가 패치', color: COLORS.jit },
    ],
    note: '슬롯 기반 — 드라이버가 draw마다 슬롯을 하드웨어 디스크립터로 변환',
  },
  {
    api: 'D3D12',
    apiColor: COLORS.dx12,
    chain: [
      { t: 'Root Signature', color: COLORS.rootsig },
      { t: 'Descriptor Table', color: COLORS.heap },
      { t: 'Descriptor Heap', color: COLORS.heap },
    ],
    note: 'root signature=레이아웃 · root constant/descriptor는 인라인 · table은 heap 범위 참조',
  },
  {
    api: 'Vulkan',
    apiColor: COLORS.vk,
    chain: [
      { t: 'Pipeline Layout', color: COLORS.rootsig },
      { t: 'Descriptor Set', color: COLORS.heap },
      { t: 'Descriptor Pool', color: COLORS.heap },
    ],
    note: 'pipeline layout = set layouts + push constants · set은 pool에서 할당',
  },
];

export default function BindingModels() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 10;
    const apiW = 52;
    const n = MODELS.length;
    const blockH = (h - pad * 2) / n;
    const x0 = pad + apiW;
    const x1 = w - pad;
    const usableW = x1 - x0;
    const nodeW = Math.min(132, (usableW - 2 * 18) / 3);
    const nodeH = 38;
    const gapX = (usableW - 3 * nodeW) / 2;

    MODELS.forEach((m, mi) => {
      const top = pad + mi * blockH;
      const rowCy = top + blockH / 2 - 8;

      // API 라벨
      label(ctx, pad + apiW / 2 - 2, rowCy, m.api, m.apiColor, 12, 'bold');

      // 노드 사슬
      const centers: number[] = [];
      m.chain.forEach((node, i) => {
        const nx = x0 + i * (nodeW + gapX);
        const ny = rowCy - nodeH / 2;
        centers.push(nx + nodeW / 2);
        roundRect(ctx, nx, ny, nodeW, nodeH, 6);
        ctx.fillStyle = withAlpha(node.color, 0.16);
        ctx.fill();
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        wrapText(ctx, node.t, nx + nodeW / 2, rowCy, nodeW - 8, theme.text, {
          px: 9,
          weight: 'bold',
          lineH: 10.5,
        });
      });
      // 화살표
      for (let i = 0; i < centers.length - 1; i++) {
        drawArrow(ctx, centers[i] + nodeW / 2 + 1, rowCy, centers[i + 1] - nodeW / 2 - 1, rowCy, withAlpha(theme.text, 0.5), 1.5, 6);
      }
      // 노트(블록 하단)
      wrapText(ctx, m.note, x0 + usableW / 2, top + blockH - 13, usableW - 6, theme.muted, {
        px: 8.5,
        lineH: 10,
      });
      // 구분선
      if (mi < n - 1) {
        ctx.strokeStyle = withAlpha(theme.text, 0.12);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, top + blockH);
        ctx.lineTo(w - pad, top + blockH);
        ctx.stroke();
      }
    });
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 300, display: 'block' }} />
      <figcaption>
        리소스를 셰이더에 연결하는 방식의 진화. <span style={{ color: COLORS.dx11 }}>D3D11</span>은{' '}
        <strong>고정 슬롯</strong>입니다 — <code>PSSetShaderResources(slot, …)</code>로 슬롯에 꽂으면
        드라이버가 매 draw마다 그 슬롯 테이블을 하드웨어 디스크립터로 패치합니다(이 패치가 draw당 비용의 한
        축). <span style={{ color: COLORS.dx12 }}>D3D12</span>는 둘로 분리합니다:{' '}
        <strong>root signature</strong>가 <em>레이아웃</em>(어떤 root constant/root descriptor/descriptor
        table이 있는지)을 정하고, 실제 디스크립터는 <strong>descriptor heap</strong>에 앱이 미리 깔아 둡니다.
        table은 heap 안의 범위를 가리킬 뿐이라 draw 시 드라이버 패치가 사라집니다.{' '}
        <span style={{ color: COLORS.vk }}>Vulkan</span>은 같은 구조입니다 —{' '}
        <strong>pipeline layout</strong>(= descriptor set layout들 + push constants)이 레이아웃,{' '}
        <strong>descriptor set</strong>이 D3D12의 descriptor table, <strong>descriptor pool</strong>이 heap에
        대응합니다. 인라인 상수도 대응됩니다: D3D12 <strong>root constant</strong> ↔ Vulkan{' '}
        <strong>push constant</strong>. 같은 문제(per-draw 드라이버 패치 제거)에 대한 두 API의 같은 답입니다.
      </figcaption>
    </figure>
  );
}
