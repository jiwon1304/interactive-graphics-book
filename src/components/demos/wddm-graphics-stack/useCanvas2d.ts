import { useEffect, useRef } from 'react';
import { setupCanvas, readTheme, observeTheme, type ThemeColors } from './wgs2d';

// 이 챕터 위젯 공용 2D 훅. setupCanvas/readTheme/observeTheme를 묶어
// 리사이즈·테마 변경·deps 변화 시 재드로우. 좌표 매퍼는 위젯마다 달라 제외.

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  theme: ThemeColors;
}

export function useCanvas2d(
  draw: (d: DrawCtx) => void,
  deps: ReadonlyArray<unknown>,
): {
  ref: React.RefObject<HTMLCanvasElement | null>;
  redraw: () => void;
} {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const render = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const run = () => {
      const setup = setupCanvas(canvas);
      if (!setup) return;
      const { ctx, w, h } = setup;
      const theme = readTheme(canvas);
      ctx.clearRect(0, 0, w, h);
      drawRef.current({ ctx, w, h, theme });
    };
    render.current = run;
    run();
    const ro = new ResizeObserver(() => run());
    ro.observe(canvas);
    const stopTheme = observeTheme(run);
    return () => {
      ro.disconnect();
      stopTheme();
    };
  }, []);

  useEffect(() => {
    render.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, redraw: () => render.current() };
}
