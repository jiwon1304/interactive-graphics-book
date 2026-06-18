import { useState } from 'react';
import { ControlPanel, Slider, SelectControl, type SelectOption } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import {
  v2,
  sub,
  len,
  combine,
  distanceColor,
  makeMapper,
  pointerToCanvas,
  blitImage,
  type Vec2,
  type BoolOp,
} from './sdf2d';

const OPS: ReadonlyArray<SelectOption<BoolOp>> = [
  { value: 'union', label: '합집합 (smin)' },
  { value: 'intersect', label: '교집합 (smax)' },
  { value: 'subtract', label: '차집합 (A − B)' },
];

const R_A = 0.55;
const R_B = 0.5;

/**
 * 두 프리미티브의 거리장을 부드럽게 합성하는 위젯.
 * smooth-min의 k를 키우면 이음매가 녹아내린다 (과정: 거리장 산술).
 */
export default function SmoothMinBlend() {
  const [cA, setCA] = useState<Vec2>(v2(-0.55, 0));
  const [cB, setCB] = useState<Vec2>(v2(0.55, 0));
  const [k, setK] = useState(0.4);
  const [op, setOp] = useState<BoolOp>('union');
  const [drag, setDrag] = useState<'A' | 'B' | null>(null);

  const field = (p: Vec2): number => {
    const a = len(sub(p, cA)) - R_A;
    const b = len(sub(p, cB)) - R_B;
    return combine(a, b, op, k);
  };

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme, map } = d;
    const px = 3;
    const img = ctx.createImageData(w, h);
    const data = img.data;

    for (let yy = 0; yy < h; yy += px) {
      for (let xx = 0; xx < w; xx += px) {
        const s = map.toScene(v2(xx + 0.5, yy + 0.5));
        const dist = field(s);
        const [r, g, b] = distanceColor(dist);
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

    // 등거리선
    for (let level = -1.2; level <= 1.2 + 1e-6; level += 0.2) {
      const isSurface = Math.abs(level) < 1e-6;
      ctx.fillStyle = isSurface ? theme.text : `${theme.muted}55`;
      ctx.beginPath();
      const sp = 2;
      const tol = 0.014;
      for (let py = 0; py < h; py += sp) {
        for (let pxx = 0; pxx < w; pxx += sp) {
          const s = map.toScene(v2(pxx, py));
          if (Math.abs(field(s) - level) < tol) {
            ctx.rect(pxx, py, isSurface ? 2 : 1.4, isSurface ? 2 : 1.4);
          }
        }
      }
      ctx.fill();
    }

    // 두 프리미티브 핸들 (얇은 점선 원으로 원래 모양 표시)
    drawHandle(ctx, map, cA, R_A, theme.accent, 'A');
    drawHandle(ctx, map, cB, R_B, '#c84e2e', 'B');
  };

  const { ref } = useCanvas2d(draw, [cA, cB, k, op]);

  const pick = (e: React.PointerEvent<HTMLCanvasElement>): 'A' | 'B' | null => {
    const canvas = ref.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const map = makeMapper(rect.width, rect.height);
    const s = map.toScene(pointerToCanvas(e, canvas));
    const dA = len(sub(s, cA));
    const dB = len(sub(s, cB));
    if (dA < R_A + 0.15 && dA <= dB) return 'A';
    if (dB < R_B + 0.15) return 'B';
    return null;
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = pick(e);
    if (t) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag(t);
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag) return;
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const map = makeMapper(rect.width, rect.height);
    const s = map.toScene(pointerToCanvas(e, canvas));
    const c = v2(Math.max(-1.7, Math.min(1.7, s.x)), Math.max(-1.3, Math.min(1.3, s.y)));
    if (drag === 'A') setCA(c);
    else setCB(c);
  };

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 360, touchAction: 'none', display: 'block', cursor: 'grab' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      />
      <ControlPanel>
        <SelectControl label="연산" value={op} options={OPS} onChange={setOp} />
        <Slider
          label="스무스 민 k"
          value={k}
          min={0}
          max={1}
          step={0.01}
          onChange={setK}
          format={(v) => v.toFixed(2)}
        />
      </ControlPanel>
      <figcaption>
        두 원의 거리장을 연산으로 합칩니다. k=0이면 보통의 min/max(날카로운 이음매), k를 키우면 경계가
        부드럽게 녹습니다.
        <br />
        <strong>직접 해보세요:</strong> 두 원(<span style={{ color: 'var(--accent)' }}>A</span>·
        <span style={{ color: '#c84e2e' }}>B</span>)을 드래그해 가까이 붙이고 k를 올려 보세요. 메타볼처럼
        <em> 용접</em>되는 모습이 보입니다. 교집합·차집합으로 바꿔 같은 k가 어떻게 작용하는지도 비교해
        보세요.
      </figcaption>
    </figure>
  );
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  map: { toPx: (p: Vec2) => Vec2; distToPx: (d: number) => number },
  c: Vec2,
  r: number,
  color: string,
  label: string,
) {
  const cp = map.toPx(c);
  const rp = map.distToPx(r);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, rp, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.fillText(label, cp.x + 7, cp.y - 7);
}
