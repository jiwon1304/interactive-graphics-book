import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, label, roundRect, withAlpha, monoFont } from './dxd2d';

// DX9/11/12 책임 분담 비교표(정적). 행=관심사, 열=API 세대.

const ROWS: Array<{ k: string; dx9: string; dx11: string; dx12: string }> = [
  { k: '상태 변환 시점', dx9: 'draw-time 전체', dx11: 'state object + draw', dx12: 'PSO 생성 시' },
  { k: 'hazard / 전이', dx9: '드라이버 자동', dx11: '드라이버 자동', dx12: '앱 Barrier' },
  { k: 'residency', dx9: '드라이버', dx11: '드라이버 (VidMM)', dx12: '앱 MakeResident' },
  { k: '스레딩', dx9: '단일 스레드', dx11: 'immediate + deferred*', dx12: 'N스레드 cmd list' },
  { k: '바인딩', dx9: '슬롯·드라이버 패치', dx11: '슬롯 기반', dx12: 'descriptor heap + root sig' },
  { k: '셰이더 IR', dx9: 'DXBC / FXC', dx11: 'DXBC / FXC', dx12: 'DXIL / DXC' },
];

export default function ApiResponsibilities() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 8;
    const labelW = Math.min(140, w * 0.26);
    const colW = (w - pad * 2 - labelW) / 3;
    const headH = 30;
    const rowH = (h - pad * 2 - headH) / ROWS.length;

    const cols = [
      { name: 'DX9', c: COLORS.dx9 },
      { name: 'DX11', c: COLORS.dx11 },
      { name: 'DX12', c: COLORS.dx12 },
    ];

    // 헤더
    cols.forEach((col, j) => {
      const x = pad + labelW + j * colW;
      roundRect(ctx, x + 2, pad, colW - 4, headH - 4, 6);
      ctx.fillStyle = withAlpha(col.c, 0.9);
      ctx.fill();
      label(ctx, x + colW / 2, pad + (headH - 4) / 2, col.name, '#fff', 13, 'bold');
    });

    // 행
    ROWS.forEach((row, i) => {
      const y = pad + headH + i * rowH;
      // 행 라벨
      ctx.font = monoFont(10, 'bold');
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.k, pad + labelW - 6, y + rowH / 2);
      ctx.textAlign = 'start';
      // 얼룩 배경
      if (i % 2 === 0) {
        ctx.fillStyle = withAlpha(theme.text, 0.04);
        ctx.fillRect(pad + labelW, y, colW * 3, rowH);
      }
      const vals = [
        { v: row.dx9, c: COLORS.dx9 },
        { v: row.dx11, c: COLORS.dx11 },
        { v: row.dx12, c: COLORS.dx12 },
      ];
      vals.forEach((cell, j) => {
        const x = pad + labelW + j * colW;
        label(ctx, x + colW / 2, y + rowH / 2, cell.v, theme.text, 10);
        // DX12 열의 "앱이 직접" 항목을 강조(전이/residency/바인딩)
        if (j === 2 && (row.k === 'hazard / 전이' || row.k === 'residency' || row.k === '바인딩')) {
          ctx.strokeStyle = COLORS.dx12;
          ctx.lineWidth = 1.4;
          roundRect(ctx, x + 4, y + 3, colW - 8, rowH - 6, 5);
          ctx.stroke();
        }
      });
      // 열 구분선
      ctx.strokeStyle = withAlpha(theme.text, 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad + labelW, y);
      ctx.lineTo(pad + labelW + colW * 3, y);
      ctx.stroke();
    });
    for (let j = 0; j <= 3; j++) {
      const x = pad + labelW + j * colW;
      ctx.strokeStyle = withAlpha(theme.text, 0.12);
      ctx.beginPath();
      ctx.moveTo(x, pad + headH);
      ctx.lineTo(x, h - pad);
      ctx.stroke();
    }
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 300, display: 'block' }} />
      <figcaption>
        세 API의 책임 분담. DX9는 거의 모든 일을 드라이버가 <strong>draw-time에</strong> 합니다 — 흩어진
        <code>SetRenderState</code> 호출을 모았다가 draw 순간 전부 검증·변환합니다. DX11은 immutable
        <strong> state object</strong>로 상태 변환을 생성 시점으로 일부 당겼지만, hazard tracking(같은
        리소스를 SRV/RTV로 동시 바인딩 방지 등)·전이·residency는 여전히 드라이버가 자동으로 처리합니다.
        DX12는 거의 전부를 <strong>앱으로 넘깁니다</strong>(<span style={{ color: COLORS.dx12 }}>초록
        테두리</span>): 상태는 <strong>PSO</strong>로 생성 시 완전히 컴파일되고, hazard는 명시적
        <code> ResourceBarrier</code>, residency는 <code>MakeResident</code>/<code>Evict</code>, 바인딩은
        descriptor heap과 root signature로 앱이 직접 관리합니다. (*DX11 deferred context는 드라이버가
        네이티브 command list를 지원하지 않으면 runtime이 에뮬레이트해 실질 병렬 이득이 제한적이었습니다.)
        DX12의 “얇은 드라이버”란 이 자동화들을 걷어낸 결과입니다.
      </figcaption>
    </figure>
  );
}
