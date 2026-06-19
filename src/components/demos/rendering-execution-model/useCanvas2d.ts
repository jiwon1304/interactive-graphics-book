import { useEffect, useRef } from 'react';
import { setupCanvas, readTheme, observeTheme, type ThemeColors } from './re2d';

// 이 챕터 위젯 공용 2D 훅.
// re2d.ts의 setupCanvas/readTheme/observeTheme를 묶어, 리사이즈·테마 변경 시
// 자동 재드로우하고 deps 변화 시 다시 그린다. draw는 항상 최신 클로저를 ref로 보관.
// (raymarching-sdf/useCanvas2d.ts와 같은 패턴. 단 좌표 매퍼는 위젯마다 달라 여기선 빼고
//  각 위젯이 픽셀 좌표로 직접 그린다.)

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

  // deps 변화 시 재드로우
  useEffect(() => {
    render.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, redraw: () => render.current() };
}
