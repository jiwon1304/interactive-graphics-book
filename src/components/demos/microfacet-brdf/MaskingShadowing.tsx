import { useState } from 'react';
import { ControlPanel, Slider, type SelectOption, SelectControl } from '../../controls';
import {
  useCanvas2D,
  seededNoise,
  geometrySchlickGGX,
  directK,
  type Canvas2DContext,
} from './shared';

// 표면 프로파일 샘플 개수.
const SAMPLES = 80;

type ViewWhich = 'both' | 'light' | 'view';
const WHICH_OPTIONS: ReadonlyArray<SelectOption<ViewWhich>> = [
  { value: 'both', label: '둘 다 (가림+그늘)' },
  { value: 'light', label: '그늘(광원 차단)만' },
  { value: 'view', label: '가림(시선 차단)만' },
];

interface DrawParams {
  roughness: number;
  lightAngle: number; // 거시 법선 기준 광원 grazing 각(도): 0=정면, 90=수평
  viewAngle: number;
  which: ViewWhich;
}

// 결정론적 높이 프로파일: 여러 시드 난수를 섞어 거칠기에 비례한 진폭.
function heightAt(t: number, roughness: number): number {
  // t in 0..1
  let h = 0;
  h += seededNoise(Math.floor(t * 11), 7.1) * Math.cos(t * 7.0);
  h += 0.6 * seededNoise(Math.floor(t * 23), 19.3) * Math.cos(t * 17.0 + 1.0);
  h += 0.35 * Math.cos(t * 31.0 + 2.0);
  return h * roughness;
}

// 한 점에서 주어진 방향(각도, 거시법선 기준 grazing)으로 봤을 때 가려졌는지.
// 화면 좌표에서 표면을 따라 진행하며 더 높은 점에 막히는지 검사(수평선 테스트).
function isOccluded(
  idx: number,
  heights: number[],
  angleDeg: number,
  fromLeft: boolean,
  amp: number,
): boolean {
  // grazing 각이 클수록(수평에 가까울수록) 광선 기울기가 완만 → 잘 막힘.
  const ang = (angleDeg * Math.PI) / 180;
  // 광선 방향 기울기: dy/dx. 정면(0°)=수직(무한대), 수평(90°)=0.
  // tan(90-angle) = 위로 올라가는 기울기.
  const slope = Math.tan(Math.PI / 2 - ang); // 0..∞
  const dx = 1 / SAMPLES; // 정규화 x 간격(샘플 간 거리는 1)
  const x0 = idx;
  const y0 = heights[idx];
  const dir = fromLeft ? -1 : 1; // 광선이 향하는 쪽
  for (let step = 1; step < SAMPLES; step++) {
    const j = x0 + dir * step;
    if (j < 0 || j >= SAMPLES) break;
    // 광선의 높이: 출발점에서 step만큼 갔을 때.
    const rayY = y0 + slope * step * dx * amp;
    if (heights[j] > rayY + 1e-4) return true; // 더 높은 표면에 막힘
  }
  return false;
}

function drawScene(c: Canvas2DContext, p: DrawParams) {
  const { ctx, width, height, colors } = c;
  const margin = 18;
  const surfaceY = height * 0.7;
  const span = width - margin * 2;
  const amp = 46; // 화면상 높이 진폭(px)

  // 높이 프로파일(정규화 높이 → 화면 y는 위로 갈수록 감소)
  const heights: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    heights.push(heightAt(i / (SAMPLES - 1), p.roughness));
  }

  const px = (i: number) => margin + (i / (SAMPLES - 1)) * span;
  const py = (i: number) => surfaceY - heights[i] * amp;

  // 표면 채우기
  ctx.beginPath();
  ctx.moveTo(px(0), py(0));
  for (let i = 1; i < SAMPLES; i++) ctx.lineTo(px(i), py(i));
  ctx.lineTo(px(SAMPLES - 1), height);
  ctx.lineTo(px(0), height);
  ctx.closePath();
  ctx.fillStyle = colors.surface;
  ctx.fill();
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px(0), py(0));
  for (let i = 1; i < SAMPLES; i++) ctx.lineTo(px(i), py(i));
  ctx.stroke();

  // 각 샘플의 가림/그늘 판정 → 점으로 표시 + 살아남은 비율 집계
  let survivors = 0;
  for (let i = 0; i < SAMPLES; i++) {
    // 광원은 왼쪽 위에서, 시선은 오른쪽 위에서 온다고 가정.
    const shadowed = isOccluded(i, heights, p.lightAngle, true, amp);
    const masked = isOccluded(i, heights, p.viewAngle, false, amp);
    let dead = false;
    if (p.which === 'both') dead = shadowed || masked;
    else if (p.which === 'light') dead = shadowed;
    else dead = masked;
    if (!dead) survivors++;

    const x = px(i);
    const y = py(i);
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    // 살아있음=강조색, 그늘=보라, 가림=회색, (both에서) 둘 다=마젠타.
    if (!dead) ctx.fillStyle = colors.accent;
    else if (p.which === 'both' && shadowed && masked) ctx.fillStyle = '#e5468a';
    else if (shadowed && p.which !== 'view') ctx.fillStyle = '#7a5cff';
    else ctx.fillStyle = '#9aa3b2';
    ctx.fill();
  }

  const frac = survivors / SAMPLES;

  // 광원/시선 방향 화살표(상단)
  const drawDirArrow = (angleDeg: number, fromLeft: boolean, col: string, label: string) => {
    const ang = (angleDeg * Math.PI) / 180;
    // 거시법선 기준 grazing: 화면에서 위쪽 방향으로부터 기울어진 광선.
    const dx = (fromLeft ? 1 : -1) * Math.sin(ang);
    const dy = -Math.cos(ang);
    const ax = fromLeft ? margin + 40 : width - margin - 40;
    const ay = 26;
    const len = 30;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax - dx * len, ay - dy * len);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(label, ax - 8, ay - 14);
  };
  drawDirArrow(p.lightAngle, true, '#e3a008', '광원');
  drawDirArrow(p.viewAngle, false, '#4f9dde', '시선');

  // 살아남은 비율
  ctx.fillStyle = colors.text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`빛 받고 보이는 비율 ≈ ${(frac * 100).toFixed(0)}%`, margin, height - 8);

  // 오른쪽 작은 G1 곡선 (n·x vs G1)
  const gw = Math.min(150, width * 0.36);
  const gh = 76;
  const gx = width - margin - gw;
  const gy = height - gh - 26;
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(gx, gy, gw, gh);
  ctx.fillStyle = colors.muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('Smith G₁ (n·x)', gx + 4, gy - 4);
  const k = directK(p.roughness);
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let s = 0; s <= 60; s++) {
    const ndx = (s / 60) * 1.0;
    const g1 = geometrySchlickGGX(Math.max(ndx, 1e-3), k);
    const xx = gx + (s / 60) * gw;
    const yy = gy + gh - g1 * gh;
    if (s === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
}

/**
 * 위젯 D — 마스킹/섀도잉.
 * 거친 표면 단면에서 광원/시선이 비스듬할수록(그리고 거칠수록) 더 많은 점이
 * 옆 봉우리에 가려지거나(가림) 그늘져(섀도) 에너지를 잃는다. 우하단에 Smith G₁ 곡선.
 */
export default function MaskingShadowing() {
  const [roughness, setRoughness] = useState(0.6);
  const [lightAngle, setLightAngle] = useState(60);
  const [viewAngle, setViewAngle] = useState(60);
  const [which, setWhich] = useState<ViewWhich>('both');

  const ref = useCanvas2D(
    300,
    (c) => drawScene(c, { roughness, lightAngle, viewAngle, which }),
    [roughness, lightAngle, viewAngle, which],
  );

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ height: 300 }}>
        <canvas ref={ref} style={{ display: 'block' }} />
      </div>
      <ControlPanel>
        <Slider label="거칠기" value={roughness} min={0.05} max={1} step={0.01} onChange={setRoughness} format={(v) => v.toFixed(2)} />
        <Slider label="광원 각(grazing)" value={lightAngle} min={0} max={88} step={1} onChange={setLightAngle} unit="°" />
        <Slider label="시선 각(grazing)" value={viewAngle} min={0} max={88} step={1} onChange={setViewAngle} unit="°" />
        <SelectControl label="표시" value={which} options={WHICH_OPTIONS} onChange={setWhich} />
      </ControlPanel>
      <figcaption>
        <strong>직접 해보세요:</strong> 광원·시선 각을 수평(grazing)에 가깝게 키우거나 거칠기를
        올려보세요. <span style={{ color: '#7a5cff' }}>그늘진 점(보라)</span>과
        <span style={{ color: '#9aa3b2' }}> 가려진 점(회색)</span>이 늘며 빛 받고 보이는 비율이
        떨어집니다. 이것이 가장자리가 비현실적으로 타지 않게 막는 G 항의 정체입니다(우하단은 Smith
        G₁ 곡선). <em>점유율 추정은 단순화된 근사</em>지만 경향은 물리와 같습니다.
      </figcaption>
    </figure>
  );
}
