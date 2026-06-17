import { useMemo, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import {
  v2,
  add,
  scale,
  sub,
  len,
  smin,
  makeMapper,
  pointerToCanvas,
  type Vec2,
} from './sdf2d';

// 동일한 2D 씬: 원 + 박스의 smooth-union.
const CIRCLE_C = v2(0.45, -0.15);
const CIRCLE_R = 0.6;
const BOX_C = v2(-0.7, 0.25);
const BOX_B = v2(0.45, 0.5);
const BLEND_K = 0.3;

function sceneSdf(p: Vec2): number {
  const dC = len(sub(p, CIRCLE_C)) - CIRCLE_R;
  const dx = Math.abs(p.x - BOX_C.x) - BOX_B.x;
  const dy = Math.abs(p.y - BOX_C.y) - BOX_B.y;
  const dB = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
  return smin(dC, dB, BLEND_K);
}

const MAX_STEPS = 40;
const EPS = 0.01;
const FAR = 6;

interface MarchStep {
  p: Vec2;
  t: number;
  h: number;
}
interface MarchResult {
  steps: MarchStep[];
  hit: boolean;
}

// 스피어 트레이싱: 원점 o, 방향 d(정규화)에서 각 스텝을 기록.
function march(o: Vec2, dir: Vec2): MarchResult {
  const steps: MarchStep[] = [];
  let t = 0;
  let hit = false;
  for (let i = 0; i < MAX_STEPS; i++) {
    const p = add(o, scale(dir, t));
    const h = sceneSdf(p);
    steps.push({ p, t, h });
    if (h < EPS) {
      hit = true;
      break;
    }
    if (t > FAR) break;
    t += h;
  }
  return { steps, hit };
}

type DragTarget = 'origin' | null;

/**
 * 스피어 트레이싱의 한 광선을 스텝 단위로 보여주는 핵심 위젯.
 * 각 점 p_i 에서 안전원(반경 h_i)을 그리고, 그만큼 점프한다.
 */
export default function SphereTraceSteps() {
  const [origin, setOrigin] = useState<Vec2>(v2(-1.6, -0.7));
  const [angleDeg, setAngleDeg] = useState(28);
  const [stepIdx, setStepIdx] = useState(MAX_STEPS); // 보여줄 스텝 수
  const [drag, setDrag] = useState<DragTarget>(null);

  const dir = useMemo(() => {
    const a = (angleDeg * Math.PI) / 180;
    return v2(Math.cos(a), Math.sin(a));
  }, [angleDeg]);

  const result = useMemo(() => march(origin, dir), [origin, dir]);
  const shown = Math.min(stepIdx, result.steps.length);
  const lastStep = result.steps[Math.max(0, shown - 1)];

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme, map } = d;

    // 배경
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    // 표면(d=0) 윤곽
    drawSurface(ctx, w, h, map, theme.text);

    const oPx = map.toPx(origin);

    // 광선 전체 방향 (옅게)
    const farPt = map.toPx(add(origin, scale(dir, FAR)));
    ctx.strokeStyle = `${theme.muted}66`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(oPx.x, oPx.y);
    ctx.lineTo(farPt.x, farPt.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 각 스텝: 안전원 + 점프 + 번호
    for (let i = 0; i < shown; i++) {
      const s = result.steps[i];
      const c = map.toPx(s.p);
      const rPx = Math.abs(map.distToPx(s.h));
      const isLast = i === shown - 1;

      // 안전원
      ctx.beginPath();
      ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
      ctx.strokeStyle = isLast ? theme.accent : `${theme.accent}55`;
      ctx.lineWidth = isLast ? 2 : 1;
      ctx.stroke();

      // 다음 점으로의 점프 (실선)
      if (i + 1 < shown) {
        const nc = map.toPx(result.steps[i + 1].p);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(nc.x, nc.y);
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 점
      ctx.beginPath();
      ctx.arc(c.x, c.y, isLast ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isLast ? theme.accent : theme.text;
      ctx.fill();

      // 번호
      if (isLast || i === 0) {
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillStyle = theme.muted;
        ctx.fillText(`${i}`, c.x + 6, c.y - 6);
      }
    }

    // 마지막 점 상태(히트/미스) 표시
    if (lastStep) {
      const c = map.toPx(lastStep.p);
      const reachedHit = result.hit && shown >= result.steps.length;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = reachedHit ? '#2ea043' : theme.muted;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 원점 핸들
    ctx.beginPath();
    ctx.arc(oPx.x, oPx.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = theme.bg;
    ctx.fill();
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const { ref } = useCanvas2d(draw, [origin, dir, shown, result]);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const map = makeMapper(rect.width, rect.height);
    const px = pointerToCanvas(e, canvas);
    const oPx = map.toPx(origin);
    // 원점 근처면 원점 드래그
    if (Math.hypot(px.x - oPx.x, px.y - oPx.y) < 18) {
      setDrag('origin');
    } else {
      // 그 외에는 클릭 지점을 향하도록 각도 설정
      const s = map.toScene(px);
      const a = Math.atan2(s.y - origin.y, s.x - origin.x);
      setAngleDeg((a * 180) / Math.PI);
    }
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag) return;
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const map = makeMapper(rect.width, rect.height);
    const s = map.toScene(pointerToCanvas(e, canvas));
    const clamped = v2(
      Math.max(-1.9, Math.min(1.9, s.x)),
      Math.max(-1.4, Math.min(1.4, s.y)),
    );
    setOrigin(clamped);
  };

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 360, touchAction: 'none', display: 'block', cursor: 'pointer' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      />
      <ControlPanel>
        <Slider
          label="광선 각도"
          value={angleDeg}
          min={-180}
          max={180}
          step={1}
          onChange={setAngleDeg}
          unit="°"
        />
        <Slider
          label="스텝"
          value={shown}
          min={1}
          max={result.steps.length}
          step={1}
          onChange={(v) => setStepIdx(Math.round(v))}
          format={(v) => `${Math.round(v)} / ${result.steps.length}`}
        />
      </ControlPanel>
      <div
        style={{
          marginTop: '0.6rem',
          fontSize: '0.85rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--muted)',
        }}
      >
        스텝 {Math.max(0, shown - 1)}: t = {lastStep ? lastStep.t.toFixed(3) : '–'}, h ={' '}
        {lastStep ? lastStep.h.toFixed(3) : '–'} —{' '}
        {result.hit && shown >= result.steps.length ? (
          <span style={{ color: '#2ea043' }}>표면에 닿음 (h &lt; ε)</span>
        ) : (
          <span>전진 중…</span>
        )}
      </div>
      <figcaption>
        각 점에서 그린 원은 “안전 거리” h입니다. 그 안에는 어떤 표면도 없으니, 광선을 정확히 h만큼
        점프시켜도 표면을 지나치지 않습니다. h&lt;ε이 되면 표면에 닿은 것으로 봅니다.
        <br />
        <strong>직접 해보세요:</strong> 원점을 드래그하거나 빈 곳을 탭해 광선을 조준하고, “스텝” 슬라이더로
        한 칸씩 전진시켜 보세요. 광선이 표면을 <em>스치듯</em> 지나가게 각도를 맞추면 스텝이 촘촘하게
        쌓이는 게 보입니다. 왜 표면 근처에서 스텝이 작아질까요? (힌트: 안전원이 작아지니까요.)
      </figcaption>
    </figure>
  );
}

function drawSurface(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  map: { toScene: (p: Vec2) => Vec2 },
  color: string,
) {
  const stepPx = 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let py = 0; py < h; py += stepPx) {
    for (let px = 0; px < w; px += stepPx) {
      const s = map.toScene(v2(px, py));
      const d = sceneSdf(s);
      if (d < 0) ctx.rect(px, py, stepPx, stepPx);
    }
  }
  ctx.globalAlpha = 0.16;
  ctx.fill();
  ctx.globalAlpha = 1;
  // 윤곽선(d≈0)
  ctx.beginPath();
  for (let py = 0; py < h; py += stepPx) {
    for (let px = 0; px < w; px += stepPx) {
      const s = map.toScene(v2(px, py));
      if (Math.abs(sceneSdf(s)) < 0.012) ctx.rect(px, py, 2, 2);
    }
  }
  ctx.fill();
}
