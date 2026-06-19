// rendering-execution-model 챕터 공용 2D 유틸.
// 픽셀 쿼드 / 미분 / early-Z / Hi-Z / 오버드로 위젯이 공유하는:
//   - HiDPI 캔버스 셋업(setupCanvas)
//   - 테마 색 읽기(readTheme) + 테마 변경 관찰(observeTheme)
//   - putImageData 대용 blitImage (dpr 변환 존중; AUTHORING-GUIDE §5.1)
//   - roundRect / withAlpha / monoFont / COLORS (의미색)
//
// sdf2d.ts(=blitImage 패턴) + cq2d.ts(=roundRect/withAlpha/의미색 패턴)에서 적응.
// 주의: 일부 위젯은 픽셀 격자(쿼드)를 채우므로 blitImage가 필요하고,
//       일부는 순수 벡터 도식이라 setupCanvas한 ctx에 곧장 그린다.

// ---- 테마 색 읽기 ----

export interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
}

/** 캔버스 요소의 computed style에서 전역 테마 변수를 읽는다(라이트/다크 자동 적응). */
export function readTheme(el: HTMLElement): ThemeColors {
  const cs = getComputedStyle(el);
  const get = (name: string, fallback: string): string => {
    const v = cs.getPropertyValue(name).trim();
    return v.length > 0 ? v : fallback;
  };
  return {
    bg: get('--bg', '#ffffff'),
    surface: get('--surface', '#f5f6f8'),
    border: get('--border', '#e2e5ea'),
    text: get('--text', '#1a1d23'),
    muted: get('--muted', '#5b6472'),
    accent: get('--accent', '#2f86cf'),
  };
}

/**
 * 테마 변경(html[data-theme]) 감시. 콜백을 재호출하게 해 다시 그리도록.
 * 반환된 함수를 호출하면 관찰 중단.
 */
export function observeTheme(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => obs.disconnect();
}

/**
 * HiDPI 캔버스 셋업. CSS 폭/높이는 그대로 두고 backing store만 dpr배 확대.
 * devicePixelRatio는 2로 상한(모바일 성능).
 * 반환 후의 그리기는 모두 CSS 픽셀 좌표로 한다(ctx에 dpr 변환이 걸려 있음).
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
): { ctx: CanvasRenderingContext2D; w: number; h: number; dpr: number } | null {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 이후 그리기는 CSS 픽셀 좌표
  return { ctx, w, h, dpr };
}

/**
 * dpr 변환이 걸린 ctx에 ImageData를 캔버스 전체로 올바르게 그린다.
 * putImageData는 ctx 변환을 무시(논리 w×h를 디바이스 좌상단에만 그림)하므로,
 * 오프스크린 버퍼를 거쳐 drawImage로 (0,0,w,h)에 올려 변환을 존중하게 한다.
 */
export function blitImage(
  ctx: CanvasRenderingContext2D,
  img: ImageData,
  w: number,
  h: number,
): void {
  const off = document.createElement('canvas');
  off.width = img.width;
  off.height = img.height;
  const octx = off.getContext('2d');
  if (!octx) return;
  octx.putImageData(img, 0, 0);
  ctx.drawImage(off, 0, 0, w, h);
}

// ---- 색 보조 ----

/** 16진수 색 + 알파(0..1)를 8자리 hex로. 테마 색에 투명도를 입힐 때 사용. */
export function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const aa = Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${h}${aa}`;
}

/** '#rrggbb' → [r,g,b] (0..255) */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 선형 보간한 [r,g,b] (0..255). */
export function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

/**
 * 의미색(테마 무관). 라이트·다크 모두에서 충분히 보이는 채도로 고른다.
 * 쿼드/깊이/컬링 도식이 일관된 색 어휘를 쓰도록 한곳에 모음.
 */
export const COLORS = {
  /** 실제 커버된 레인(픽셀) — 파랑 */
  covered: '#3b82f6',
  /** 헬퍼 레인(셰이딩되지만 버려짐) — 주황 */
  helper: '#f59e0b',
  /** 통과/저렴 — 초록 */
  pass: '#22c55e',
  /** 기각/낭비 — 빨강 */
  reject: '#ef4444',
  /** 더 따져봐야 함 / 모호 — 보라 */
  maybe: '#a855f7',
  /** 가까운 면(앞) — 청록 */
  front: '#14b8a6',
  /** 먼 면(뒤) — 분홍 */
  back: '#ec4899',
} as const;

// ---- 캔버스 그리기 보조 ----

export const monoFont = (px: number, weight = ''): string =>
  `${weight ? weight + ' ' : ''}${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;

/** 둥근 사각형 경로를 그린다(채우기/스트로크는 호출자). */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 대각선 빗금(헬퍼 레인 등 "낭비"를 시각적으로 표시). 사각형 영역 안에만. */
export function hatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  gap = 6,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let d = -h; d < w; d += gap) {
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d + h, y + h);
  }
  ctx.stroke();
  ctx.restore();
}

/** 가운데 정렬 텍스트(짧은 캔버스 라벨용). */
export function label(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  text: string,
  color: string,
  px = 11,
  weight = '',
): void {
  ctx.font = monoFont(px, weight);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

/** 포인터 이벤트 → 캔버스 CSS 픽셀 좌표 */
export function pointerToCanvas(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
