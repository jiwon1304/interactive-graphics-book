import { useMemo, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import {
  COLORS,
  monoFont,
  label,
  roundRect,
  withAlpha,
  makeTexture,
  buildMipChain,
  lodFromRho,
  rgbToCss,
  texGet,
  type Texture,
} from './tf2d';

// Mip chain: 레벨마다 가로·세로 1/2(면적 1/4)로 box-filter한 피라미드.
//   - 각 레벨을 실제 텍셀로 그려, downsample이 "2×2를 평균"임을 눈으로.
//   - 슬라이더 rho(픽셀이 덮는 텍셀 수) → lambda = log2(rho). 선택 레벨 강조.
//   - trilinear 토글: lambda를 감싸는 두 정수 레벨을 함께 강조(소수부 = blend 비율).
//   - 메모리 막대: 1 + 1/4 + 1/16 + ... = 4/3 (+33%).

const BASE = 32;

function drawTexture(
  ctx: CanvasRenderingContext2D,
  tex: Texture,
  x: number,
  y: number,
  side: number,
): void {
  const cell = side / tex.size;
  for (let ty = 0; ty < tex.size; ty++) {
    for (let tx = 0; tx < tex.size; tx++) {
      ctx.fillStyle = rgbToCss(texGet(tex, tx, ty));
      ctx.fillRect(x + tx * cell, y + ty * cell, cell + 0.6, cell + 0.6);
    }
  }
}

export default function MipChain() {
  const [rho, setRho] = useState(4);
  const [trilinear, setTrilinear] = useState(true);

  const chain = useMemo(() => buildMipChain(makeTexture(BASE, 'brick')), []);
  const maxL = chain.length - 1;

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const lambda = Math.max(0, Math.min(maxL, lodFromRho(rho)));
    const l0 = Math.floor(lambda);
    const l1 = Math.min(maxL, l0 + 1);
    const frac = lambda - l0;

    // --- 위: 레벨 사각형들(왼=레벨0 큼, 오른쪽으로 1/2씩) ---
    const top = 26;
    const big = Math.min(140, (h - 120));
    const gap = 12;
    // 각 레벨 사각형의 변 길이
    const sides: number[] = [];
    for (let l = 0; l <= maxL; l++) sides.push(Math.max(8, big / Math.pow(2, l)));

    let x = 12;
    const baseY = top + big; // 바닥 정렬
    const rects: Array<{ l: number; x: number; y: number; s: number }> = [];
    for (let l = 0; l <= maxL; l++) {
      const s = sides[l];
      const y = baseY - s;
      drawTexture(ctx, chain[l], x, y, s);
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, s, s);
      label(ctx, x + s / 2, baseY + 12, `L${l}`, theme.muted, 10);
      rects.push({ l, x, y, s });
      x += s + gap;
    }

    // 선택 레벨 강조
    const hi = (l: number, strong: boolean) => {
      const r = rects[l];
      if (!r) return;
      ctx.strokeStyle = COLORS.level;
      ctx.lineWidth = strong ? 3 : 2;
      ctx.globalAlpha = strong ? 1 : 0.55;
      roundRect(ctx, r.x - 3, r.y - 3, r.s + 6, r.s + 6, 5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    if (trilinear) {
      hi(l0, frac < 0.5);
      if (l1 !== l0) hi(l1, frac >= 0.5);
    } else {
      hi(Math.round(lambda), true);
    }

    // --- 아래: 메모리 막대(누적 면적 비) ---
    const barY = baseY + 34;
    const barH = 24;
    const barX = 12;
    const barW = w - 24;
    // 레벨 l의 면적 비 = 1/4^l. 누적 합 = 4/3 까지.
    let acc = 0;
    let total = 0;
    for (let l = 0; l <= maxL; l++) total += 1 / Math.pow(4, l);
    // 전체 폭 = level0(=1) 기준의 total 배. level0이 barW * (1/total) 차지.
    const unit = barW / total;
    for (let l = 0; l <= maxL; l++) {
      const segW = (1 / Math.pow(4, l)) * unit;
      const col = l === 0 ? theme.accent : COLORS.level;
      ctx.fillStyle = withAlpha(col, l === 0 ? 0.85 : 0.5 + 0.0 * l);
      roundRect(ctx, barX + acc, barY, Math.max(1, segW - 1.5), barH, 3);
      ctx.fill();
      acc += segW;
    }
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.font = monoFont(11, 'bold');
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.fillText('L0', barX + 4, barY + barH + 13);
    ctx.fillStyle = theme.muted;
    ctx.font = monoFont(10);
    ctx.fillText('L1~ (꼬리)', barX + unit + 4, barY + barH + 13);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.good;
    ctx.font = monoFont(12, 'bold');
    ctx.fillText('총 1.333× (+33%)', barX + barW, barY + barH + 13);
    ctx.textAlign = 'left';
  };

  const { ref } = useCanvas2d(draw, [rho, trilinear, chain, maxL]);

  const lambda = Math.max(0, Math.min(maxL, lodFromRho(rho)));
  const l0 = Math.floor(lambda);
  const frac = lambda - l0;

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 300, display: 'block' }} />
      <ControlPanel>
        <Slider
          label="rho (픽셀이 덮는 텍셀 수)"
          value={rho}
          min={1}
          max={BASE}
          step={0.1}
          onChange={setRho}
          format={(v) => `${v.toFixed(1)} → λ=${lodFromRho(v).toFixed(2)}`}
        />
        <ToggleControl label="trilinear (두 레벨 blend)" checked={trilinear} onChange={setTrilinear} />
      </ControlPanel>
      <figcaption>
        Mip chain은 원본(L0)을 가로·세로 절반씩 줄여 만든 피라미드입니다. 한 레벨에서 다음 레벨로 갈 때
        2×2 텍셀을 평균(box filter)하므로, 미리 “흐려 둔” 버전이 레벨마다 쌓입니다. 한 픽셀이 덮는 텍셀
        수 <strong>rho</strong>를 슬라이더로 키우면, 고를 레벨{' '}
        <strong>λ = log₂ rho</strong>가 따라 커지며 <span style={{ color: COLORS.level }}>강조 테두리</span>가
        오른쪽(더 작고 흐린 레벨)으로 이동합니다. λ는 보통 정수가 아니라서(지금 λ={lambda.toFixed(2)},
        소수부 {frac.toFixed(2)}), trilinear는 L{l0}과 L{l0 + 1}을 그 소수부 비율로 섞습니다 — 다음
        위젯에서 자세히 봅니다. 비용은? 추가된 레벨들의 면적은 1/4 + 1/16 + … 이라 무한히 더해도{' '}
        <strong>원본의 1/3</strong>뿐 — 전체 mip chain은 원본보다 딱{' '}
        <strong style={{ color: COLORS.good }}>+33%</strong> 큽니다. 이 작은 추가 메모리로 모든 거리의
        앨리어싱을 잡습니다.
      </figcaption>
    </figure>
  );
}
