// 위젯 5 — 차수 비교.
// 2차(3점)·3차(4점)·4차(5점) 곡선을 한 t 슬라이더로 동시에 구동한다.
// 같은 t에서 각 곡선의 드 카스텔조 점이 어디에 찍히는지 보며, 차수가 곡선의 "당김"을
// 어떻게 바꾸는지 느낀다. 세 패널 모두 제어점 드래그 가능.

import { useCallback, useState } from 'react';
import { deCasteljau, type Pt } from './geometry';
import { levelAlpha, readPalette } from './canvasKit';
import { useBezierCanvas, type DrawContext } from './useBezierCanvas';
import { ControlPanel, Slider } from '../../controls';
import {
  drawBezierCurve,
  drawControlPolygon,
  drawDot,
  fillBackground,
  strokePolyline,
} from './draw';

const QUADRATIC: Pt[] = [
  { x: 0.1, y: 0.25 },
  { x: 0.5, y: 0.92 },
  { x: 0.9, y: 0.25 },
];
const CUBIC: Pt[] = [
  { x: 0.1, y: 0.25 },
  { x: 0.32, y: 0.92 },
  { x: 0.68, y: 0.92 },
  { x: 0.9, y: 0.25 },
];
const QUARTIC: Pt[] = [
  { x: 0.1, y: 0.25 },
  { x: 0.25, y: 0.9 },
  { x: 0.5, y: 0.2 },
  { x: 0.75, y: 0.9 },
  { x: 0.9, y: 0.25 },
];

/** 한 패널: 자기 제어점과 공유 t를 받아 곡선 + 드 카스텔조 점을 그린다. */
function DegreePanel({
  title,
  points,
  setPoints,
  t,
}: {
  title: string;
  points: Pt[];
  setPoints: (p: Pt[]) => void;
  t: number;
}) {
  const draw = useCallback(
    ({ ctx, metrics, draggingIndex }: DrawContext) => {
      const pal = readPalette(ctx.canvas);
      fillBackground(ctx, metrics, pal.surface);

      drawControlPolygon(ctx, metrics, points, pal.muted, 0.8);
      drawBezierCurve(ctx, metrics, points, pal.accent, 2.5);

      // 드 카스텔조 보간 단계(옅게)와 최종 점.
      const { levels, point } = deCasteljau(points, t);
      for (let r = 1; r < levels.length; r++) {
        strokePolyline(ctx, metrics, levels[r], {
          color: pal.accentBrand,
          width: 1.5,
          alpha: levelAlpha(r, levels.length) * 0.85,
        });
      }
      points.forEach((p, i) => {
        const active = i === draggingIndex;
        drawDot(ctx, metrics, p, {
          radius: active ? 7 : 5,
          fill: active ? pal.accent : pal.text,
          stroke: pal.bg,
          strokeWidth: 1.5,
        });
      });
      drawDot(ctx, metrics, point, { radius: 7, fill: pal.accent, stroke: pal.bg, strokeWidth: 2 });

      // 패널 제목.
      ctx.save();
      ctx.fillStyle = pal.muted;
      ctx.font = '600 12px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(title, 8, 6);
      ctx.restore();
    },
    [points, t, title],
  );

  const { canvasRef, wrapRef } = useBezierCanvas(points, setPoints, draw, { aspect: 1.1 });

  return (
    <div ref={wrapRef} className="demo-canvas" style={{ flex: '1 1 180px', minWidth: 0 }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', touchAction: 'none' }} />
    </div>
  );
}

export default function DegreeCompare() {
  const [t, setT] = useState(0.35);
  const [quad, setQuad] = useState<Pt[]>(QUADRATIC);
  const [cubic, setCubic] = useState<Pt[]>(CUBIC);
  const [quartic, setQuartic] = useState<Pt[]>(QUARTIC);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
        <DegreePanel title="2차" points={quad} setPoints={setQuad} t={t} />
        <DegreePanel title="3차" points={cubic} setPoints={setCubic} t={t} />
        <DegreePanel title="4차" points={quartic} setPoints={setQuartic} t={t} />
      </div>
      <ControlPanel>
        <Slider label="t (공유)" value={t} min={0} max={1} step={0.001} onChange={setT} format={(v) => v.toFixed(3)} />
      </ControlPanel>
      <figcaption>
        하나의 <code>t</code>가 세 곡선의 점을 동시에 움직입니다. 차수가 올라갈수록 제어점이 많아져
        곡선이 더 유연하게 휘지만, <strong>같은 드 카스텔조 절차</strong>(점이 하나 남을 때까지 반복
        보간)가 차수와 무관하게 그대로 적용됩니다. 각 패널의 점을 끌어 모양을 바꿔 보세요.
      </figcaption>
    </figure>
  );
}
