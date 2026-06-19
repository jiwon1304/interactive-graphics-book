import { useMemo, useState } from 'react';
import { ControlPanel, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import {
  COLORS,
  monoFont,
  makeTexture,
  buildMipChain,
  sampleBilinear,
  sampleTrilinear,
  rgbToCss,
  withAlpha,
} from './tf2d';

// Trilinear: 연속 LOD λ의 소수부로 두 정수 mip 레벨을 blend.
// 화면 세로 = 거리(아래=가까움 λ≈0, 위=멀어짐 λ=maxL). 가로 = 텍스처 반복.
//   - OFF: 가장 가까운 정수 레벨만(bilinear). 정수 λ 경계에서 mip seam(가로 띠)이 보인다.
//   - ON: 두 레벨을 소수부로 섞어 seam이 사라진다.

const BASE = 32;
const TILES = 5; // 화면 가로로 반복되는 텍스처 칸 수

export default function Trilinear() {
  const [trilinear, setTrilinear] = useState(false);
  const chain = useMemo(() => buildMipChain(makeTexture(BASE, 'brick')), []);
  const maxL = chain.length - 1;

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const cell = 4;
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);

    for (let r = 0; r < rows; r++) {
      const sy = r / (rows - 1); // 0(위/멈) .. 1(아래/가까움)
      const lambda = (1 - sy) * maxL; // 위로 갈수록 λ 큼
      const v = (1 - sy) * TILES; // 거리에 따라 텍스처가 압축
      for (let c = 0; c < cols; c++) {
        const u = (c / (cols - 1)) * TILES;
        const col = trilinear
          ? sampleTrilinear(chain, u, v, lambda)
          : sampleBilinear(chain[Math.max(0, Math.min(maxL, Math.round(lambda)))], u, v);
        ctx.fillStyle = rgbToCss(col);
        ctx.fillRect(c * cell, r * cell, cell + 0.6, cell + 0.6);
      }
    }

    // 정수 λ 경계선(seam이 생기는 위치) 표시
    ctx.font = monoFont(10, 'bold');
    ctx.textAlign = 'left';
    for (let l = 1; l <= maxL; l++) {
      const sy = 1 - l / maxL;
      const y = sy * h;
      ctx.strokeStyle = withAlpha(theme.text, 0.45);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#000';
      ctx.globalAlpha = 0.3;
      ctx.fillRect(2, y + 2, 60, 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.fillText(`λ=${l} (L${l - 1}|L${l})`, 5, y + 12);
    }

    // 상태 배지
    ctx.fillStyle = trilinear ? COLORS.good : COLORS.bad;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(w - 132, 6, 126, 18);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = monoFont(11, 'bold');
    ctx.fillText(trilinear ? 'trilinear ON' : 'mip seam 발생 (OFF)', w - 128, 19);
  };

  const { ref } = useCanvas2d(draw, [trilinear, chain, maxL]);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 260, display: 'block' }} />
      <ControlPanel>
        <ToggleControl label="trilinear (레벨 사이 blend)" checked={trilinear} onChange={setTrilinear} />
      </ControlPanel>
      <figcaption>
        세로축은 거리입니다 — 아래가 가깝고(λ≈0, 선명한 L0), 위로 갈수록 멀어집니다(λ가 커지며 흐린
        레벨). 슬라이더가 가리키는 λ는 거의 항상 정수가 아니므로, 가장 가까운 한 레벨만 쓰면(OFF) 정수
        λ 경계마다 텍스처가 뚝 바뀌는 <span style={{ color: COLORS.bad }}>mip seam</span>(점선 위치의
        가로 띠)이 보입니다. <strong>trilinear를 켜 보세요.</strong> 경계를 감싼 두 레벨 L⌊λ⌋·L⌈λ⌉를
        소수부만큼 섞어, 띠가 <span style={{ color: COLORS.good }}>매끄럽게</span> 녹습니다. 이름 그대로
        “tri” — bilinear(가로·세로 2D) 위에 레벨 차원(1D)을 하나 더 얹어 총 8 텍셀을 보간합니다. 비용은
        샘플 2회(두 레벨 각 4 텍셀)로, 한 레벨 bilinear의 두 배입니다.
      </figcaption>
    </figure>
  );
}
