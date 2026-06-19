// 텍스처 압축 챕터 2D 위젯 공용 유틸.
// raymarching-sdf/sdf2d.ts에서 테마 읽기·HiDPI·blitImage 패턴을 가져오고,
// 여기에 블록 압축(BCn) 수학 — RGB565 양자화, BC1 블록 인코딩, 노멀 Z 재구성 —을 더했다.
//
// 핵심 아이디어 한 줄: BC1 압축 = "한 4×4 블록의 16색을, 두 끝점 c0·c1이 잇는
// 색공간 선분 위 4개 팔레트 점 중 가장 가까운 것으로 투영(projection)"하는 것.

// ---- 벡터 (RGB를 3차원 점으로 다룬다) ----

export interface Vec2 {
  x: number;
  y: number;
}
export const v2 = (x: number, y: number): Vec2 => ({ x, y });

export type RGB = [number, number, number]; // 각 0..255

export const rgbSub = (a: RGB, b: RGB): RGB => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const rgbDot = (a: RGB, b: RGB): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const rgbLerp = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export function rgbDist2(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}
export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

// ---- RGB565 양자화: 끝점이 들고 다닐 수 있는 색은 6만5536가지뿐 ----
// BC1 끝점은 16비트 RGB565로 저장된다: R 5비트, G 6비트, B 5비트.
// 그래서 빨강·파랑은 32단계, 초록만 64단계로 표현된다(초록이 1비트 더 정밀).

/** 8비트 채널을 n비트로 양자화했다가 다시 8비트로 펼친다(저장→복원 왕복). */
function quantizeChannel(v: number, bits: number): number {
  const levels = (1 << bits) - 1; // 5비트면 31, 6비트면 63
  const q = Math.round((clamp(v, 0, 255) / 255) * levels);
  return Math.round((q / levels) * 255);
}

/** 한 색을 RGB565 격자에 스냅한다(끝점이 실제로 저장될 때 받는 손실). */
export function quantize565(c: RGB): RGB {
  return [quantizeChannel(c[0], 5), quantizeChannel(c[1], 6), quantizeChannel(c[2], 5)];
}

// ---- BC1 팔레트: 두 끝점 → 4색 ----
// 끝점 c0, c1을 RGB565로 스냅한 뒤, 그 둘과 1/3·2/3 보간점을 더해 4색 팔레트를 만든다.
//   팔레트 = { c0, c1, (2·c0 + c1)/3, (c0 + 2·c1)/3 }
// 각 텍셀은 이 4색 중 자기와 가장 가까운 것을 2비트 인덱스로 가리킨다.

export interface BC1Palette {
  /** 565로 스냅된 두 끝점 */
  e0: RGB;
  e1: RGB;
  /** 인덱스 순서대로의 팔레트 4색 */
  colors: [RGB, RGB, RGB, RGB];
}

export function bc1Palette(c0: RGB, c1: RGB): BC1Palette {
  const e0 = quantize565(c0);
  const e1 = quantize565(c1);
  const colors: [RGB, RGB, RGB, RGB] = [
    e0,
    e1,
    rgbLerp(e0, e1, 1 / 3), // (2·e0 + e1)/3
    rgbLerp(e0, e1, 2 / 3), // (e0 + 2·e1)/3
  ];
  return { e0, e1, colors };
}

/** 한 색을 팔레트의 가장 가까운 색으로 양자화한다(= 선분 위로 투영). 인덱스와 색을 함께 반환. */
export function nearestInPalette(c: RGB, pal: BC1Palette): { index: number; color: RGB } {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 4; i++) {
    const dd = rgbDist2(c, pal.colors[i]);
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  }
  return { index: best, color: pal.colors[best] };
}

/**
 * 한 블록(임의 길이의 RGB 배열)을 주어진 끝점으로 BC1 인코딩한다.
 * 반환: 양자화된 색 배열 + 각 텍셀의 2비트 인덱스.
 * (실제 인코더는 끝점도 탐색하지만, 인터랙티브 위젯에서는 끝점을 사람이 드래그한다.)
 */
export function encodeBlock(
  texels: RGB[],
  c0: RGB,
  c1: RGB,
): { palette: BC1Palette; out: RGB[]; indices: number[] } {
  const palette = bc1Palette(c0, c1);
  const out: RGB[] = [];
  const indices: number[] = [];
  for (const t of texels) {
    const { index, color } = nearestInPalette(t, palette);
    out.push(color);
    indices.push(index);
  }
  return { palette, out, indices };
}

/**
 * 자동 끝점 선택(데모용 근사): 블록 색들의 주성분(가장 분산이 큰 방향)을 찾아
 * 그 축의 양 끝 색을 끝점으로 쓴다. 실제 인코더의 휴리스틱을 단순화한 버전.
 */
export function fitEndpoints(texels: RGB[]): { c0: RGB; c1: RGB } {
  if (texels.length === 0) return { c0: [0, 0, 0], c1: [255, 255, 255] };
  // 평균
  const mean: RGB = [0, 0, 0];
  for (const t of texels) {
    mean[0] += t[0];
    mean[1] += t[1];
    mean[2] += t[2];
  }
  mean[0] /= texels.length;
  mean[1] /= texels.length;
  mean[2] /= texels.length;
  // 거듭제곱 반복으로 최대 분산 방향(주축) 1개 추정
  let axis: RGB = [1, 1, 1];
  for (let iter = 0; iter < 8; iter++) {
    const next: RGB = [0, 0, 0];
    for (const t of texels) {
      const d = rgbSub(t, mean);
      const proj = rgbDot(d, axis);
      next[0] += proj * d[0];
      next[1] += proj * d[1];
      next[2] += proj * d[2];
    }
    const l = Math.hypot(next[0], next[1], next[2]) || 1;
    axis = [next[0] / l, next[1] / l, next[2] / l];
  }
  // 주축 위 투영 최소·최대 텍셀을 끝점으로
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const t of texels) {
    const s = rgbDot(rgbSub(t, mean), axis);
    if (s < tMin) tMin = s;
    if (s > tMax) tMax = s;
  }
  const c0: RGB = [
    clamp(mean[0] + axis[0] * tMax, 0, 255),
    clamp(mean[1] + axis[1] * tMax, 0, 255),
    clamp(mean[2] + axis[2] * tMax, 0, 255),
  ];
  const c1: RGB = [
    clamp(mean[0] + axis[0] * tMin, 0, 255),
    clamp(mean[1] + axis[1] * tMin, 0, 255),
    clamp(mean[2] + axis[2] * tMin, 0, 255),
  ];
  return { c0, c1 };
}

// ---- 노멀맵 재구성: BC5는 X·Y만 저장하고 Z는 계산한다 ----
// 단위 노멀이면 x²+y²+z²=1 이므로 z = √(1−x²−y²). 부호는 탄젠트공간 노멀이 항상
// 바깥(+z)을 향한다는 가정으로 +로 고정한다.

export function reconstructZ(x: number, y: number): number {
  return Math.sqrt(Math.max(0, 1 - x * x - y * y));
}

// ---- 절차적 이미지 생성 (외부 에셋 없이) ----

/** 시드 PRNG (SSR 안전: 호출 시점 결정적). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 테마 색 읽기 (sdf2d.ts와 동일 규약) ----

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

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(c: RGB): string {
  const h = (v: number): string =>
    Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

// ---- HiDPI 캔버스 (sdf2d.ts와 동일) ----

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

/**
 * dpr 변환이 걸린 ctx에 ImageData를 캔버스 전체로 올바르게 그린다.
 * putImageData는 ctx 변환을 무시하므로, 오프스크린을 거쳐 drawImage로 올린다.
 * (HiDPI에서 픽셀 버퍼를 그릴 땐 반드시 이걸 쓸 것 — putImageData 직접 호출 금지.)
 */
export function blitImage(
  ctx: CanvasRenderingContext2D,
  img: ImageData,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const off = document.createElement('canvas');
  off.width = img.width;
  off.height = img.height;
  const octx = off.getContext('2d');
  if (!octx) return;
  octx.putImageData(img, 0, 0);
  // 픽셀 확대 시 또렷한 블록 경계를 위해 보간 끔.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = true;
}

export function pointerToCanvas(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
): Vec2 {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function observeTheme(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => obs.disconnect();
}

/** 둥근 사각형 path. 도식 박스용. */
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

/** 화살표 한 개(머리 포함). 정적 도식 데이터플로용. */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width = 2,
): void {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const head = 8;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(ang - 0.4), y1 - head * Math.sin(ang - 0.4));
  ctx.lineTo(x1 - head * Math.cos(ang + 0.4), y1 - head * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}
