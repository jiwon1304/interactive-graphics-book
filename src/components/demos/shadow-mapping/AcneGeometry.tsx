import { useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { useCanvas2D, type Canvas2DContext } from './shared';

// 왜 acne가 생기는가: depth map의 한 texel은 표면의 한 구간을 "하나의 깊이값"으로 양자화한다.
// 비스듬한 표면 위에서 그 구간 안의 실제 깊이는 기록값보다 앞/뒤로 갈리고,
// 뒤로 간 부분은 자기 자신을 그림자로 오판한다. bias는 비교선을 통째로 들어올려 이를 막는다.
interface DrawParams {
  slopeDeg: number; // 표면 기울기
  bias: number; // 0..1 정규화된 bias(시각화용)
}

const N_TEXELS = 7;

function drawScene(c: Canvas2DContext, p: DrawParams) {
  const { ctx, width, height, colors } = c;
  const M = { l: 18, r: 18, t: 22, b: 24 };
  const W = width - M.l - M.r;
  const H = height - M.t - M.b;
  const midY = M.t + H * 0.5;

  // 표면(직선)을 기울인다. y는 아래로 증가하므로 깊이(광원에서 멀수록)는 y가 클수록 큼(시각 단순화).
  const slope = Math.tan((p.slopeDeg * Math.PI) / 180);
  const surfX0 = M.l;
  const surfX1 = M.l + W;
  const surfY = (x: number) => midY + (x - (M.l + W / 2)) * slope * 0.5;

  const texelW = W / N_TEXELS;

  // 각 texel: 그 중앙의 표면 깊이를 "기록값"으로 저장(계단형). 표면은 연속.
  // 기록된 깊이선(계단)
  for (let i = 0; i < N_TEXELS; i++) {
    const x0 = M.l + i * texelW;
    const x1 = x0 + texelW;
    const cxm = (x0 + x1) / 2;
    const recorded = surfY(cxm) + p.bias * 40; // bias만큼 비교선을 아래(=더 멀게)로 내림
    // texel 칸
    ctx.strokeStyle = colors.border;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, M.t, texelW, H);
    ctx.globalAlpha = 1;
    // 기록 깊이(계단 선분)
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, recorded);
    ctx.lineTo(x1, recorded);
    ctx.stroke();

    // 이 texel 안에서 표면이 기록선보다 "아래(더 멈)" 인 곳 = acne(자기그림자) 영역을 빨갛게
    const samples = 10;
    for (let s = 0; s < samples; s++) {
      const xx = x0 + (s + 0.5) * (texelW / samples);
      const sy = surfY(xx);
      if (sy > recorded + 0.5) {
        ctx.fillStyle = '#d8443b';
        ctx.beginPath();
        ctx.arc(xx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 실제 연속 표면
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(surfX0, surfY(surfX0));
  ctx.lineTo(surfX1, surfY(surfX1));
  ctx.stroke();

  // 범례
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = colors.text;
  ctx.fillText('— 실제 표면', M.l, M.t - 8);
  ctx.fillStyle = colors.accent;
  ctx.fillText('— 기록된 깊이(texel별 계단)', M.l + 90, M.t - 8);
}

export default function AcneGeometry() {
  const [slopeDeg, setSlopeDeg] = useState(35);
  const [bias, setBias] = useState(0.0);

  const ref = useCanvas2D(240, (c) => drawScene(c, { slopeDeg, bias }), [slopeDeg, bias]);

  return (
    <figure className="demo">
      <div style={{ maxWidth: 380, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
      </div>
      <ControlPanel>
        <Slider label="표면 기울기" value={slopeDeg} min={0} max={60} step={1} onChange={setSlopeDeg} unit="°" />
        <Slider label="bias" value={bias} min={0} max={1} step={0.02} onChange={setBias} />
      </ControlPanel>
      <figcaption>
        depth map의 한 texel은 표면 한 구간의 깊이를 하나의 계단값(파랑)으로 양자화한다. 표면을 기울이면
        한 texel 안에서 실제 표면(검정)이 기록선보다 더 먼 부분이 생기고, 그 점들은 자신이 무언가에
        가려졌다고 오판한다(빨강 = acne). bias를 올리면 비교선이 통째로 내려가(=더 멀다고 침) 표면이
        기록선 위로 올라와 acne가 사라진다. 단, 너무 내리면 실제 가림 물체의 그림자까지 들떠
        peter-panning이 된다.
      </figcaption>
    </figure>
  );
}
