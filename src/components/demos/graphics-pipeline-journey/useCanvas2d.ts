import { useEffect, useRef } from 'react';
import { setupCanvas, readTheme, observeTheme, type ThemeColors } from './gpj2d';

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  /** CSS 픽셀 폭/높이(이미 dpr 변환이 걸린 좌표계) */
  w: number;
  h: number;
  theme: ThemeColors;
}

/**
 * 2D 위젯 공용 훅.
 * - HiDPI 캔버스 셋업, 리사이즈/테마 변경 시 자동 재드로우
 * - draw 콜백에 ctx/크기/테마를 넘긴다(좌표 매퍼 없음 — 캔버스 픽셀로 직접 그림)
 * - deps가 바뀌면 다시 그린다(draw는 항상 최신 클로저를 ref로 보관)
 *
 * 이 챕터의 삼각형 위젯들은 캔버스 픽셀 공간을 곧 "스크린 공간"으로 쓰므로
 * 별도 매퍼가 필요 없다. 정점 좌표를 캔버스 픽셀로 직접 들고 다닌다.
 * 반환: canvas ref와 강제 redraw 함수.
 */
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
