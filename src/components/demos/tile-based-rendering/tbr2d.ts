// tile-based-rendering 챕터 공용 2D 유틸 + 대역폭/전력 모델.
//
// 담는 것:
//   - HiDPI 캔버스 셋업(setupCanvas) · 테마 읽기(readTheme)/관찰(observeTheme)  ← tf2d.ts 패턴
//   - 색 보조(withAlpha) · 그리기 보조(roundRect/label/drawArrow/monoFont)
//   - 의미색 COLORS
//   - 대역폭 모델: IMR vs TBR 외부 DRAM 트래픽, GMEM 타일 크기, pJ/byte 에너지
//
// 캔버스에 격자/타일을 그릴 때는 putImageData(§5.1 함정) 대신 fillRect로 그린다
// (dpr 변환을 그대로 존중 — 좌상단 1/4 버그가 원천적으로 없음).

// ---- 테마 색 읽기 ----

export interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
}

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

/**
 * 의미색(테마 무관). 라이트·다크 모두에서 보이는 채도.
 * TBR 도식이 일관된 색 어휘를 쓰도록 한곳에.
 */
export const COLORS = {
  /** IMR / 외부 DRAM 트래픽 — 빨강(비싼 것) */
  dram: '#ef4444',
  /** TBR / 온칩 GMEM — 초록(공짜에 가까운 것) */
  gmem: '#22c55e',
  /** 강조 / 샘플 / 타일 경계 — 파랑 */
  tile: '#3b82f6',
  /** 보조 강조(geometry·binning) — 보라 */
  geom: '#a855f7',
  /** 경고/낭비/overdraw — 주황 */
  warn: '#f59e0b',
  /** 에너지/전력 — 청록 */
  power: '#14b8a6',
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

/** 화살표(머리 포함). 캔버스 y-down 주의 — 호출 측에서 방향 부호를 확인할 것(§5.5). */
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
  // 머리
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
//  대역폭 / 전력 모델
// ============================================================

/**
 * 외부 DRAM 트래픽(프레임당 바이트).
 *
 * IMR: color/depth 프레임버퍼가 DRAM에 있고, 모든 프래그먼트가 DRAM을
 *   읽고 쓴다. blend/depth-test는 read-modify-write이므로 (read+write).
 *   overdraw가 d배면 그만큼 곱해진다.
 *     bytes_IMR ≈ W·H · bpp · (read + write) · overdraw
 *   여기서 read+write = 2 (color RMW). depth는 별도지만 도식 단순화를 위해
 *   color 트래픽만 모델한다(아래 본문에서 명시).
 *
 * TBR: 타일 내부의 모든 overdraw는 온칩 GMEM에서 일어나 외부로 새지 않는다.
 *   타일이 끝날 때 최종 color만 DRAM에 1회 write(+선택적 1회 initial load).
 *     bytes_TBR ≈ W·H · bpp · 1   (+ geometry/parameter buffer)
 *   즉 overdraw에 거의 불변.
 */
export interface BwInput {
  /** 가로 픽셀 */
  width: number;
  /** 세로 픽셀 */
  height: number;
  /** 픽셀당 바이트(color, 보통 4 = RGBA8) */
  bpp: number;
  /** 평균 overdraw(픽셀당 프래그먼트 수) */
  overdraw: number;
  /** 초당 프레임 */
  fps: number;
  /** 프레임당 parameter buffer(geometry binning) 바이트 — TBR에만 가산 */
  paramBytes?: number;
}

export interface BwResult {
  /** IMR 외부 트래픽 (bytes/s) */
  imr: number;
  /** TBR 외부 트래픽 (bytes/s) */
  tbr: number;
  /** 절감 배수 imr/tbr */
  ratio: number;
}

export function bandwidth(inp: BwInput): BwResult {
  const px = inp.width * inp.height;
  // IMR: color RMW(2) × overdraw. (depth는 단순화로 제외 — 본문에서 명시)
  const imr = px * inp.bpp * 2 * inp.overdraw * inp.fps;
  // TBR: 타일 끝에 color 1회 write. parameter buffer 가산.
  const tbr = (px * inp.bpp * 1 + (inp.paramBytes ?? 0)) * inp.fps;
  return { imr, tbr, ratio: tbr > 0 ? imr / tbr : 0 };
}

/** GMEM에 한 타일이 차지하는 바이트: tile×tile × (color + depth) bytes. */
export function tileFootprintBytes(
  tile: number,
  colorBytes: number,
  depthBytes: number,
): number {
  return tile * tile * (colorBytes + depthBytes);
}

/**
 * 트래픽 에너지: bytes × pJ/byte → picojoule. 1 pJ = 1e-12 J.
 * DRAM 접근은 ~60~150 pJ/byte, 온칩 SRAM/연산은 그 ~1000분의 1 수준.
 */
export const PJ_PER_BYTE_DRAM = 100; // 대표값(60~150 범위 중앙)
export const PJ_PER_BYTE_SRAM = 1; // 온칩 타일 메모리 접근(대략)
export const PJ_PER_FLOP = 0.05; // 연산 1회 ~50 fJ = 0.05 pJ

export function energyPico(bytes: number, pjPerByte: number): number {
  return bytes * pjPerByte;
}

/** 사람이 읽는 단위로 포맷: B/s → GB/s, MB/s 등. */
export function fmtBytesPerSec(bps: number): string {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} GB/s`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} MB/s`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(1)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

export function fmtBytes(b: number): string {
  if (b >= 1e6) return `${(b / 1e6).toFixed(2)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
  return `${Math.round(b)} B`;
}
