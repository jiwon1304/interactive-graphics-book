import { useState } from 'react';
import { ControlPanel, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import {
  v2,
  sub,
  len,
  smin,
  distanceColor,
  pointerToCanvas,
  makeMapper,
  blitImage,
  type Vec2,
} from './sdf2d';

// 고정된 작은 씬: 원 + 박스를 smooth-union 한 거리장.
const CIRCLE_C = v2(-0.55, -0.2);
const CIRCLE_R = 0.62;
const BOX_C = v2(0.7, 0.35);
const BOX_B = v2(0.55, 0.42);
const BLEND_K = 0.35;

function sceneSdf(p: Vec2): number {
  const dC = len(sub(p, CIRCLE_C)) - CIRCLE_R;
  const dx = Math.abs(p.x - BOX_C.x) - BOX_B.x;
  const dy = Math.abs(p.y - BOX_C.y) - BOX_B.y;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  const dB = outside + inside;
  return smin(dC, dB, BLEND_K);
}

/**
 * 거리장을 히트맵으로 시각화하고, 커서로 부호거리를 탐침하는 위젯.
 * 핵심: 거리장은 표면뿐 아니라 "모든 점"에서 정의된 실수값이다 (과정: 장을 읽기).
 */
export default function SdfHeatmap() {
  const [probe, setProbe] = useState<Vec2 | null>(null);
  const [showIso, setShowIso] = useState(true);

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme, map } = d;

    // 1) 거리장을 픽셀마다 히트맵으로 (성능 위해 step 픽셀씩 샘플)
    const step = 3;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let py = 0; py < h; py += step) {
      for (let px = 0; px < w; px += step) {
        const s = map.toScene(v2(px + 0.5, py + 0.5));
        const dist = sceneSdf(s);
        const [r, g, b] = distanceColor(dist);
        for (let oy = 0; oy < step && py + oy < h; oy++) {
          for (let ox = 0; ox < step && px + ox < w; ox++) {
            const idx = ((py + oy) * w + (px + ox)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }
    }
    blitImage(ctx, img, w, h);

    // 2) 등거리선 (iso-line): 일정 간격의 부호거리에서 윤곽선.
    if (showIso) {
      const isoStep = 0.2;
      for (let level = -1.4; level <= 1.4 + 1e-6; level += isoStep) {
        const isSurface = Math.abs(level) < 1e-6;
        // 표면(d=0)은 진하게, 나머지는 옅게
        ctx.fillStyle = isSurface ? theme.text : `${theme.muted}55`;
        drawIsoLine(ctx, w, h, map, level, isSurface ? 2 : 1.4);
      }
    }

    // 3) 커서 탐침: 십자선 + 가장 가까운 표면까지의 "안전원".
    if (probe) {
      const dist = sceneSdf(probe);
      const c = map.toPx(probe);
      const rPx = Math.abs(map.distToPx(dist));

      // 안전원 — 표면까지 비어 있음이 보장된 반경
      ctx.beginPath();
      ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 십자선
      ctx.strokeStyle = theme.text;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x - 8, c.y);
      ctx.lineTo(c.x + 8, c.y);
      ctx.moveTo(c.x, c.y - 8);
      ctx.lineTo(c.x, c.y + 8);
      ctx.stroke();

      // 읽기 값 라벨
      const label = `d = ${dist >= 0 ? '+' : ''}${dist.toFixed(3)}`;
      ctx.font = '13px ui-monospace, monospace';
      const tw = ctx.measureText(label).width;
      const lx = Math.min(Math.max(c.x + 12, 4), w - tw - 10);
      const ly = Math.min(Math.max(c.y - 12, 18), h - 8);
      ctx.fillStyle = theme.surface;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(lx - 4, ly - 14, tw + 8, 18);
      ctx.globalAlpha = 1;
      ctx.fillStyle = dist >= 0 ? theme.accent : '#c84e2e';
      ctx.fillText(label, lx, ly);
    }
  };

  const { ref } = useCanvas2d(draw, [probe, showIso]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    const px = pointerToCanvas(e, canvas);
    const rect = canvas.getBoundingClientRect();
    const map = makeMapper(rect.width, rect.height);
    setProbe(map.toScene(px));
  };

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 360, cursor: 'crosshair', display: 'block' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onMove(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons || e.pointerType === 'mouse') onMove(e);
        }}
        onPointerLeave={() => setProbe(null)}
      />
      <ControlPanel>
        <ToggleControl label="등거리선 표시" checked={showIso} onChange={setShowIso} />
      </ControlPanel>
      <figcaption>
        파랑=바깥(d&gt;0), 흰색=표면 근처(d≈0), 따뜻한 색=안쪽(d&lt;0). 진한 선이 실제 표면(d=0)입니다.
        <br />
        <strong>직접 해보세요:</strong> 화면 위에서 커서(또는 손가락)를 움직여 보세요. 점선 원은 그 지점에서{' '}
        <em>가장 가까운 표면까지의 거리</em>(부호거리 d)를 반지름으로 그린 “안전원”입니다. 원이 늘 가장
        가까운 표면에 딱 닿는다는 점에 주목하세요 — 이 값이 레이마칭에서 “한 번에 얼마나 점프해도
        안전한가”를 알려줍니다.
      </figcaption>
    </figure>
  );
}

// 등거리선: 마칭스퀘어 없이, 부호거리의 |d-level| 이 작은 픽셀들을 따라 점을 찍는 간이 방식.
function drawIsoLine(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  map: { toScene: (p: Vec2) => Vec2 },
  level: number,
  dotSize: number,
) {
  const stepPx = 2;
  const tol = 0.012; // 씬 단위 두께 근사
  ctx.beginPath();
  for (let py = 0; py < h; py += stepPx) {
    for (let px = 0; px < w; px += stepPx) {
      const s = map.toScene(v2(px, py));
      if (Math.abs(sceneSdf(s) - level) < tol) {
        ctx.rect(px, py, dotSize, dotSize);
      }
    }
  }
  ctx.fill();
}
