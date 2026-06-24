// 그림자 챕터 2D 위젯 공용: 테마/HiDPI 반응형 캔버스 보일러플레이트.
import { useEffect, useRef, type RefObject } from 'react';

export interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
}

export function readThemeColors(el: HTMLElement): ThemeColors {
  const cs = getComputedStyle(el);
  const read = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    return v.length > 0 ? v : fallback;
  };
  return {
    bg: read('--bg', '#ffffff'),
    surface: read('--surface', '#f5f6f8'),
    border: read('--border', '#e2e5ea'),
    text: read('--text', '#1a1d23'),
    muted: read('--muted', '#5b6472'),
    accent: read('--accent', '#2f86cf'),
  };
}

export interface Canvas2DContext {
  ctx: CanvasRenderingContext2D;
  width: number; // CSS px
  height: number; // CSS px
  colors: ThemeColors;
}

/**
 * 반응형 2D 캔버스 보일러플레이트.
 * - devicePixelRatio 처리 + 컨테이너 폭에 맞춘 리사이즈(ResizeObserver)
 * - 테마 토글 감시(MutationObserver) → 색 다시 읽어 재렌더
 */
export function useCanvas2D(
  cssHeight: number,
  draw: (c: Canvas2DContext) => void,
  deps: ReadonlyArray<unknown>,
): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssWidth = Math.max(1, parent.clientWidth);
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      drawRef.current({
        ctx,
        width: cssWidth,
        height: cssHeight,
        colors: readThemeColors(canvas),
      });
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(parent);
    const mo = new MutationObserver(render);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
