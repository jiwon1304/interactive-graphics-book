import { useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2D, type Canvas2DContext } from './shared';

interface DrawParams {
  kc: number;
  kl: number;
  kq: number;
  showInvSq: boolean;
}

const PAD = { l: 38, r: 14, t: 14, b: 28 };
const D_MAX = 10; // 거리 축 최대
const Y_MAX = 1; // 감쇠는 0..1로 정규화

function plotRect(w: number, h: number) {
  return { x: PAD.l, y: PAD.t, w: w - PAD.l - PAD.r, h: h - PAD.t - PAD.b };
}

function drawCurve(
  c: Canvas2DContext,
  f: (d: number) => number,
  color: string,
  dash: number[],
) {
  const { ctx, width, height } = c;
  const r = plotRect(width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(dash);
  ctx.beginPath();
  let started = false;
  for (let px = 0; px <= r.w; px += 1) {
    const d = (px / r.w) * D_MAX;
    const att = Math.min(Y_MAX, Math.max(0, f(d)));
    const X = r.x + px;
    const Y = r.y + r.h - (att / Y_MAX) * r.h;
    if (!started) {
      ctx.moveTo(X, Y);
      started = true;
    } else ctx.lineTo(X, Y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawScene(c: Canvas2DContext, p: DrawParams) {
  const { ctx, width, height, colors } = c;
  const r = plotRect(width, height);

  // 축
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r.x, r.y);
  ctx.lineTo(r.x, r.y + r.h);
  ctx.lineTo(r.x + r.w, r.y + r.h);
  ctx.stroke();

  ctx.fillStyle = colors.muted;
  ctx.font = '12px system-ui, sans-serif';
  for (const yv of [0, 0.5, 1]) {
    const Y = r.y + r.h - yv * r.h;
    ctx.fillText(yv.toFixed(1), 8, Y + 4);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = colors.border;
    ctx.beginPath();
    ctx.moveTo(r.x, Y);
    ctx.lineTo(r.x + r.w, Y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const dv of [0, 5, 10]) {
    const X = r.x + (dv / D_MAX) * r.w;
    ctx.fillText(String(dv), X - 4, r.y + r.h + 18);
  }
  ctx.fillText('거리 d', r.x + r.w - 44, r.y + r.h + 18);
  ctx.fillText('밝기', r.x + 4, r.y + 10);

  // 순수 역제곱 1/d² (1로 정규화: d=1에서 1)
  if (p.showInvSq) {
    drawCurve(c, (d) => 1 / Math.max(d * d, 1e-3), colors.muted, [5, 4]);
  }
  // constant + linear + quadratic
  drawCurve(c, (d) => 1 / (p.kc + p.kl * d + p.kq * d * d), colors.accent, []);
}

export default function AttenuationCurve() {
  const [kc, setKc] = useState(1.0);
  const [kl, setKl] = useState(0.09);
  const [kq, setKq] = useState(0.032);
  const [showInvSq, setShowInvSq] = useState(true);

  const ref = useCanvas2D(
    240,
    (c) => drawScene(c, { kc, kl, kq, showInvSq }),
    [kc, kl, kq, showInvSq],
  );

  return (
    <figure className="demo">
      <div style={{ maxWidth: 380, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
      </div>
      <ControlPanel>
        <Slider label="상수항 Kc" value={kc} min={0.1} max={2} step={0.05} onChange={setKc} />
        <Slider label="선형항 Kl" value={kl} min={0} max={1} step={0.01} onChange={setKl} />
        <Slider label="이차항 Kq" value={kq} min={0} max={0.5} step={0.005} onChange={setKq} />
        <ToggleControl label="순수 1/d² 비교" checked={showInvSq} onChange={setShowInvSq} />
      </ControlPanel>
      <figcaption>
        실선: 실무 감쇠식 1/(Kc + Kl·d + Kq·d²). 점선: 순수 역제곱 1/d². Kc를 키우면 근거리에서
        밝기가 1을 넘어 폭발하는 것을 막고, Kl·Kq가 거리에 따른 감소 모양을 정한다. Kc=0, Kl=0, Kq=1로
        두면 점선과 실선이 겹친다(순수 역제곱).
      </figcaption>
    </figure>
  );
}
