import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, roundRect, withAlpha, monoFont, wrapText } from './dev2d';

// DX9/DX11/DX12/Vulkan 책임 분담 비교표(정적). 행=관심사, 열=API.
// directx-driver-internals의 표에 Vulkan 열을 더한 확장판. 열이 4개라 모바일에서 좁으므로
// 셀 텍스트는 wrapText로 줄바꿈하고, 행 높이를 줄 수에 맞춰 가변으로 잡는다(겹침 0).
//
// "앱이 직접" 하는 칸(전이/residency/바인딩의 DX12·Vulkan)은 테두리로 강조 — 통제가 드라이버
// →앱으로 넘어간 칸들.

interface Row {
  k: string;
  vals: [string, string, string, string]; // dx9, dx11, dx12, vulkan
  appCols?: number[]; // 강조할 열 인덱스(2=dx12, 3=vulkan)
}

const ROWS: Row[] = [
  {
    k: '상태 변환',
    vals: ['draw-time 전체', 'state object + draw', 'PSO 생성 시', 'VkPipeline 생성 시'],
  },
  {
    k: 'hazard / 전이',
    vals: ['드라이버 자동', '드라이버 자동', '앱 ResourceBarrier', '앱 pipeline barrier'],
    appCols: [2, 3],
  },
  {
    k: 'residency',
    vals: ['드라이버', '드라이버 (VidMM)', '앱 MakeResident', '앱 메모리 관리'],
    appCols: [2, 3],
  },
  {
    k: '스레딩',
    vals: ['단일 스레드', 'immediate + deferred*', 'N스레드 cmd list', 'N스레드 cmd buffer'],
  },
  {
    k: '바인딩',
    vals: ['슬롯·드라이버 패치', '슬롯 기반', 'descriptor heap + root sig', 'descriptor set + layout'],
    appCols: [2, 3],
  },
  {
    k: '셰이더 IR',
    vals: ['DXBC / FXC', 'DXBC / FXC', 'DXIL / DXC', 'SPIR-V'],
  },
];

const COLS = [
  { name: 'DX9', c: COLORS.dx9 },
  { name: 'DX11', c: COLORS.dx11 },
  { name: 'DX12', c: COLORS.dx12 },
  { name: 'Vulkan', c: COLORS.vulkan },
] as const;

export default function ApiResponsibilities() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;
    const pad = 6;
    const labelW = Math.min(96, Math.max(58, w * 0.18));
    const colW = (w - pad * 2 - labelW) / COLS.length;
    const headH = 26;

    // 셀 폰트(좁으면 더 작게)
    const cellPx = colW < 76 ? 8 : colW < 96 ? 9 : 10;
    const cellPad = 4;
    const lineH = cellPx + 2;

    // 각 행의 줄 수를 먼저 계산해 가변 높이를 잡는다.
    ctx.font = monoFont(cellPx);
    const rowLineCounts = ROWS.map((row) => {
      let maxLines = 1;
      for (const v of row.vals) {
        const n = wrapText(ctx, v, colW - cellPad * 2).length;
        if (n > maxLines) maxLines = n;
      }
      return maxLines;
    });
    const rowHeights = rowLineCounts.map((n) => Math.max(26, n * lineH + 10));

    // 헤더
    COLS.forEach((col, j) => {
      const x = pad + labelW + j * colW;
      roundRect(ctx, x + 2, pad, colW - 4, headH - 4, 6);
      ctx.fillStyle = withAlpha(col.c, 0.9);
      ctx.fill();
      ctx.font = monoFont(colW < 76 ? 11 : 12, 'bold');
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(col.name, x + colW / 2, pad + (headH - 4) / 2);
    });
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // 행
    let y = pad + headH;
    ROWS.forEach((row, i) => {
      const rh = rowHeights[i];

      // 얼룩 배경
      if (i % 2 === 0) {
        ctx.fillStyle = withAlpha(theme.text, 0.04);
        ctx.fillRect(pad + labelW, y, colW * COLS.length, rh);
      }

      // 행 라벨
      ctx.font = monoFont(cellPx, 'bold');
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.k, pad + labelW - 5, y + rh / 2);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';

      // 셀
      row.vals.forEach((v, j) => {
        const x = pad + labelW + j * colW;
        ctx.font = monoFont(cellPx);
        const lines = wrapText(ctx, v, colW - cellPad * 2);
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const total = (lines.length - 1) * lineH;
        lines.forEach((ln, li) => {
          ctx.fillText(ln, x + colW / 2, y + rh / 2 - total / 2 + li * lineH);
        });
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        // "앱이 직접" 칸 강조
        if (row.appCols && row.appCols.includes(j)) {
          ctx.strokeStyle = COLS[j].c;
          ctx.lineWidth = 1.4;
          roundRect(ctx, x + 3, y + 3, colW - 6, rh - 6, 5);
          ctx.stroke();
        }
      });

      // 행 구분선
      ctx.strokeStyle = withAlpha(theme.text, 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad + labelW, y);
      ctx.lineTo(pad + labelW + colW * COLS.length, y);
      ctx.stroke();

      y += rh;
    });

    // 세로 구분선
    for (let j = 0; j <= COLS.length; j++) {
      const x = pad + labelW + j * colW;
      ctx.strokeStyle = withAlpha(theme.text, 0.12);
      ctx.beginPath();
      ctx.moveTo(x, pad + headH);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 320, display: 'block' }} />
      <figcaption>
        네 API의 책임 분담을 한 장으로. <span style={{ color: COLORS.dx9 }}>DX9</span>는 거의 모든 일을
        드라이버가 <strong>draw-time에</strong> 합니다 — 흩어진 <code>SetRenderState</code> 호출을
        모았다가 draw 순간 전부 검증·변환합니다. <span style={{ color: COLORS.dx11 }}>DX11</span>은
        immutable <strong>state object</strong>로 상태 변환을 생성 시점으로 일부 당겼지만, hazard
        tracking·전이·residency는 여전히 드라이버가 자동으로 처리합니다. <span style={{ color: COLORS.dx12 }}>
        DX12</span>와 <span style={{ color: COLORS.vulkan }}>Vulkan</span>은 그 자동화들을 걷어내{' '}
        <strong>앱으로 넘깁니다</strong>(테두리 친 칸): 상태는 PSO / <code>VkPipeline</code> 생성 시
        완전히 컴파일되고, hazard는 명시적 <code>ResourceBarrier</code> / <code>vkCmdPipelineBarrier</code>,
        바인딩은 descriptor heap+root signature / descriptor set+layout으로 앱이 직접 관리합니다. 두
        API의 열이 거의 같다는 점에 주목하세요 — 같은 문제(드라이버 per-draw 오버헤드)에 대한 같은
        답입니다. (*DX11 deferred context는 드라이버가 네이티브 command list를 지원하지 않으면 runtime이
        에뮬레이트해 실질 병렬 이득이 제한적이었습니다.)
      </figcaption>
    </figure>
  );
}
