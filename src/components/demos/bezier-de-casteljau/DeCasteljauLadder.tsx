// 위젯 2 — 드 카스텔조 사다리(★ 핵심).
// t 슬라이더를 움직이면 제어 다각형 위에서 보간이 단계적으로 일어난다.
//   레벨1: 인접 점 3쌍을 t로 보간 → 점 3개, 선분 3개
//   레벨2: 그 3점을 다시 보간 → 점 2개, 선분 2개
//   레벨3: 마지막 보간 → 점 1개 = 곡선 위 점 B(t)
// 단계가 깊어질수록 진한 강조색으로 그려 재귀 구조를 눈으로 드러낸다.

import { useCallback, useState } from 'react';
import { deCasteljau, type Pt } from './geometry';
import { levelAlpha, readPalette } from './canvasKit';
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
  { x: 0.08, y: 0.25 },
  { x: 0.3, y: 0.88 },
  { x: 0.7, y: 0.88 },
  { x: 0.92, y: 0.25 },
];

export default function DeCasteljauLadder() {
  const [points, setPoints] = useState<Pt[]>(INITIAL);
  const [t, setT] = useState(0.4);
  const [showLabels, setShowLabels] = useState(true);

  const draw = useCallback(
    ({ ctx, metrics, draggingIndex }: DrawContext) => {
      const pal = readPalette(ctx.canvas);
      fillBackground(ctx, metrics, pal.surface);

      // 배경에 완성된 곡선을 옅게 깔아 둔다(현재 점이 곡선 위에 있음을 확인).
      drawBezierCurve(ctx, metrics, points, pal.muted, 2);

      const { levels, point } = deCasteljau(points, t);
      const total = levels.length;

      // 레벨 0(제어 다각형)은 점선으로.
      drawControlPolygon(ctx, metrics, levels[0], pal.muted, 0.85);

      // 레벨 1.. 의 보간 선분과 점들. 깊을수록 진하게.
      for (let r = 1; r < total; r++) {
        const level = levels[r];
        const a = levelAlpha(r, total);
        strokePolyline(ctx, metrics, level, { color: pal.accent, width: 2, alpha: a });
        level.forEach((p, i) => {
          drawDot(ctx, metrics, p, {
            radius: 5,
            fill: pal.accent,
            stroke: pal.bg,
            strokeWidth: 1.5,
          });
          if (showLabels && r < total - 1) {
            drawLabel(ctx, metrics, p, `${r}-${i}`, pal.accent, { dx: 8, dy: -9, size: 11 });
          }
        });
      }

      // 최종 점 B(t)를 가장 또렷하게.
      drawDot(ctx, metrics, point, {
        radius: 8,
        fill: pal.accentBrand,
        stroke: pal.bg,
        strokeWidth: 2.5,
      });
      if (showLabels) {
        drawLabel(ctx, metrics, point, `B(${t.toFixed(2)})`, pal.text, { dx: 12, dy: -12 });
      }

      // 제어점(레벨0)은 맨 위에 크게.
      levels[0].forEach((p, i) => {
        const active = i === draggingIndex;
        drawDot(ctx, metrics, p, {
          radius: active ? 8 : 6,
          fill: active ? pal.accent : pal.text,
          stroke: pal.bg,
          strokeWidth: 2,
        });
        if (showLabels) drawLabel(ctx, metrics, p, `P${i}`, pal.muted, { dx: 9, dy: 12, size: 11 });
      });
    },
    [points, t, showLabels],
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
        <Slider label="t" value={t} min={0} max={1} step={0.001} onChange={handleT} format={(v) => v.toFixed(3)} />
        <ToggleControl label="단계 라벨 표시" checked={showLabels} onChange={setShowLabels} />
      </ControlPanel>
      <figcaption>
        <strong>드 카스텔조 구성</strong>입니다. <code>t</code>를 바꾸면 인접한 점들을 같은 비율
        <code>t</code>로 잇따라 보간합니다 — 4개 → 3개 → 2개 → 마지막 한 점. 그 한 점이 바로 곡선 위
        점 <code>B(t)</code>이며, 옅게 깔린 곡선 위를 정확히 따라갑니다. 제어점도 끌어 보세요.
      </figcaption>
    </figure>
  );
}
