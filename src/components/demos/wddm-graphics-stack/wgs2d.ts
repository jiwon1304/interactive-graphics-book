// wddm-graphics-stack 챕터 공용 2D 유틸. directx-driver-internals/dxd2d.ts 복사 + wrapText 추가.
// WDDM 스택·DDI 호출 흐름·residency 페이징·GPUVA 세대 비교·ICD vs UMD 등 정적 도식이 공유한다.
//
// 전부 벡터 도식이라 putImageData를 쓰지 않는다(AUTHORING §5.1 무관). setupCanvas로 dpr 변환을
// 건 ctx에 곧장 그린다. 캔버스 안 글자는 짧은 노드명/수치만, 설명은 MDX figcaption.

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

// ---- 색 ----

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

/** 의미색(테마 무관). 스택 레이어 / 메모리 위치 / API 세대를 일관된 색으로. */
export const COLORS = {
  // 스택 레이어
  app: '#64748b', // 애플리케이션 — 회색
  runtime: '#3b82f6', // D3D runtime / Vulkan loader — 파랑
  umd: '#14b8a6', // user-mode driver / ICD — 청록
  kernel: '#a855f7', // dxgkrnl(VidMm/VidSch) / KMD — 보라
  gpu: '#f59e0b', // GPU — 주황
  // 메모리 위치
  vram: '#22c55e', // VRAM(device-local) — 초록
  sysmem: '#0ea5e9', // system memory — 하늘
  // WDDM 세대
  era1: '#ec4899', // WDDM 1.x (물리주소 + patch) — 분홍
  era2: '#22c55e', // WDDM 2.0 (GPUVA) — 초록
} as const;

// ---- 그리기 보조 ----

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

/** 왼쪽 정렬 텍스트(여러 줄은 호출 측에서 y를 더해 가며). */
export function textL(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  px = 11,
  weight = '',
): void {
  ctx.font = monoFont(px, weight);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.textBaseline = 'alphabetic';
}

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

/** 라벨 박스(채움+테두리+가운데 제목). 짧은 노드명용. */
export function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  title: string,
  theme: ThemeColors,
  opts?: { titleColor?: string; px?: number; alpha?: number; r?: number },
): void {
  const alpha = opts?.alpha ?? 0.16;
  roundRect(ctx, x, y, w, h, opts?.r ?? 7);
  ctx.fillStyle = withAlpha(fill, alpha);
  ctx.fill();
  ctx.strokeStyle = fill;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  label(ctx, x + w / 2, y + h / 2, title, opts?.titleColor ?? theme.text, opts?.px ?? 12, 'bold');
}

// ---- wrapText (모바일 도식 필수) ----
//
// 주어진 폭(maxWidth, CSS px) 안에 들어가도록 공백 기준으로 줄을 나눈다. 한 단어가 폭보다 길면
// 그 단어는 한 줄에 그대로 둔다(자르지 않음 — 보통 토큰/식별자). 반환은 줄 배열.
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  px: number,
  weight = '',
): string[] {
  ctx.font = monoFont(px, weight);
  const words = text.split(/\s+/).filter((s) => s.length > 0);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur.length === 0 ? word : `${cur} ${word}`;
    if (ctx.measureText(next).width <= maxWidth || cur.length === 0) {
      cur = next;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

/**
 * (cx, y0)를 시작으로 가운데 정렬해 여러 줄 텍스트를 그린다. lineH 간격으로 내려가며,
 * 그린 마지막 줄의 baseline y를 반환(다음 요소 배치에 사용). text는 내부에서 wrapText로 줄바꿈.
 */
export function wrapCentered(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y0: number,
  text: string,
  maxWidth: number,
  color: string,
  px: number,
  lineH: number,
  weight = '',
): number {
  const lines = wrapText(ctx, text, maxWidth, px, weight);
  ctx.font = monoFont(px, weight);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = y0;
  for (const ln of lines) {
    ctx.fillText(ln, cx, y);
    y += lineH;
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  return y - lineH;
}
