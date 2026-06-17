import { useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2D, distributionGGX, type Canvas2DContext } from './shared';

interface DrawParams {
  roughness: number;
  showGhost: boolean;
  ghostRoughness: number;
}

// θ(법선 n과 하프벡터 h 사이 각, 라디안)에서 정규화된 D 형상.
// D(0)으로 나눠 봉우리를 1로 맞춘다(거칠기가 작을 때 폭발하는 값을 화면에 담기 위함).
function normalizedD(theta: number, roughness: number): number {
  const alpha = roughness * roughness;
  const d = distributionGGX(Math.cos(theta), alpha);
  const d0 = distributionGGX(1, alpha); // θ=0
  return d / d0;
}

function drawLobe(
  c: Canvas2DContext,
  roughness: number,
  color: string,
  alpha: number,
  fill: boolean,
) {
  const { ctx, width, height } = c;
  const cx = width / 2;
  const cy = height * 0.9; // 바닥 근처에 원점(반-극좌표: 위쪽 반원만)
  const radius = Math.min(width * 0.42, height * 0.78);

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = fill ? 2 : 1.5;
  ctx.beginPath();
  // θ를 -90°..+90°로 훑으며 반지름 ∝ 정규화 D. θ=0이 위쪽(정점).
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const theta = (-Math.PI / 2) + (i / steps) * Math.PI; // -90..90
    const rNorm = normalizedD(Math.abs(theta), roughness);
    const r = rNorm * radius;
    // θ=0 → 위(-y). θ가 +면 오른쪽.
    const px = cx + Math.sin(theta) * r;
    const py = cy - Math.cos(theta) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  if (fill) {
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.globalAlpha = alpha * 0.18;
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawScene(c: Canvas2DContext, p: DrawParams) {
  const { ctx, width, height, colors } = c;
  const cx = width / 2;
  const cy = height * 0.9;
  const radius = Math.min(width * 0.42, height * 0.78);

  // 기준선: 거시 표면(가로) + 법선 방향(세로, θ=0)
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - radius - 12, cy);
  ctx.lineTo(cx + radius + 12, cy);
  ctx.stroke();

  ctx.strokeStyle = colors.muted;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - radius - 8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // θ=0 라벨(봉우리)
  ctx.fillStyle = colors.muted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('θ = 0  (n·h = 1, 봉우리)', cx + 6, cy - radius + 4);

  // 비교용 고스트 로브
  if (p.showGhost) {
    drawLobe(c, p.ghostRoughness, colors.muted, 0.55, false);
  }
  // 현재 로브(강조색, 채움)
  drawLobe(c, p.roughness, colors.accent, 1, true);
}

/**
 * 위젯 C — GGX 분포 로브.
 * D(θ)를 정규화한 형상을 반-극좌표 로브로 그린다. 거칠기를 줄이면 봉우리가
 * 좁고 뾰족해지고, 키우면 낮고 넓게 퍼진다(형상만, 절대값 아님).
 */
export default function GGXLobe() {
  const [roughness, setRoughness] = useState(0.3);
  const [showGhost, setShowGhost] = useState(true);
  const [ghostRoughness] = useState(0.7);

  const ref = useCanvas2D(
    280,
    (c) => drawScene(c, { roughness, showGhost, ghostRoughness }),
    [roughness, showGhost, ghostRoughness],
  );

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ height: 280 }}>
        <canvas ref={ref} style={{ display: 'block' }} />
      </div>
      <ControlPanel>
        <Slider
          label="거칠기 (roughness)"
          value={roughness}
          min={0.02}
          max={1}
          step={0.01}
          onChange={setRoughness}
          format={(v) => v.toFixed(2)}
        />
        <ToggleControl label="비교용 로브(거칠기 0.7) 겹쳐 보기" checked={showGhost} onChange={setShowGhost} />
      </ControlPanel>
      <figcaption>
        <strong>직접 해보세요:</strong> 거칠기를 줄여보세요. 로브가 위쪽(θ=0)으로 좁고 뾰족하게
        솟구치면 하이라이트가 작고 강해집니다. 거칠게 하면 같은 봉우리가 낮고 넓게 퍼져
        광택이 번집니다. 값이 거칠기가 작을 때 폭발하므로 봉우리를 1로 <em>정규화한 형상</em>만
        보여줍니다 — 비교용 회색 로브(거칠기 0.7)와 폭을 견줘 보세요.
      </figcaption>
    </figure>
  );
}
