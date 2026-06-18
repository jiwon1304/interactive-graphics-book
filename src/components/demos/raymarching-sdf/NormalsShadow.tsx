import { useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import {
  v2,
  add,
  scale,
  sub,
  len,
  normalize,
  smin,
  makeMapper,
  pointerToCanvas,
  blitImage,
  type Vec2,
} from './sdf2d';

// 같은 씬 (원 + 박스 smooth-union).
const CIRCLE_C = v2(0.45, -0.1);
const CIRCLE_R = 0.6;
const BOX_C = v2(-0.7, 0.2);
const BOX_B = v2(0.45, 0.5);
const BLEND_K = 0.3;

function sceneSdf(p: Vec2): number {
  const dC = len(sub(p, CIRCLE_C)) - CIRCLE_R;
  const dx = Math.abs(p.x - BOX_C.x) - BOX_B.x;
  const dy = Math.abs(p.y - BOX_C.y) - BOX_B.y;
  const dB = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
  return smin(dC, dB, BLEND_K);
}

// 중심차분 법선 (∇f / |∇f|). 셰이딩·그림자에 "공짜"로 따라온다.
function gradNormal(p: Vec2): Vec2 {
  const e = 0.002;
  const nx = sceneSdf(v2(p.x + e, p.y)) - sceneSdf(v2(p.x - e, p.y));
  const ny = sceneSdf(v2(p.x, p.y + e)) - sceneSdf(v2(p.x, p.y - e));
  return normalize(v2(nx, ny));
}

// 표면 위 점으로 투영 (몇 번 뉴턴 스텝: p -= f(p)*n).
function projectToSurface(p: Vec2): Vec2 {
  let q = p;
  for (let i = 0; i < 8; i++) {
    const f = sceneSdf(q);
    q = sub(q, scale(gradNormal(q), f));
  }
  return q;
}

// 소프트 섀도우: 표면점에서 광원으로 마칭하며 res = min(res, k*h/t).
function softShadow(origin: Vec2, lightPos: Vec2, k: number): number {
  const toL = sub(lightPos, origin);
  const maxT = len(toL);
  const dir = normalize(toL);
  let res = 1;
  let t = 0.02; // 자기 그림자 방지용 약간의 오프셋
  for (let i = 0; i < 64; i++) {
    const p = add(origin, scale(dir, t));
    const h = sceneSdf(p);
    if (h < 0.001) return 0; // 완전 그림자
    res = Math.min(res, (k * h) / t);
    t += Math.max(h, 0.01);
    if (t > maxT) break;
  }
  return Math.max(0, Math.min(1, res));
}

// 표면을 따라 법선 화살표를 찍을 샘플점들 (각도로 원·박스 둘레를 훑음).
function surfaceSamples(): Vec2[] {
  const pts: Vec2[] = [];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // 씬 중앙에서 바깥으로 쏜 방향의 큰 점을 표면에 투영
    const seed = v2(Math.cos(a) * 1.6 - 0.1, Math.sin(a) * 1.3 + 0.05);
    pts.push(projectToSurface(seed));
  }
  return pts;
}

/**
 * 거리장의 "부산물": 법선(∇f)과 소프트 섀도우(run-min of k·h/t)를 보여준다.
 * 별도 계산 없이 f만 평가하면 둘 다 따라온다는 개념.
 */
export default function NormalsShadow() {
  const [light, setLight] = useState<Vec2>(v2(-1.2, 1.1));
  const [k, setK] = useState(8);
  const [showNormals, setShowNormals] = useState(true);
  const dragRef = useRef(false);

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme, map } = d;
    const px = 3;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const [br, bg, bb] = hexRgb(theme.surface, [245, 246, 248]);
    const [ar, ag, ab] = hexRgb(theme.accent, [47, 134, 207]);

    for (let yy = 0; yy < h; yy += px) {
      for (let xx = 0; xx < w; xx += px) {
        const s = map.toScene(v2(xx + 0.5, yy + 0.5));
        const dist = sceneSdf(s);
        let r: number, g: number, b: number;
        if (dist < 0) {
          // 도형 내부: 법선 램버트 + 그림자 (셀프 섀도우는 생략, 외부 점만 그림자)
          const n = gradNormal(s);
          const Ldir = normalize(sub(light, s));
          const diff = Math.max(0, n.x * Ldir.x + n.y * Ldir.y) * 0.85 + 0.15;
          r = Math.round(ar * diff);
          g = Math.round(ag * diff);
          b = Math.round(ab * diff);
        } else {
          // 바깥(바닥 평면 느낌): 광원까지의 소프트 섀도우로 음영
          const sh = softShadow(s, light, k);
          const base = 0.35 + 0.65 * sh;
          r = Math.round(br * base);
          g = Math.round(bg * base);
          b = Math.round(bb * base);
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
    blitImage(ctx, img, w, h);

    // 표면 윤곽선
    ctx.fillStyle = theme.text;
    ctx.beginPath();
    for (let py = 0; py < h; py += 2) {
      for (let pxx = 0; pxx < w; pxx += 2) {
        const s = map.toScene(v2(pxx, py));
        if (Math.abs(sceneSdf(s)) < 0.01) ctx.rect(pxx, py, 1.6, 1.6);
      }
    }
    ctx.fill();

    // 법선 화살표 (4-탭 추정)
    if (showNormals) {
      for (const sp of surfaceSamples()) {
        const n = gradNormal(sp);
        const a = map.toPx(sp);
        const tip = map.toPx(add(sp, scale(n, 0.28)));
        ctx.strokeStyle = theme.text;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        // 화살촉
        const ang = Math.atan2(tip.y - a.y, tip.x - a.x);
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x - 5 * Math.cos(ang - 0.4), tip.y - 5 * Math.sin(ang - 0.4));
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x - 5 * Math.cos(ang + 0.4), tip.y - 5 * Math.sin(ang + 0.4));
        ctx.stroke();
      }
    }

    // 광원 핸들
    const lp = map.toPx(light);
    const grad = ctx.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, 16);
    grad.addColorStop(0, '#ffd76a');
    grad.addColorStop(1, `${theme.surface}00`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#f5b301';
    ctx.fill();
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  const { ref } = useCanvas2d(draw, [light, k, showNormals]);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = true;
    moveLight(e);
  };
  const moveLight = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const map = makeMapper(rect.width, rect.height);
    const s = map.toScene(pointerToCanvas(e, canvas));
    setLight(v2(Math.max(-1.9, Math.min(1.9, s.x)), Math.max(-1.4, Math.min(1.4, s.y))));
  };

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 360, touchAction: 'none', display: 'block', cursor: 'crosshair' }}
        onPointerDown={onDown}
        onPointerMove={(e) => { if (dragRef.current) moveLight(e); }}
        onPointerUp={() => { dragRef.current = false; }}
        onPointerCancel={() => { dragRef.current = false; }}
      />
      <ControlPanel>
        <Slider
          label="그림자 선명도 k"
          value={k}
          min={2}
          max={48}
          step={1}
          onChange={(v) => setK(Math.round(v))}
          format={(v) => `${Math.round(v)}`}
        />
        <ToggleControl label="법선 화살표" checked={showNormals} onChange={setShowNormals} />
      </ControlPanel>
      <figcaption>
        법선(짧은 화살표)은 거리장의 기울기 ∇f를 중심차분으로 추정한 것입니다 — 이미 f를 평가하니
        거의 공짜죠. 바닥의 음영은 각 점에서 광원으로 마칭하며 min(k·h/t)를 누적한 소프트 섀도우입니다.
        <br />
        <strong>직접 해보세요:</strong> 광원(노란 점)을 드래그해 그림자가 어떻게 늘어나는지 보세요. k를
        낮추면 반그림자(penumbra)가 넓고 부드러워지고, 올리면 가장자리가 또렷해집니다.
      </figcaption>
    </figure>
  );
}

function hexRgb(color: string, fallback: [number, number, number]): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
