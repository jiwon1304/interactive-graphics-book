// 위젯 1 — 드래그 놀이터(훅).
// 3차(제어점 4개) 베지에 곡선. 아무 점이나 끌면 곡선과 제어 다각형이 실시간으로 다시 그려진다.
// "곡선이 점에 끌려온다"는 직관을 손으로 느끼게 하는 도입용 위젯.

import { useCallback, useState } from 'react';
import type { Pt } from './geometry';
import { readPalette } from './canvasKit';
import { useBezierCanvas, type DrawContext } from './useBezierCanvas';
import {
  drawBezierCurve,
  drawControlPolygon,
  drawDot,
  drawLabel,
  fillBackground,
} from './draw';

const INITIAL: Pt[] = [
  { x: 0.08, y: 0.22 },
  { x: 0.32, y: 0.85 },
  { x: 0.68, y: 0.85 },
  { x: 0.92, y: 0.22 },
];

export default function DraggablePlayground() {
  const [points, setPoints] = useState<Pt[]>(INITIAL);

  const draw = useCallback(
    ({ ctx, metrics, draggingIndex }: DrawContext) => {
      const canvas = ctx.canvas;
      const pal = readPalette(canvas);
      fillBackground(ctx, metrics, pal.surface);

      // 제어 다각형(점선) → 곡선 → 제어점 순으로 위에 쌓는다.
      drawControlPolygon(ctx, metrics, points, pal.muted, 0.9);
      drawBezierCurve(ctx, metrics, points, pal.accent, 3);

      points.forEach((p, i) => {
        const active = i === draggingIndex;
        drawDot(ctx, metrics, p, {
          radius: active ? 9 : 7,
          fill: active ? pal.accent : pal.accentBrand,
          stroke: pal.bg,
          strokeWidth: 2,
        });
        drawLabel(ctx, metrics, p, `P${i}`, pal.text, { dx: 11, dy: -12 });
      });
    },
    [points],
  );

  const { canvasRef, wrapRef } = useBezierCanvas(points, setPoints, draw, { aspect: 1.6 });

  return (
    <figure className="demo">
      <div ref={wrapRef} className="demo-canvas">
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', touchAction: 'none' }} />
      </div>
      <figcaption>
        제어점 <code>P0</code>~<code>P3</code>를 손가락이나 마우스로 끌어 보세요. 곡선이 점들에
        "끌려오는" 모습이 보입니다. 곡선은 항상 양 끝점 <code>P0</code>, <code>P3</code>를 지나지만,
        가운데 두 점은 지나지 않고 방향만 잡아 줍니다.
      </figcaption>
    </figure>
  );
}
