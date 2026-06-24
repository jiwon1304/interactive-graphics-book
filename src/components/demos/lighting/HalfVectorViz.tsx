import { useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2D, type Canvas2DContext } from './shared';

// 평평한 표면(법선 N은 위쪽)을 옆에서 본 단면.
// L(광원), V(시점)을 각도로 두고, H=(L+V)/|L+V|와 R=reflect(-L,N)을 그린다.
interface DrawParams {
  lightDeg: number; // N에서 잰 L의 각도(좌측 +)
  viewDeg: number; // N에서 잰 V의 각도(우측 +)
  showR: boolean;
  showH: boolean;
}

function deg2unit(degFromUp: number, sign: number): [number, number] {
  // 화면 단면: 위가 N(+). 각도는 N(수직)에서 잰다. sign=-1 왼쪽(L), +1 오른쪽(V).
  const a = (degFromUp * Math.PI) / 180;
  return [sign * Math.sin(a), -Math.cos(a)]; // 캔버스 y는 아래로 → -cos
}

function drawArrow(
  c: Canvas2DContext,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  len: number,
  color: string,
  label: string,
  lw = 2.5,
) {
  const { ctx } = c;
  const ex = ox + dx * len;
  const ey = oy + dy * len;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  const ang = Math.atan2(ey - oy, ex - ox);
  const head = 9;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - head * Math.cos(ang - 0.4), ey - head * Math.sin(ang - 0.4));
  ctx.lineTo(ex - head * Math.cos(ang + 0.4), ey - head * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(label, ex + dx * 12 - 4, ey + dy * 12 + 4);
}

function drawScene(c: Canvas2DContext, p: DrawParams) {
  const { ctx, width, height, colors } = c;
  const ox = width / 2;
  const oy = height * 0.72;
  const len = Math.min(width, height) * 0.46;

  // 표면(수평선)
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ox - width * 0.42, oy);
  ctx.lineTo(ox + width * 0.42, oy);
  ctx.stroke();

  // 법선 N (위쪽)
  drawArrow(c, ox, oy, 0, -1, len, colors.muted, 'N', 1.8);

  const [lx, ly] = deg2unit(p.lightDeg, -1);
  const [vx, vy] = deg2unit(p.viewDeg, 1);

  // H = (L+V)/|L+V|
  let hx = lx + vx;
  let hy = ly + vy;
  const hlen = Math.hypot(hx, hy) || 1;
  hx /= hlen;
  hy /= hlen;

  // R = reflect(-L, N), N=(0,-1)단면에서 수직성분만 뒤집기: L=(lx,ly) → R=(-lx... )
  // 표면 법선은 화면상 (0,-1). reflect: R = L - 2(L·N)N, with N=(0,-1) → R=(lx... )
  // L은 표면→광원 방향. R은 표면→반사광 방향. (lx,ly)에 대해 R=(... )
  // N=(0,-1): L·N = -ly. R = L - 2(L·N)N = (lx, ly) - 2(-ly)(0,-1) = (lx, ly - 2ly) = (lx, -ly)
  const rx = lx;
  const ry = -ly;

  drawArrow(c, ox, oy, lx, ly, len, colors.accent, 'L');
  drawArrow(c, ox, oy, vx, vy, len, '#e08a3c', 'V');
  if (p.showR) drawArrow(c, ox, oy, rx, ry, len * 0.92, '#7c5cd6', 'R', 2);
  if (p.showH) drawArrow(c, ox, oy, hx, hy, len * 0.78, '#3aa86b', 'H', 2.5);
}

export default function HalfVectorViz() {
  const [lightDeg, setLightDeg] = useState(50);
  const [viewDeg, setViewDeg] = useState(28);
  const [showR, setShowR] = useState(true);
  const [showH, setShowH] = useState(true);

  const ref = useCanvas2D(
    300,
    (c) => drawScene(c, { lightDeg, viewDeg, showR, showH }),
    [lightDeg, viewDeg, showR, showH],
  );

  return (
    <figure className="demo">
      <div style={{ maxWidth: 360, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
      </div>
      <ControlPanel>
        <Slider label="광원 각 L" value={lightDeg} min={0} max={88} step={1} onChange={setLightDeg} unit="°" />
        <Slider label="시점 각 V" value={viewDeg} min={0} max={88} step={1} onChange={setViewDeg} unit="°" />
        <ToggleControl label="반사벡터 R 표시" checked={showR} onChange={setShowR} />
        <ToggleControl label="하프벡터 H 표시" checked={showH} onChange={setShowH} />
      </ControlPanel>
      <figcaption>
        표면 단면. N은 법선, L은 광원, V는 시점 방향. H = (L+V)/|L+V|는 항상 L과 V의 정확히 가운데를
        가리킨다. Phong은 R(반사벡터)이 V에 얼마나 가까운가를 보고, Blinn-Phong은 H가 N에 얼마나
        가까운가를 본다. L과 V를 움직여 H가 둘 사이를 따라가는 것, 그리고 H가 N과 겹칠 때(=R이 V와
        겹칠 때) 하이라이트가 최대가 됨을 확인해 보세요.
      </figcaption>
    </figure>
  );
}
