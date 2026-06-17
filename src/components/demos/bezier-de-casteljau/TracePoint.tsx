// 위젯 3 — 점이 곡선을 그린다(자취).
// t를 0→1로 애니메이션하면 드 카스텔조 점이 움직이며 지나온 곡선 부분을 점점 칠한다.
// 곡선이 "한 점의 자취"임을 시간으로 보여 준다. 뒤에 사다리를 함께 켤 수 있다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { deCasteljau, sampleBezier, type Pt } from './geometry';
import { levelAlpha, readPalette } from './canvasKit';
import { useBezierCanvas, type DrawContext } from './useBezierCanvas';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import {
  drawBezierCurve,
  drawControlPolygon,
  drawDot,
  fillBackground,
  strokePolyline,
} from './draw';

const INITIAL: Pt[] = [
  { x: 0.08, y: 0.3 },
  { x: 0.28, y: 0.9 },
  { x: 0.62, y: 0.12 },
  { x: 0.92, y: 0.7 },
];

export default function TracePoint() {
  const [points, setPoints] = useState<Pt[]>(INITIAL);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.4); // t/초
  const [showLadder, setShowLadder] = useState(true);

  // t는 ref로 들고 rAF에서 직접 갱신해 리렌더 폭주를 막는다. 그릴 때만 redraw 호출.
  const tRef = useRef(0);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const draw = useCallback(
    ({ ctx, metrics, draggingIndex }: DrawContext) => {
      const pal = readPalette(ctx.canvas);
      fillBackground(ctx, metrics, pal.surface);
      const t = tRef.current;

      // 전체 곡선을 옅게, 지나온 부분(0..t)을 진하게 덧그린다.
      drawBezierCurve(ctx, metrics, points, pal.muted, 2);
      if (t > 0.001) {
        // 0..t 구간을 같은 분해능으로 잘라 진하게 덧칠한다.
        const traced = sampleBezier(points, 80).slice(0, Math.round(80 * t) + 1);
        strokePolyline(ctx, metrics, traced, { color: pal.accent, width: 3.5 });
      }

      const { levels, point } = deCasteljau(points, t);

      // 뒤에 깔리는 사다리(옵션).
      if (showLadder) {
        drawControlPolygon(ctx, metrics, levels[0], pal.muted, 0.7);
        for (let r = 1; r < levels.length; r++) {
          strokePolyline(ctx, metrics, levels[r], {
            color: pal.accentBrand,
            width: 1.5,
            alpha: levelAlpha(r, levels.length) * 0.9,
          });
          levels[r].forEach((p) =>
            drawDot(ctx, metrics, p, { radius: 3.5, fill: pal.accentBrand, stroke: pal.bg, strokeWidth: 1 }),
          );
        }
      }

      // 제어점.
      points.forEach((p, i) => {
        const active = i === draggingIndex;
        drawDot(ctx, metrics, p, {
          radius: active ? 8 : 6,
          fill: active ? pal.accent : pal.text,
          stroke: pal.bg,
          strokeWidth: 2,
        });
      });

      // 달리는 점.
      drawDot(ctx, metrics, point, {
        radius: 8,
        fill: pal.accent,
        stroke: pal.bg,
        strokeWidth: 2.5,
      });
    },
    [points, showLadder],
  );

  const { canvasRef, wrapRef, redraw } = useBezierCanvas(points, setPoints, draw, { aspect: 1.55 });

  // 애니메이션 루프. playing/속도는 ref로 읽어 effect 재구독을 피한다.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (playingRef.current) {
        let nt = tRef.current + speedRef.current * dt;
        if (nt > 1) nt -= 1; // 0..1 루프
        tRef.current = nt;
        redraw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [redraw]);

  return (
    <figure className="demo">
      <div ref={wrapRef} className="demo-canvas">
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', touchAction: 'none' }} />
      </div>
      <ControlPanel>
        <ToggleControl label="재생" checked={playing} onChange={setPlaying} />
        <Slider
          label="속도"
          value={speed}
          min={0.05}
          max={1.2}
          step={0.01}
          onChange={setSpeed}
          format={(v) => `${v.toFixed(2)}/s`}
        />
        <ToggleControl label="사다리 표시" checked={showLadder} onChange={setShowLadder} />
      </ControlPanel>
      <figcaption>
        <strong>재생</strong>을 켜면 드 카스텔조 점이 <code>t=0→1</code>로 달리며 곡선을 칠합니다.
        곡선은 결국 이 한 점이 시간에 따라 남긴 <em>자취</em>입니다. <strong>사다리 표시</strong>를
        켜면 매 순간의 보간 단계가 점 뒤에서 함께 움직입니다. 제어점을 끌면 자취도 바로 바뀝니다.
      </figcaption>
    </figure>
  );
}
