// 위젯 6 — 곡선 쪼개기(subdivision).
// t에서 곡선을 왼쪽/오른쪽 두 베지에로 나눈다. 새 제어 다각형 두 벌을 서로 다른 강조색으로 그려,
// 드 카스텔조 중간점들이 그대로 두 반쪽의 새 제어점이 된다는 사실(aha)을 드러낸다.

import { useCallback, useState } from 'react';
import { deCasteljau, subdivide, type Pt } from './geometry';
import { readPalette } from './canvasKit';
import { useBezierCanvas, type DrawContext } from './useBezierCanvas';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import {
  drawBezierCurve,
  drawControlPolygon,
  drawDot,
  drawLabel,
  fillBackground,
  strokePolyline,
} from './draw';

const INITIAL: Pt[] = [
  { x: 0.08, y: 0.28 },
  { x: 0.3, y: 0.9 },
  { x: 0.7, y: 0.9 },
  { x: 0.92, y: 0.28 },
];

export default function SubdivideSplit() {
  const [points, setPoints] = useState<Pt[]>(INITIAL);
  const [t, setT] = useState(0.45);
  const [showOriginal, setShowOriginal] = useState(true);

  const draw = useCallback(
    ({ ctx, metrics, draggingIndex }: DrawContext) => {
      const pal = readPalette(ctx.canvas);
      fillBackground(ctx, metrics, pal.surface);

      const { left, right } = subdivide(points, t);

      // 원본 제어 다각형(옵션)과 원본 곡선을 옅게.
      if (showOriginal) {
        drawControlPolygon(ctx, metrics, points, pal.muted, 0.6);
      }
      drawBezierCurve(ctx, metrics, points, pal.muted, 1.5);

      // 드 카스텔조 보간 단계(중간점들이 곧 새 제어점)를 옅게.
      const { levels } = deCasteljau(points, t);
      for (let r = 1; r < levels.length; r++) {
        strokePolyline(ctx, metrics, levels[r], { color: pal.muted, width: 1, alpha: 0.5 });
      }

      // 왼쪽 반쪽: accent 색.
      drawControlPolygon(ctx, metrics, left, pal.accent, 0.95);
      drawBezierCurve(ctx, metrics, left, pal.accent, 3.5);

      // 오른쪽 반쪽: accentBrand 색(다른 톤).
      drawControlPolygon(ctx, metrics, right, pal.accentBrand, 0.95);
      drawBezierCurve(ctx, metrics, right, pal.accentBrand, 3.5);

      // 새 제어점들(두 반쪽 공유: 분할점은 두 다각형의 공통 끝점).
      left.forEach((p) =>
        drawDot(ctx, metrics, p, {
          radius: 5,
          fill: pal.accent,
          stroke: pal.bg,
          strokeWidth: 1.5,
        }),
      );
      right.forEach((p) =>
        drawDot(ctx, metrics, p, {
          radius: 5,
          fill: pal.accentBrand,
          stroke: pal.bg,
          strokeWidth: 1.5,
        }),
      );

      // 분할점 B(t)을 또렷하게 라벨과 함께.
      const splitPoint = left[left.length - 1]; // = right[0]
      drawDot(ctx, metrics, splitPoint, {
        radius: 8,
        fill: pal.text,
        stroke: pal.bg,
        strokeWidth: 2.5,
      });
      drawLabel(ctx, metrics, splitPoint, `B(${t.toFixed(2)})`, pal.text, { dx: 11, dy: -12 });

      // 원본 제어점(맨 위, 크게).
      points.forEach((p, i) => {
        const active = i === draggingIndex;
        drawDot(ctx, metrics, p, {
          radius: active ? 8 : 6,
          fill: active ? pal.accent : pal.text,
          stroke: pal.bg,
          strokeWidth: 2,
        });
        drawLabel(ctx, metrics, p, `P${i}`, pal.muted, { dx: 9, dy: 12, size: 11 });
      });
    },
    [points, t, showOriginal],
  );

  const { canvasRef, wrapRef, redraw } = useBezierCanvas(points, setPoints, draw, { aspect: 1.55 });

  const handleT = (v: number) => {
    setT(v);
    redraw();
  };

  return (
    <figure className="demo">
      <div ref={wrapRef} className="demo-canvas">
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', touchAction: 'none' }} />
      </div>
      <ControlPanel>
        <Slider label="분할 위치 t" value={t} min={0.02} max={0.98} step={0.001} onChange={handleT} format={(v) => v.toFixed(3)} />
        <ToggleControl label="원본 제어 다각형" checked={showOriginal} onChange={setShowOriginal} />
      </ControlPanel>
      <figcaption>
        <strong>핵심:</strong> <code>t</code>에서의 드 카스텔조 중간점들이 <em>그대로</em> 두 반쪽
        곡선의 새 제어점이 됩니다. 삼각 스킴의 <span style={{ color: 'var(--accent)' }}>왼쪽 변</span>이
        왼쪽 곡선의 제어 다각형, <span style={{ color: 'var(--accent-brand)' }}>오른쪽 변</span>이
        오른쪽 곡선의 제어 다각형입니다. 두 조각을 이으면 원래 곡선과 완전히 같습니다.
      </figcaption>
    </figure>
  );
}
