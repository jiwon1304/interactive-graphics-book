import { useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { useCanvas2D, type Canvas2DContext } from './shared';

// CSM 개념도: 카메라 view frustum을 거리로 N개 cascade로 쪼갠다.
// 각 cascade는 같은 해상도(같은 크기 depth map)를 자기 구간에 배정 →
// 가까운 cascade는 작은 영역에 고밀도, 먼 cascade는 넓은 영역에 저밀도.
interface DrawParams {
  numCascades: number;
  lambda: number; // 0=linear, 1=logarithmic
}

const NEAR = 1;
const FAR = 50;
const CASCADE_COLORS = ['#3b7fd1', '#3aa86b', '#e08a3c', '#a05cd6'];

function splitDistances(n: number, lambda: number): number[] {
  // CSM 표준 split: linear와 logarithmic의 lambda 혼합
  const splits: number[] = [];
  for (let i = 1; i < n; i++) {
    const f = i / n;
    const logd = NEAR * Math.pow(FAR / NEAR, f);
    const lind = NEAR + (FAR - NEAR) * f;
    splits.push(lambda * logd + (1 - lambda) * lind);
  }
  return splits;
}

function drawScene(c: Canvas2DContext, p: DrawParams) {
  const { ctx, width, height, colors } = c;
  const M = { l: 16, r: 16, t: 26, b: 40 };
  const W = width - M.l - M.r;
  const H = height - M.t - M.b;

  // 위: 평면도로 본 frustum(삼각형 부채꼴). 카메라는 왼쪽 꼭짓점.
  const camX = M.l;
  const camY = M.t + H * 0.5;
  const apex = 0.42; // 부채꼴 반각 비율
  const toX = (dist: number) => camX + (dist / FAR) * W;
  const halfH = (dist: number) => (dist / FAR) * (H * 0.5) * (apex / 0.42);

  const bounds = [NEAR, ...splitDistances(p.numCascades, p.lambda), FAR];

  // 각 cascade 영역(사다리꼴)
  for (let i = 0; i < p.numCascades; i++) {
    const d0 = bounds[i];
    const d1 = bounds[i + 1];
    const color = CASCADE_COLORS[i % CASCADE_COLORS.length];
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(toX(d0), camY - halfH(d0));
    ctx.lineTo(toX(d1), camY - halfH(d1));
    ctx.lineTo(toX(d1), camY + halfH(d1));
    ctx.lineTo(toX(d0), camY + halfH(d0));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // frustum 외곽
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(camX, camY);
  ctx.lineTo(toX(FAR), camY - halfH(FAR));
  ctx.moveTo(camX, camY);
  ctx.lineTo(toX(FAR), camY + halfH(FAR));
  ctx.stroke();

  // 카메라
  ctx.fillStyle = colors.text;
  ctx.beginPath();
  ctx.arc(camX, camY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('카메라', camX - 2, camY + halfH(FAR) + 16);
  ctx.fillText('멀리 →', toX(FAR) - 40, camY + halfH(FAR) + 16);

  // 아래: 각 cascade가 같은 해상도 map을 자기 구간에 배정 → 단위거리당 texel 밀도 막대
  const barY = M.t + H + 14;
  const barH = 12;
  ctx.font = '11px system-ui, sans-serif';
  for (let i = 0; i < p.numCascades; i++) {
    const d0 = bounds[i];
    const d1 = bounds[i + 1];
    const x0 = toX(d0);
    const x1 = toX(d1);
    const color = CASCADE_COLORS[i % CASCADE_COLORS.length];
    ctx.fillStyle = color;
    ctx.fillRect(x0, barY, x1 - x0, barH);
    // 밀도(같은 map을 좁은 구간에 → 가까울수록 촘촘) 텍스트
    const density = Math.round((W / p.numCascades / Math.max(x1 - x0, 1)) * 100);
    ctx.fillStyle = colors.text;
    if (x1 - x0 > 26) ctx.fillText(`${density}`, (x0 + x1) / 2 - 6, barY + barH + 12);
  }
  ctx.fillStyle = colors.muted;
  ctx.fillText('상대 texel 밀도(높을수록 선명)', M.l, barY + barH + 26);
}

export default function CascadeSplit() {
  const [numCascades, setNumCascades] = useState(3);
  const [lambda, setLambda] = useState(0.6);

  const ref = useCanvas2D(
    260,
    (c) => drawScene(c, { numCascades, lambda }),
    [numCascades, lambda],
  );

  return (
    <figure className="demo">
      <div style={{ maxWidth: 380, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
      </div>
      <ControlPanel>
        <Slider
          label="cascade 개수"
          value={numCascades}
          min={2}
          max={4}
          step={1}
          onChange={(v) => setNumCascades(Math.round(v))}
        />
        <Slider
          label="split λ (0=선형, 1=로그)"
          value={lambda}
          min={0}
          max={1}
          step={0.05}
          onChange={setLambda}
        />
      </ControlPanel>
      <figcaption>
        카메라 frustum(부채꼴)을 거리로 여러 cascade(색)로 쪼갠다. 각 cascade는 같은 해상도의 depth
        map을 자기 구간에만 배정하므로, 가까운 cascade는 좁은 영역을 고밀도로(선명한 그림자), 먼
        cascade는 넓은 영역을 저밀도로 덮는다. λ를 로그 쪽으로 올리면 가까운 구간이 더 잘게 쪼개져
        근거리 선명도가 올라간다. 이것이 넓은 야외 씬에서 perspective aliasing을 줄이는 방법이다.
      </figcaption>
    </figure>
  );
}
