import { useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { v2, sub, len, smin, iterColor, type Vec2 } from './sdf2d';

// 같은 2D 씬 (원 + 박스 smooth-union).
const CIRCLE_C = v2(0.4, -0.1);
const CIRCLE_R = 0.62;
const BOX_C = v2(-0.65, 0.2);
const BOX_B = v2(0.5, 0.5);
const BLEND_K = 0.3;

function sceneSdf(p: Vec2): number {
  const dC = len(sub(p, CIRCLE_C)) - CIRCLE_R;
  const dx = Math.abs(p.x - BOX_C.x) - BOX_B.x;
  const dy = Math.abs(p.y - BOX_C.y) - BOX_B.y;
  const dB = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
  return smin(dC, dB, BLEND_K);
}

// 중심차분으로 2D 법선 추정 (셰이딩용).
function normalAt(p: Vec2): Vec2 {
  const e = 0.001;
  const nx = sceneSdf(v2(p.x + e, p.y)) - sceneSdf(v2(p.x - e, p.y));
  const ny = sceneSdf(v2(p.x, p.y + e)) - sceneSdf(v2(p.x, p.y - e));
  const l = Math.hypot(nx, ny) || 1;
  return v2(nx / l, ny / l);
}

const FAR = 8;
// 직교 카메라: 각 화면 "열(column)"마다 위에서 아래로(-y) 광선 하나를 쏜다.
const RAY_DIR = v2(0, -1);

interface ColumnMarch {
  hit: boolean;
  iters: number;
  /** 표면에 닿은 씬 y좌표 (히트 시) */
  hitY: number;
  p: Vec2;
}
// 씬 x고정, 위(topY)에서 아래로 마칭. 한 열당 한 번만 평가해 효율적.
function marchColumn(
  sceneX: number,
  topY: number,
  maxSteps: number,
  eps: number,
): ColumnMarch {
  let t = 0;
  let iters = 0;
  for (let i = 0; i < maxSteps; i++) {
    iters++;
    const p = v2(sceneX + RAY_DIR.x * t, topY + RAY_DIR.y * t);
    const hVal = sceneSdf(p);
    if (hVal < eps) return { hit: true, iters, hitY: p.y, p };
    if (t > FAR) break;
    t += hVal;
  }
  return { hit: false, iters, hitY: -Infinity, p: v2(sceneX, topY - t) };
}

/**
 * 전체 이미지가 "형성"되는 과정. 모든 픽셀에서 광선을 진행시켜 히트/미스를 칠한다.
 * 최대 스텝과 ε를 줄이면 표면이 어떻게 무너지는지(특히 스치는 실루엣) 관찰.
 */
export default function StepBudget() {
  const [maxSteps, setMaxSteps] = useState(64);
  const [eps, setEps] = useState(0.01);
  const [showIters, setShowIters] = useState(false);

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme, map } = d;
    const px = 2; // 픽셀 블록 크기 (성능)
    const img = ctx.createImageData(w, h);
    const data = img.data;

    // 배경색 (미스) — 테마 surface
    const [br, bg, bb] = parseRgb(theme.surface);
    const [ar, ag, ab] = parseRgb(theme.accent);

    // 광원 방향 (좌상단에서)
    const L = v2(-0.5, 0.85);
    const Llen = Math.hypot(L.x, L.y);
    const Ln = v2(L.x / Llen, L.y / Llen);

    // 캔버스 위쪽 1px 행의 씬 y가 광선 시작 y.
    const topY = map.toScene(v2(0, 0)).y;

    for (let xx = 0; xx < w; xx += px) {
      const sceneX = map.toScene(v2(xx + 0.5, 0)).x;
      const col = marchColumn(sceneX, topY, maxSteps, eps);

      for (let yy = 0; yy < h; yy += px) {
        const sceneY = map.toScene(v2(xx + 0.5, yy + 0.5)).y;
        let r: number, g: number, b: number;

        if (showIters) {
          // 표면이 있는 영역(이 픽셀이 도형 내부)만 스텝 수로 칠하고, 바깥은 배경.
          const inside = sceneSdf(v2(sceneX, sceneY)) < eps;
          if (inside && col.hit) {
            [r, g, b] = iterColor(col.iters / maxSteps);
          } else {
            r = br;
            g = bg;
            b = bb;
          }
        } else if (col.hit && sceneSdf(v2(sceneX, sceneY)) < eps) {
          // 표면(히트 깊이 이하 + 도형 내부) → 법선 램버트 셰이딩
          const n = normalAt(v2(sceneX, sceneY));
          const diff = Math.max(0, n.x * Ln.x + n.y * Ln.y) * 0.8 + 0.2;
          r = Math.round(ar * diff);
          g = Math.round(ag * diff);
          b = Math.round(ab * diff);
        } else {
          r = br;
          g = bg;
          b = bb;
        }

        for (let oy = 0; oy < px && yy + oy < h; oy++) {
          for (let ox = 0; ox < px && xx + ox < w; ox++) {
            const idx = ((yy + oy) * w + (xx + ox)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  };

  const { ref } = useCanvas2d(draw, [maxSteps, eps, showIters]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 360, display: 'block' }}
      />
      <ControlPanel>
        <Slider
          label="최대 스텝 수"
          value={maxSteps}
          min={4}
          max={128}
          step={1}
          onChange={(v) => setMaxSteps(Math.round(v))}
          format={(v) => `${Math.round(v)}`}
        />
        <Slider
          label="엡실론 ε"
          value={eps}
          min={0.0005}
          max={0.1}
          step={0.0005}
          onChange={setEps}
          format={(v) => v.toFixed(4)}
        />
        <ToggleControl label="스텝 수 히트맵" checked={showIters} onChange={setShowIters} />
      </ControlPanel>
      <figcaption>
        각 픽셀에서 거리장을 따라 마칭해 표면을 “맞췄는지” 판정합니다. “스텝 수 히트맵”을 켜면 보라(적은
        스텝)→노랑(많은 스텝)으로 한 픽셀이 몇 번 평가됐는지 보입니다.
        <br />
        <strong>직접 해보세요:</strong> 최대 스텝 수를 4까지 낮춰 보세요. 표면을 <em>스치는 실루엣
        (가장자리)</em>부터 먼저 무너집니다 — 거기서는 안전원이 작아 스텝이 많이 필요하니까요. 반대로 ε를
        키우면 표면이 두툼해지며 디테일이 뭉개집니다.
      </figcaption>
    </figure>
  );
}

function parseRgb(color: string): [number, number, number] {
  const c = color.trim();
  const hex = /^#?([0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /rgba?\(([^)]+)\)/i.exec(c);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  }
  return [240, 240, 240];
}
