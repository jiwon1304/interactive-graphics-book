import { useEffect, useRef } from 'react';
import {
  setupCanvas,
  readTheme,
  observeTheme,
  makeMapper,
  type ThemeColors,
  type Mapper,
} from './sdf2d';

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  theme: ThemeColors;
  map: Mapper;
}

/**
 * 2D 위젯 공용 훅.
 * - HiDPI 캔버스 셋업, 리사이즈/테마 변경 시 자동 재드로우
 * - draw 콜백에 ctx/크기/테마/좌표매퍼를 넘겨준다
 * - deps가 바뀌면 다시 그린다 (draw는 항상 최신 클로저를 ref로 보관)
 * 반환: canvas ref와 강제 redraw 함수
 */
export function useCanvas2d(
  draw: (d: DrawCtx) => void,
  deps: ReadonlyArray<unknown>,
  halfW = 2,
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
      const map = makeMapper(w, h, halfW);
      ctx.clearRect(0, 0, w, h);
      drawRef.current({ ctx, w, h, theme, map });
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
    // halfW는 위젯당 고정값이라 deps에서 제외(런타임에 안 바뀜)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // deps 변화 시 재드로우
  useEffect(() => {
    render.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, redraw: () => render.current() };
}
