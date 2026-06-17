// 2D 위젯 공용 유틸 — 거리장(SDF) 수학 + 캔버스 좌표 매핑 + 테마 색 읽기.
// 모든 2D 위젯이 같은 "씬 공간"(scene space)을 공유하도록 한곳에 모았습니다.
// 씬 공간 가로 범위는 x ∈ [-2, 2]로 고정하고, 세로는 캔버스 비율에 맞춰 늘립니다.

export interface Vec2 {
  x: number;
  y: number;
}

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

// ---- SDF 프리미티브 (씬 공간) ----

/** 원: 중심 c, 반지름 r */
export function sdCircle(p: Vec2, c: Vec2, r: number): number {
  return len(sub(p, c)) - r;
}

/** 축 정렬 박스: 중심 c, 반치수(half-extent) b. IQ 박스 공식의 2D 버전 */
export function sdBox(p: Vec2, c: Vec2, b: Vec2): number {
  const d = { x: Math.abs(p.x - c.x) - b.x, y: Math.abs(p.y - c.y) - b.y };
  const outside = Math.hypot(Math.max(d.x, 0), Math.max(d.y, 0));
  const inside = Math.min(Math.max(d.x, d.y), 0);
  return outside + inside;
}

// ---- 부울 / 스무스 연산 ----

/** 다항식 smooth-min (Inigo Quilez). k=0 이면 일반 min */
export function smin(a: number, b: number, k: number): number {
  if (k <= 1e-6) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** 스무스 max: -smin(-a,-b,k). 교집합에 사용 */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export type BoolOp = 'union' | 'intersect' | 'subtract';

/** 두 거리값을 연산 종류에 따라 합성 (k=블렌딩 폭) */
export function combine(a: number, b: number, op: BoolOp, k: number): number {
  switch (op) {
    case 'union':
      return smin(a, b, k);
    case 'intersect':
      return smax(a, b, k);
    case 'subtract':
      return smax(a, -b, k);
  }
}

// ---- 좌표 매핑: 씬 공간 ↔ 픽셀 ----

export interface Mapper {
  /** 캔버스 CSS 픽셀 폭/높이 */
  w: number;
  h: number;
  /** 씬 단위 1당 픽셀 수 */
  scale: number;
  toPx: (p: Vec2) => Vec2;
  toScene: (px: Vec2) => Vec2;
  /** 거리(스칼라)를 픽셀 길이로 */
  distToPx: (d: number) => number;
}

/** 씬 가로범위 x∈[-halfW, halfW]를 캔버스 중앙에 맞춘 매퍼를 만든다. */
export function makeMapper(w: number, h: number, halfW = 2): Mapper {
  const scale = w / (2 * halfW);
  const cx = w / 2;
  const cy = h / 2;
  return {
    w,
    h,
    scale,
    // y는 화면이 아래로 +이므로 뒤집는다 (씬에서 위가 +y)
    toPx: (p) => ({ x: cx + p.x * scale, y: cy - p.y * scale }),
    toScene: (px) => ({ x: (px.x - cx) / scale, y: (cy - px.y) / scale }),
    distToPx: (d) => d * scale,
  };
}

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

/** '#rrggbb' → [r,g,b] (0..255) */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 부호거리 d를 히트맵 색으로.
 * 바깥(d>0)=차가운 파랑 계열, 표면 근처(|d|≈0)=흰색, 안쪽(d<0)=따뜻한 색.
 * scaleD: 색이 포화되는 거리 스케일.
 */
export function distanceColor(d: number, scaleD = 1.2): [number, number, number] {
  const t = Math.max(-1, Math.min(1, d / scaleD)); // -1..1
  if (t >= 0) {
    // 흰색(0) → 파랑(1)
    const k = t;
    const r = Math.round(255 * (1 - 0.82 * k));
    const g = Math.round(255 * (1 - 0.55 * k));
    const b = Math.round(255 * (1 - 0.12 * k));
    return [r, g, b];
  }
  // 흰색(0) → 따뜻한 주황/빨강(-1)
  const k = -t;
  const r = Math.round(255 * (1 - 0.04 * k));
  const g = Math.round(255 * (1 - 0.55 * k));
  const b = Math.round(255 * (1 - 0.78 * k));
  return [r, g, b];
}

/**
 * 반복(iteration) 수를 의사-viridis 램프 색으로. count/maxCount ∈ [0,1].
 * 적은 스텝=보라, 많은 스텝=노랑.
 */
export function iterColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  // 단순한 보라→파랑→초록→노랑 램프 (viridis 근사)
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.5, [33, 145, 140]],
    [0.75, [94, 201, 98]],
    [1.0, [253, 231, 37]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (x >= t0 && x <= t1) {
      const f = (x - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * HiDPI 캔버스 셋업. CSS 폭/높이를 그대로 두고 backing store만 dpr배 확대.
 * devicePixelRatio는 2로 상한.
 * 반환: ctx, CSS 픽셀 폭/높이.
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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 이후 그리기는 CSS 픽셀 좌표로
  return { ctx, w, h, dpr };
}

/** 포인터 이벤트 → 캔버스 CSS 픽셀 좌표 */
export function pointerToCanvas(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
): Vec2 {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/**
 * 테마 변경(html[data-theme]) 감시. 콜백을 재호출하게 해 다시 그리도록.
 * 반환된 함수를 호출하면 관찰을 중단.
 */
export function observeTheme(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => obs.disconnect();
}
