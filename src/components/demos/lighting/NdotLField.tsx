import { useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2D, type Canvas2DContext } from './shared';

// 화면을 향한 구(반지름 R)를 정면에서 본 그림.
// 각 픽셀의 법선 N = (x, y, z)는 디스크 좌표 (x, y)와 z = sqrt(1 - x² - y²)로 복원된다.
// 광원 방향 L은 화면 평면 안에서 각도 phi로 회전(간단·견고하게).
interface DrawParams {
  lightDeg: number; // 광원 방향 각도(화면 평면)
  showField: boolean; // N·L 등고선 표시
}

const R_FRAC = 0.4; // 캔버스 폭 대비 구 반지름

function drawScene(c: Canvas2DContext, p: DrawParams) {
  const { ctx, width, height, colors } = c;
  const cx = width / 2;
  const cy = height / 2;
  const R = Math.min(width, height) * R_FRAC;

  // 광원 방향(화면 평면 성분 + 약간의 +z 성분으로 정면에서도 보이게)
  const phi = (p.lightDeg * Math.PI) / 180;
  const lx = Math.cos(phi);
  const ly = -Math.sin(phi); // 캔버스 y는 아래로 증가 → 부호 반전
  const lz = 0.0;
  const llen = Math.hypot(lx, ly, lz) || 1;
  const Lx = lx / llen;
  const Ly = ly / llen;
  const Lz = lz / llen;

  // 구를 픽셀 단위로 셰이딩(작은 그리드로 충분)
  const step = 2;
  for (let py = -R; py <= R; py += step) {
    for (let px = -R; px <= R; px += step) {
      const nx = px / R;
      const ny = py / R;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;
      const nz = Math.sqrt(1 - r2);
      // N·L (음수는 자기 그림자 → 0)
      const ndotl = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
      const v = Math.round(ndotl * 235 + 8);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(cx + px, cy + py, step, step);
    }
  }

  // N·L 등고선(0.25, 0.5, 0.75): 빛이 닿는 정도가 어떻게 띠를 이루는지
  if (p.showField) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.2;
    for (const level of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      for (let a = 0; a <= 360; a += 2) {
        // 각 등고선은 N·L = level 인 점들의 자취. 수치 스캔으로 그린다.
        // 방향 a에서 반지름을 0..R로 훑어 level을 가장 잘 만족하는 r을 찾는다.
        const dir = (a * Math.PI) / 180;
        let best = -1;
        let bestErr = 1;
        for (let rr = 0; rr <= 1; rr += 0.01) {
          const nx = rr * Math.cos(dir);
          const ny = rr * Math.sin(dir);
          const r2 = nx * nx + ny * ny;
          if (r2 > 1) break;
          const nz = Math.sqrt(1 - r2);
          const ndotl = nx * Lx + ny * Ly + nz * Lz;
          const err = Math.abs(ndotl - level);
          if (err < bestErr) {
            bestErr = err;
            best = rr;
          }
        }
        if (best < 0 || bestErr > 0.03) continue;
        const X = cx + best * R * Math.cos(dir);
        const Y = cy + best * R * Math.sin(dir);
        if (a === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // 구 윤곽
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();

  // 광원 방향 화살표(구 밖에서 안으로)
  const start = R + 36;
  const ax = cx - Lx * start;
  const ay = cy - Ly * start;
  const bx = cx - Lx * (R + 8);
  const by = cy - Ly * (R + 8);
  ctx.strokeStyle = colors.accent;
  ctx.fillStyle = colors.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  // 화살촉
  const head = 8;
  const ang = Math.atan2(by - ay, bx - ax);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - head * Math.cos(ang - 0.4), by - head * Math.sin(ang - 0.4));
  ctx.lineTo(bx - head * Math.cos(ang + 0.4), by - head * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = colors.text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('L', ax - 6, ay - 6);
}

export default function NdotLField() {
  const [lightDeg, setLightDeg] = useState(35);
  const [showField, setShowField] = useState(true);

  const ref = useCanvas2D(300, (c) => drawScene(c, { lightDeg, showField }), [lightDeg, showField]);

  return (
    <figure className="demo">
      <div style={{ maxWidth: 360, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
      </div>
      <ControlPanel>
        <Slider
          label="광원 방향"
          value={lightDeg}
          min={-180}
          max={180}
          step={1}
          onChange={setLightDeg}
          unit="°"
        />
        <ToggleControl label="N·L 등고선" checked={showField} onChange={setShowField} />
      </ControlPanel>
      <figcaption>
        정면에서 본 구. 픽셀 밝기는 그 점의 법선 N과 광원 방향 L의 내적 N·L(음수는 0으로 잘림)이다.
        광원을 돌리면 가장 밝은 점(N이 L과 나란한 곳)이 따라 움직이고, 거기서 멀어질수록 코사인으로
        어두워진다. 등고선은 같은 N·L 값을 잇는 띠 — 밝기가 매끄럽게 감소함을 보여준다.
      </figcaption>
    </figure>
  );
}
