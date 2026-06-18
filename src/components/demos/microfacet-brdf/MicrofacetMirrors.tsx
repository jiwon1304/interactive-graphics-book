import { useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2D, seededNoise, type Canvas2DContext } from './shared';

// 패싯(미세 거울) 개수와 입사광선 개수.
const FACET_COUNT = 22;
const RAY_COUNT = 9;
// 입사광선 방향(화면 기준, 캔버스 y는 아래로 증가): 위에서 비스듬히 내려옴 → y는 양수. (정규화)
const INCIDENT = (() => {
  const v = { x: 0.45, y: 1 };
  const len = Math.hypot(v.x, v.y);
  return { x: v.x / len, y: v.y / len };
})();

interface DrawParams {
  roughness: number;
  showNormals: boolean;
  showRays: boolean;
}

// 2D 반사: r = d - 2(d·n)n
function reflect2D(
  dx: number,
  dy: number,
  nx: number,
  ny: number,
): { x: number; y: number } {
  const dot = dx * nx + dy * ny;
  return { x: dx - 2 * dot * nx, y: dy - 2 * dot * ny };
}

function drawScene(c: Canvas2DContext, p: DrawParams) {
  const { ctx, width, height, colors } = c;
  const surfaceY = height * 0.62;
  const margin = 24;
  const span = width - margin * 2;
  const facetW = span / FACET_COUNT;

  // 패싯별 기울기: 시드 기반 고정 난수 × 거칠기. (결정론적이라 흔들리지 않음)
  // 최대 ±55° 정도까지 기울게.
  const maxTilt = (55 * Math.PI) / 180;
  const tilts: number[] = [];
  for (let i = 0; i < FACET_COUNT; i++) {
    tilts.push(seededNoise(i) * p.roughness * maxTilt);
  }

  // 거시 표면선 (점선)
  ctx.strokeStyle = colors.muted;
  ctx.globalAlpha = 0.45;
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, surfaceY);
  ctx.lineTo(width - margin, surfaceY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // 거시 법선 (가운데 위로) — 통계의 평균 방향. 회색 광선·면 법선과 묻히지 않게 강조.
  {
    const nx = width / 2;
    const tipY = surfaceY - 66;
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(nx, surfaceY);
    ctx.lineTo(nx, tipY);
    ctx.stroke();
    // 화살촉
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.moveTo(nx, tipY - 3);
    ctx.lineTo(nx - 5.5, tipY + 9);
    ctx.lineTo(nx + 5.5, tipY + 9);
    ctx.closePath();
    ctx.fill();
    // 라벨 (굵게)
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('거시 법선 n', nx + 10, tipY + 6);
  }

  // 각 패싯 그리기
  for (let i = 0; i < FACET_COUNT; i++) {
    const cx = margin + (i + 0.5) * facetW;
    const tilt = tilts[i];
    // 패싯 방향 벡터(거울 면)와 그 법선
    const fx = Math.cos(tilt);
    const fy = Math.sin(tilt);
    const half = facetW * 0.46;
    const x0 = cx - fx * half;
    const y0 = surfaceY - fy * half;
    const x1 = cx + fx * half;
    const y1 = surfaceY + fy * half;

    // 미세 거울 면 (두꺼운 강조선)
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // 면 법선 (위쪽 반평면을 향하도록)
    let nx = fy;
    let ny = -fx;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    if (p.showNormals) {
      ctx.strokeStyle = colors.text;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, surfaceY);
      ctx.lineTo(cx + nx * 16, surfaceY + ny * 16);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  if (p.showRays) {
    // 입사 광선들(평행) → 표면 위 일정 간격으로 명중 → 패싯 법선 기준 반사
    const rayStartLen = 70;
    for (let r = 0; r < RAY_COUNT; r++) {
      const hitX = margin + ((r + 0.5) / RAY_COUNT) * span;
      // 명중한 패싯 인덱스
      const fi = Math.min(
        FACET_COUNT - 1,
        Math.max(0, Math.floor(((hitX - margin) / span) * FACET_COUNT)),
      );
      const tilt = tilts[fi];
      const fx = Math.cos(tilt);
      const fy = Math.sin(tilt);
      let nx = fy;
      let ny = -fx;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const hitY = surfaceY;

      // 입사 광선 (위에서 내려옴, 회색)
      ctx.strokeStyle = colors.muted;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(hitX - INCIDENT.x * rayStartLen, hitY - INCIDENT.y * rayStartLen);
      ctx.lineTo(hitX, hitY);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 반사 광선 (강조색)
      const refl = reflect2D(INCIDENT.x, INCIDENT.y, nx, ny);
      const reflLen = 78;
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(hitX, hitY);
      ctx.lineTo(hitX + refl.x * reflLen, hitY + refl.y * reflLen);
      ctx.stroke();
      // 화살촉
      const ahx = hitX + refl.x * reflLen;
      const ahy = hitY + refl.y * reflLen;
      const ang = Math.atan2(refl.y, refl.x);
      ctx.beginPath();
      ctx.moveTo(ahx, ahy);
      ctx.lineTo(
        ahx - 6 * Math.cos(ang - 0.4),
        ahy - 6 * Math.sin(ang - 0.4),
      );
      ctx.lineTo(
        ahx - 6 * Math.cos(ang + 0.4),
        ahy - 6 * Math.sin(ang + 0.4),
      );
      ctx.closePath();
      ctx.fillStyle = colors.accent;
      ctx.fill();
    }
  }

  // 라벨
  ctx.fillStyle = colors.muted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('입사광 →', margin, 18);
}

/**
 * 위젯 A — 미세 거울 단면.
 * 거칠기를 키우면 패싯들이 제멋대로 기울어 반사광이 부채처럼 퍼지고,
 * 0에 가까우면 거의 평행해져 한 방향으로 모인다.
 */
export default function MicrofacetMirrors() {
  const [roughness, setRoughness] = useState(0.35);
  const [showNormals, setShowNormals] = useState(true);
  const [showRays, setShowRays] = useState(true);

  const ref = useCanvas2D(
    260,
    (c) => drawScene(c, { roughness, showNormals, showRays }),
    [roughness, showNormals, showRays],
  );

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ height: 260 }}>
        <canvas ref={ref} style={{ display: 'block' }} />
      </div>
      <ControlPanel>
        <Slider
          label="거칠기 (roughness)"
          value={roughness}
          min={0}
          max={1}
          step={0.01}
          onChange={setRoughness}
          format={(v) => v.toFixed(2)}
        />
        <ToggleControl label="면 법선 표시" checked={showNormals} onChange={setShowNormals} />
        <ToggleControl label="광선 표시" checked={showRays} onChange={setShowRays} />
      </ControlPanel>
      <figcaption>
        <strong>직접 해보세요:</strong> 거칠기 슬라이더를 0 → 1로 올려보세요. 0에 가까우면 미세
        거울들이 거의 평행하게 정렬돼 반사광이 한 방향으로 모이고(선명한 하이라이트), 거칠수록
        제각각 기울어 반사광이 부채처럼 흩어집니다(번진 하이라이트). 거칠기는 결국 미세 법선들의
        <em> 통계적 흩어짐</em>입니다.
      </figcaption>
    </figure>
  );
}
