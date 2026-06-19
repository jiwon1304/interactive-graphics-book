// texture-filtering-mipmapping 챕터 공용 2D 유틸 + 필터링 수학.
//
// 담는 것:
//   - HiDPI 캔버스 셋업(setupCanvas) · 테마 읽기(readTheme)/관찰(observeTheme)  ← re2d.ts 패턴
//   - 색 보조(withAlpha/hexToRgb/mixRgb) · 그리기 보조(roundRect/label/drawArrow/monoFont)
//   - 의미색 COLORS
//   - 텍스처/필터링 수학: 절차적 텍스처 생성, 박스 다운샘플(밉 생성),
//     nearest/bilinear 샘플, LOD = log2(rho)
//
// 캔버스에 텍스처를 그릴 때는 putImageData(§5.1 함정) 대신 셀마다 fillRect로 그린다
// (작은 격자라 충분하고, dpr 변환을 그대로 존중 — 좌상단 1/4 버그가 원천적으로 없음).

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
 * 필터링/밉/footprint 도식이 일관된 색 어휘를 쓰도록 한곳에.
 */
export const COLORS = {
  /** 텍셀/샘플점 강조 — 파랑 */
  sample: '#3b82f6',
  /** 밉/필터로 "고친" 좋은 결과 — 초록 */
  good: '#22c55e',
  /** 앨리어싱/낭비/나쁜 결과 — 빨강 */
  bad: '#ef4444',
  /** 보조 강조(가중치·footprint) — 보라 */
  accent2: '#a855f7',
  /** 밉 레벨 띠 — 주황 */
  level: '#f59e0b',
  /** footprint 장축/탭 — 청록 */
  major: '#14b8a6',
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
//  텍스처 / 필터링 수학
// ============================================================

/** size×size RGB 텍셀 격자. data[(y*size+x)*3 + c] (0..255). */
export interface Texture {
  size: number;
  data: Float32Array;
}

export function texGet(tex: Texture, x: number, y: number): RGB {
  const s = tex.size;
  const xi = ((x % s) + s) % s;
  const yi = ((y % s) + s) % s;
  const i = (yi * s + xi) * 3;
  return [tex.data[i], tex.data[i + 1], tex.data[i + 2]];
}

export type TextureKind = 'checker' | 'stripes' | 'brick';

/** 절차적 텍스처 생성(외부 fetch 없음, SSR 안전). */
export function makeTexture(size: number, kind: TextureKind): Texture {
  const data = new Float32Array(size * size * 3);
  const set = (x: number, y: number, c: RGB) => {
    const i = (y * size + x) * 3;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
  };
  const dark: RGB = [38, 44, 58];
  const lite: RGB = [232, 236, 244];
  const red: RGB = [206, 78, 70];
  const tan: RGB = [200, 170, 130];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (kind === 'checker') {
        const cell = size / 8; // 8×8 체커
        const cx = Math.floor(x / cell);
        const cy = Math.floor(y / cell);
        set(x, y, (cx + cy) & 1 ? dark : lite);
      } else if (kind === 'stripes') {
        const period = size / 12;
        set(x, y, Math.floor(x / period) & 1 ? dark : lite);
      } else {
        // brick: 가로 줄눈 + 엇갈린 세로 줄눈
        const bh = size / 4;
        const bw = size / 4;
        const row = Math.floor(y / bh);
        const xo = (x + (row & 1 ? bw / 2 : 0)) % size;
        const mortar = y % bh < 2 || xo % bw < 2;
        set(x, y, mortar ? tan : red);
      }
    }
  }
  return { size, data };
}

/** 박스 다운샘플로 다음 밉 레벨(2×2 평균). size는 짝수 가정. */
export function downsample(tex: Texture): Texture {
  const s2 = Math.max(1, tex.size >> 1);
  const out = new Float32Array(s2 * s2 * 3);
  for (let y = 0; y < s2; y++) {
    for (let x = 0; x < s2; x++) {
      for (let c = 0; c < 3; c++) {
        const a = tex.data[((2 * y) * tex.size + 2 * x) * 3 + c];
        const b = tex.data[((2 * y) * tex.size + 2 * x + 1) * 3 + c];
        const d = tex.data[((2 * y + 1) * tex.size + 2 * x) * 3 + c];
        const e = tex.data[((2 * y + 1) * tex.size + 2 * x + 1) * 3 + c];
        out[(y * s2 + x) * 3 + c] = (a + b + d + e) / 4;
      }
    }
  }
  return { size: s2, data: out };
}

/** 레벨 0부터 1×1까지 전체 밉 체인. */
export function buildMipChain(base: Texture): Texture[] {
  const chain = [base];
  let cur = base;
  while (cur.size > 1) {
    cur = downsample(cur);
    chain.push(cur);
  }
  return chain;
}

/** nearest 샘플. u,v ∈ [0,1) (랩). */
export function sampleNearest(tex: Texture, u: number, v: number): RGB {
  const s = tex.size;
  const x = Math.floor(u * s);
  const y = Math.floor(v * s);
  return texGet(tex, x, y);
}

/** bilinear 샘플. 텍셀 중심 기준(−0.5 시프트), 랩 어드레싱. */
export function sampleBilinear(tex: Texture, u: number, v: number): RGB {
  const s = tex.size;
  const fx = u * s - 0.5;
  const fy = v * s - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const c00 = texGet(tex, x0, y0);
  const c10 = texGet(tex, x0 + 1, y0);
  const c01 = texGet(tex, x0, y0 + 1);
  const c11 = texGet(tex, x0 + 1, y0 + 1);
  const top = mixRgb(c00, c10, tx);
  const bot = mixRgb(c01, c11, tx);
  return mixRgb(top, bot, ty);
}

/**
 * 삼선형 샘플: 연속 LOD lambda에서 두 정수 밉 레벨을 frac로 블렌드.
 * chain[0]=레벨0. lambda는 [0, chain.length-1]로 클램프.
 */
export function sampleTrilinear(chain: Texture[], u: number, v: number, lambda: number): RGB {
  const maxL = chain.length - 1;
  const lam = Math.max(0, Math.min(maxL, lambda));
  const l0 = Math.floor(lam);
  const l1 = Math.min(maxL, l0 + 1);
  const f = lam - l0;
  const a = sampleBilinear(chain[l0], u, v);
  const b = sampleBilinear(chain[l1], u, v);
  return mixRgb(a, b, f);
}

/** LOD = log2(rho). rho = 픽셀이 덮는 텍셀 보폭(>0). */
export function lodFromRho(rho: number): number {
  return Math.log2(Math.max(1e-6, rho));
}
