// ambient-occlusion 챕터 2D 도식 공용 헬퍼(post-processing과 동일 패턴).
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
