import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { useCanvas2D, fresnelSchlick, type Canvas2DContext } from './shared';

interface DrawParams {
  f0: number;
  markerDeg: number; // 0..90, 드래그 가능한 각도 표시
}

// 플롯 여백.
const PAD = { l: 44, r: 14, t: 16, b: 30 };

function plotRect(width: number, height: number) {
  return {
    x: PAD.l,
    y: PAD.t,
    w: width - PAD.l - PAD.r,
    h: height - PAD.t - PAD.b,
  };
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

  // 눈금/라벨
  ctx.fillStyle = colors.muted;
  ctx.font = '11px system-ui, sans-serif';
  // y: F=0, 0.5, 1
  for (const fv of [0, 0.5, 1]) {
    const yy = r.y + r.h - fv * r.h;
    ctx.fillText(fv.toFixed(1), 6, yy + 3);
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = colors.border;
    ctx.beginPath();
    ctx.moveTo(r.x, yy);
    ctx.lineTo(r.x + r.w, yy);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // x: 0, 45, 90도
  for (const ad of [0, 45, 90]) {
    const xx = r.x + (ad / 90) * r.w;
    ctx.fillText(`${ad}°`, xx - 8, r.y + r.h + 18);
  }
  ctx.fillText('입사각 θ', r.x + r.w - 52, r.y + r.h + 18);
  ctx.fillText('F', 8, r.y + 8);

  // F(θ) 곡선
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const steps = 90;
  for (let i = 0; i <= steps; i++) {
    const deg = (i / steps) * 90;
    const cosT = Math.cos((deg * Math.PI) / 180);
    const F = fresnelSchlick(cosT, p.f0);
    const xx = r.x + (deg / 90) * r.w;
    const yy = r.y + r.h - F * r.h;
    if (i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.stroke();

  // 드래그 마커(세로선 + 점 + 값)
  const mCos = Math.cos((p.markerDeg * Math.PI) / 180);
  const mF = fresnelSchlick(mCos, p.f0);
  const mx = r.x + (p.markerDeg / 90) * r.w;
  const my = r.y + r.h - mF * r.h;
  ctx.strokeStyle = colors.text;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(mx, r.y);
  ctx.lineTo(mx, r.y + r.h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(mx, my, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.text;
  ctx.font = '12px system-ui, sans-serif';
  const txt = `θ=${p.markerDeg.toFixed(0)}°,  F=${mF.toFixed(3)}`;
  const tw = ctx.measureText(txt).width;
  const tx = Math.min(mx + 8, r.x + r.w - tw - 2);
  ctx.fillText(txt, tx, Math.max(my - 10, r.y + 12));
}

/**
 * 위젯 E — Schlick 프레넬 곡선.
 * F(θ)가 정면(작은 F0)에서 시작해 grazing(90°)에서 1로 치솟는 모습을 본다.
 * 세로선 마커를 드래그해 임의 각도의 F 값을 읽는다.
 */
export default function FresnelCurve() {
  const [f0, setF0] = useState(0.04);
  const [markerDeg, setMarkerDeg] = useState(60);
  const draggingRef = useRef(false);

  const ref = useCanvas2D(
    240,
    (c) => drawScene(c, { f0, markerDeg }),
    [f0, markerDeg],
  );

  const updateFromPointer = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const r = plotRect(rect.width, rect.height);
    const x = e.clientX - rect.left;
    const frac = (x - r.x) / r.w;
    const deg = Math.min(90, Math.max(0, frac * 90));
    setMarkerDeg(deg);
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e);
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    updateFromPointer(e);
  };
  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ height: 240 }}>
        <canvas
          ref={ref}
          style={{ display: 'block', touchAction: 'none', cursor: 'ew-resize' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
      <ControlPanel>
        <Slider
          label="F₀ (정면 반사율)"
          value={f0}
          min={0.02}
          max={1}
          step={0.01}
          onChange={setF0}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          label="각도 마커 θ"
          value={markerDeg}
          min={0}
          max={90}
          step={1}
          onChange={setMarkerDeg}
          unit="°"
        />
      </ControlPanel>
      <figcaption>
        <strong>직접 해보세요:</strong> 곡선 위를 좌우로 드래그(또는 마커 슬라이더)해 각도별 F를
        읽어보세요. 유전체는 F₀≈0.04로 시작하지만, 어떤 재질이든 grazing(θ→90°)에서는 F가 1로
        치솟습니다 — <em>비스듬히 보면 모든 표면이 거울이 됩니다.</em> F₀를 키우면(금속·반짝이는
        재질) 정면에서도 이미 강하게 반사합니다.
      </figcaption>
    </figure>
  );
}
