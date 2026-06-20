// pipeline-state-shaders 챕터 공용 2D 유틸.
// directx-driver-internals/dxd2d.ts 를 복사한 뒤 wrapText(긴 라벨 줄바꿈)과
// 셰이더/Vulkan 범주 색을 추가했다. 정적 도식 4개(상태 변환 타이밍·셰이더 컴파일
// 파이프라인·PSO 번들·바인딩 모델)가 공유한다.
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

/** 의미색(테마 무관). API 세대 / 상태 범주 / 컴파일 단계 / 바인딩 모델을 일관 색으로. */
export const COLORS = {
  // API 세대 (dxd2d와 동일 — 일관성)
  dx9: '#ec4899', // 분홍
  dx11: '#f59e0b', // 주황
  dx12: '#22c55e', // 초록
  vk: '#6366f1', // Vulkan — 남보라(indigo)
  // 컴파일 단계
  hlsl: '#0ea5e9', // 소스(HLSL/GLSL) — 하늘
  ir: '#a855f7', // 중간 IR(DXBC/DXIL/SPIR-V) — 보라
  jit: '#ef4444', // UMD JIT — 빨강
  isa: '#f59e0b', // GPU ISA — 주황
  // PSO가 묶는 상태 범주
  shader: '#0ea5e9', // 셰이더 — 하늘
  blend: '#22c55e', // blend — 초록
  raster: '#a855f7', // rasterizer — 보라
  depth: '#14b8a6', // depth-stencil — 청록
  input: '#f59e0b', // input layout / vertex input — 주황
  rtformat: '#ec4899', // RT/DS 포맷 — 분홍
  // 바인딩 모델
  slot: '#f59e0b', // D3D11 슬롯 — 주황
  heap: '#14b8a6', // descriptor heap / set — 청록
  rootsig: '#a855f7', // root signature / pipeline layout — 보라
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
 * 긴 라벨을 maxWidth(px)에 맞춰 여러 줄로 끊어 그린다. 모바일(360~440px) 가독을 위해.
 * 공백 단위로 그리디 줄바꿈하고, 한 단어가 너무 길면 그대로 한 줄로 둔다.
 * align: 'left' | 'center'. 반환값 = 그린 줄 수(높이 계산용).
 * cx/cy는 첫 줄의 (정렬 기준 x, 세로 중앙 y). lineH 만큼 아래로 내려가며 그린다.
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  color: string,
  opts?: { px?: number; weight?: string; align?: 'left' | 'center'; lineH?: number },
): number {
  const px = opts?.px ?? 11;
  const weight = opts?.weight ?? '';
  const align = opts?.align ?? 'center';
  const lineH = opts?.lineH ?? px * 1.25;
  ctx.font = monoFont(px, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align === 'center' ? 'center' : 'left';
  ctx.textBaseline = 'middle';

  const words = text.split(/\s+/).filter((s) => s.length > 0);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const trial = cur.length === 0 ? word : cur + ' ' + word;
    if (ctx.measureText(trial).width <= maxWidth || cur.length === 0) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur.length > 0) lines.push(cur);

  const total = lines.length;
  const startY = cy - ((total - 1) * lineH) / 2;
  lines.forEach((ln, i) => {
    ctx.fillText(ln, cx, startY + i * lineH);
  });
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  return total;
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
