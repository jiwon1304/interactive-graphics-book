// draw-call-journey 챕터 공용 2D 유틸. directx-driver-internals/dxd2d.ts를 복사하고
// wrapText(여러 줄 자동 줄바꿈)를 추가했다. 모바일 360~440px에서 긴 라벨이 넘치지 않게
// 캔버스 안 텍스트를 줄바꿈하는 데 쓴다.
//
// 전부 벡터 도식이라 putImageData를 쓰지 않는다(AUTHORING §5.1 무관). setupCanvas로 dpr 변환을
// 건 ctx에 곧장 그린다. 캔버스 안 글자는 짧은 노드명/수치만, 긴 설명은 MDX figcaption.

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

export function pointerToCanvas(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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

/** 의미색(테마 무관). 스택 레이어 / API 세대 / CPU 비용 범주를 일관된 색으로. */
export const COLORS = {
  // 스택 레이어
  app: '#64748b', // 애플리케이션 — 회색
  runtime: '#3b82f6', // D3D runtime — 파랑
  umd: '#14b8a6', // user-mode driver — 청록
  kernel: '#a855f7', // dxgkrnl / KMD — 보라
  gpu: '#f59e0b', // GPU — 주황
  // API 세대
  dx9: '#ec4899', // 분홍
  dx11: '#f59e0b', // 주황
  dx12: '#22c55e', // 초록
  vk: '#9333ea', // Vulkan — 보라(진한)
  // 비용 범주
  validate: '#3b82f6',
  state: '#a855f7',
  descriptor: '#14b8a6',
  submit: '#ef4444',
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

/**
 * 폭 maxW를 넘지 않게 단어 단위로 줄바꿈해 중앙 정렬로 그린다(라벨 박스 안 긴 텍스트용).
 * 공백이 없는 토큰은 그대로 한 줄로 둔다(코드 토큰 보호). 그린 줄 수를 반환.
 * 모바일에서 박스 라벨이 가로로 넘치는 것을 막는 게 목적.
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxW: number,
  color: string,
  px = 11,
  weight = '',
  lineH = px + 3,
): number {
  ctx.font = monoFont(px, weight);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const trial = cur ? cur + ' ' + word : word;
    if (ctx.measureText(trial).width > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  const startY = cy - ((lines.length - 1) * lineH) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, cx, startY + i * lineH));
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  return lines.length;
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

/** 라벨 박스(채움+테두리+가운데 제목). 짧은 노드명용(긴 텍스트는 wrapText로). */
export function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  title: string,
  theme: ThemeColors,
  opts?: { titleColor?: string; px?: number; alpha?: number; r?: number; wrap?: boolean },
): void {
  const alpha = opts?.alpha ?? 0.16;
  roundRect(ctx, x, y, w, h, opts?.r ?? 7);
  ctx.fillStyle = withAlpha(fill, alpha);
  ctx.fill();
  ctx.strokeStyle = fill;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  const px = opts?.px ?? 12;
  const color = opts?.titleColor ?? theme.text;
  if (opts?.wrap) {
    wrapText(ctx, title, x + w / 2, y + h / 2, w - 8, color, px, 'bold');
  } else {
    label(ctx, x + w / 2, y + h / 2, title, color, px, 'bold');
  }
}
