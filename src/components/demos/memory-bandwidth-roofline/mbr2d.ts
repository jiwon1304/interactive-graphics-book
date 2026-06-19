// memory-bandwidth-roofline 챕터 공용 2D 유틸 + 대역폭/roofline 수학.
//
// 담는 것:
//   - HiDPI 캔버스 셋업(setupCanvas) · 테마 읽기(readTheme)/관찰(observeTheme)  ← re2d.ts 패턴
//   - 색 보조(withAlpha/hexToRgb/mixRgb) · 그리기 보조(roundRect/hatch/label/drawArrow/monoFont)
//   - 의미색 COLORS
//   - roofline 수학: P = min(Ppeak, I·B), ridge point I* = Ppeak/B
//   - 대역폭 예산: BW = W·H·bpx·(read+write)·overdraw·fps
//   - DCC 절감비, Morton(Z-order) 코드(비트 인터리브)
//
// 픽셀/텍셀 격자를 그릴 때는 putImageData(§5.1 함정) 대신 셀마다 fillRect로 그린다.

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

/** 테마 변경(html[data-theme]) 감시. 반환 함수 호출 시 관찰 중단. */
export function observeTheme(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => obs.disconnect();
}

/** HiDPI 캔버스 셋업. 이후 그리기는 모두 CSS 픽셀 좌표(ctx에 dpr 변환이 걸려 있음). */
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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

/** 포인터 이벤트 → 캔버스 CSS 픽셀 좌표 */
export function pointerToCanvas(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// ---- 색 보조 ----

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

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToCss(c: RGB): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/**
 * 의미색(테마 무관). 라이트·다크 모두에서 보이는 채도.
 * roofline/대역폭/DCC/Morton 도식이 일관된 색 어휘를 쓰도록 한곳에.
 */
export const COLORS = {
  /** 연산(compute) 쪽 — 파랑 */
  compute: '#3b82f6',
  /** 대역폭(bandwidth)/메모리 트래픽 쪽 — 주황 */
  bandwidth: '#f59e0b',
  /** 좋음/절감/적중(hit) — 초록 */
  good: '#22c55e',
  /** 나쁨/초과/미스(miss)/낭비 — 빨강 */
  bad: '#ef4444',
  /** 보조 강조(anchor·ridge·delta) — 보라 */
  accent2: '#a855f7',
  /** 캐시 라인/블록 경계 — 청록 */
  cache: '#14b8a6',
} as const;

// ---- 캔버스 그리기 보조 ----

export const monoFont = (px: number, weight = ''): string =>
  `${weight ? weight + ' ' : ''}${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;

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

/** 대각선 빗금("낭비/미스"를 시각적으로 표시). 사각형 영역 안에만. */
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

/** 가운데 정렬 짧은 라벨. */
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

/** 화살표(머리 포함). 캔버스 y-down 주의(§5.5). */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width = 2,
  head = 7,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const ax = x1 - ux * head;
  const ay = y1 - uy * head;
  const nx = -uy;
  const ny = ux;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(ax + nx * head * 0.55, ay + ny * head * 0.55);
  ctx.lineTo(ax - nx * head * 0.55, ay - ny * head * 0.55);
  ctx.closePath();
  ctx.fill();
}

// ============================================================
//  Roofline / 대역폭 수학
// ============================================================

/**
 * Roofline 모델. 달성 가능 성능(GFLOPS) = min(peak compute, I·B).
 *   - I  : arithmetic intensity (FLOP/byte)
 *   - B  : bandwidth (GB/s) — 1e9 byte/s 기준이면 I·B 도 GFLOP/s 로 단위가 맞는다.
 *   - peak: peak compute (GFLOPS)
 */
export function rooflinePerf(I: number, B: number, peak: number): number {
  return Math.min(peak, I * B);
}

/** ridge point: bandwidth 지붕과 compute 지붕이 만나는 arithmetic intensity. */
export function ridgePoint(peak: number, B: number): number {
  return peak / Math.max(1e-9, B);
}

/**
 * 한 프레임의 컬러 버퍼 대역폭(GB/s).
 *   BW = W·H·bpx·(read+write)·overdraw·fps  /  1e9
 * bpx 는 byte/pixel. read+write 는 보통 2(블렌딩: 읽고-쓰기), overdraw 는 평균 겹침.
 */
export function frameBandwidthGBps(
  w: number,
  h: number,
  bytesPerPixel: number,
  rw: number,
  overdraw: number,
  fps: number,
): number {
  return (w * h * bytesPerPixel * rw * overdraw * fps) / 1e9;
}

/**
 * Morton(Z-order) 코드: 2D 좌표 (x,y)의 비트를 인터리브한 1D 주소.
 *   code = ... y2 x2 y1 x1 y0 x0  (x가 짝수 비트, y가 홀수 비트)
 * bits 는 좌표당 비트 수(예: 4 → 16×16 격자).
 */
export function mortonEncode(x: number, y: number, bits: number): number {
  let code = 0;
  for (let i = 0; i < bits; i++) {
    code |= ((x >> i) & 1) << (2 * i);
    code |= ((y >> i) & 1) << (2 * i + 1);
  }
  return code;
}

/** row-major(선형) 1D 주소. */
export function linearEncode(x: number, y: number, gridW: number): number {
  return y * gridW + x;
}
