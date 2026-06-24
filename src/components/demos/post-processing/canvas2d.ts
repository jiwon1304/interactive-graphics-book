// post-processing 챕터 2D 도식 공용 헬퍼.
// - 테마 색을 CSS 변수에서 읽고
// - HiDPI 캔버스를 디바이스 해상도로 셋업(AUTHORING-GUIDE §5.1 패턴 B)한다.

export interface ThemeColors {
  text: string;
  muted: string;
  border: string;
  accent: string;
  surface: string;
  bg: string;
}

export function readColors(el: HTMLElement): ThemeColors {
  const cs = getComputedStyle(el);
  const get = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    text: get('--text', '#222'),
    muted: get('--muted', '#888'),
    border: get('--border', '#ccc'),
    accent: get('--accent', '#4f9dde'),
    surface: get('--surface', '#fff'),
    bg: get('--bg', '#fff'),
  };
}

/**
 * 캔버스를 CSS 폭에 맞춰 dpr 배율로 셋업하고, 이후 그리기가 CSS px 좌표를 쓰도록
 * setTransform(dpr,...)을 걸어 둔다. 반환값은 {ctx, w, h}(CSS px 기준 크기).
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  cssH: number,
): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 340;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssW, h: cssH };
}
