// graphics-pipeline-journey 챕터 공용 2D 유틸.
//
// 삼각형의 여정(IA→VS→PA→클립/컬→÷w→뷰포트→셋업→래스터→early-Z→PS→ROP)을
// 보여주는 도식들이 공유하는: HiDPI 캔버스 셋업, 테마 색 읽기/관찰, 그리기 보조,
// 그리고 "스크린 픽셀 공간"에서 도는 에지 함수·부호넓이·바리센트릭·클리핑 수학.
//
// 좌표계 주의(AUTHORING-GUIDE §5.5): 이 챕터의 인터랙티브 삼각형은 일부러 캔버스
// 좌표(y가 아래로 증가)를 "스크린 공간"으로 그대로 쓴다. 실제 래스터라이저가 도는
// 좌표계가 정확히 이것(좌상단 원점, y-down)이라, 변환 없이 직관과 일치한다.
//
// (gpu-execution-model/gem2d.ts + raymarching-sdf/sdf2d.ts를 본떠 자급자족 폴더로 둔다.)

// ---- 벡터 ----

export interface Vec2 {
  x: number;
  y: number;
}
export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

// ---- 에지 함수 & 삼각형 수학 ----
//
// 에지 함수 E_AB(P)는, 방향선분 A→B를 기준으로 점 P가 어느 쪽에 있는지를 재는
// "부호 있는 면적의 2배"다:
//   E_AB(P) = (P.x - A.x)*(B.y - A.y) - (P.y - A.y)*(B.x - A.x)
// 이는 벡터 (B-A)와 (P-A)의 2D 외적이며, 부호가 좌우(반시계/시계)를 가른다.

/** 에지 함수: 방향선분 a→b에 대한 점 p의 부호 있는 값(=외적 (b−a)×(p−a)). */
export function edge(a: Vec2, b: Vec2, p: Vec2): number {
  return (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
}

/**
 * 삼각형 (a,b,c)의 부호 있는 면적의 2배. = edge(a,b,c).
 * 캔버스(y-down)에서 양수면 화면상 시계방향(CW), 음수면 반시계방향(CCW).
 */
export function signedArea2(a: Vec2, b: Vec2, c: Vec2): number {
  return edge(a, b, c);
}

/**
 * 점 p의 삼각형 (a,b,c)에 대한 바리센트릭 좌표 (wa,wb,wc).
 * 세 에지 함수의 비율로 곧장 나온다(각 가중치 = 마주보는 부분삼각형 면적 / 전체 면적).
 * area2가 0이면 퇴화 삼각형 → null.
 */
export function barycentric(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  p: Vec2,
): { wa: number; wb: number; wc: number } | null {
  const area2 = edge(a, b, c);
  if (Math.abs(area2) < 1e-9) return null;
  // p 맞은편 부분삼각형 면적: wa ~ (b,c,p), wb ~ (c,a,p), wc ~ (a,b,p)
  const wa = edge(b, c, p) / area2;
  const wb = edge(c, a, p) / area2;
  const wc = edge(a, b, p) / area2;
  return { wa, wb, wc };
}

/**
 * 점 p가 삼각형 (a,b,c) 안에 있는지. 세 에지 함수의 부호가 모두 같으면 내부.
 * (와인딩 방향과 무관하게 동작하도록 부호 일치만 본다.)
 */
export function inTriangle(a: Vec2, b: Vec2, c: Vec2, p: Vec2): boolean {
  const e0 = edge(a, b, p);
  const e1 = edge(b, c, p);
  const e2 = edge(c, a, p);
  const hasNeg = e0 < 0 || e1 < 0 || e2 < 0;
  const hasPos = e0 > 0 || e1 > 0 || e2 > 0;
  return !(hasNeg && hasPos);
}

// ---- Sutherland–Hodgman 다각형 클리핑 ----
//
// 반평면(half-plane)으로 볼록 다각형을 자르는 표준 알고리즘.
// 각 클립 경계에 대해 다각형 변을 한 바퀴 돌며: in→in은 끝점 유지,
// in→out은 교점 추가, out→in은 교점+끝점 추가, out→out은 버림.

/** 부호 함수: f(p) ≥ 0 이면 "안쪽"으로 본다. */
export type HalfPlane = (p: Vec2) => number;

/** 선분 ab가 경계 f=0를 가로지르는 교점 (f(a),f(b) 부호가 다를 때). */
function intersectBoundary(a: Vec2, b: Vec2, fa: number, fb: number): Vec2 {
  const t = fa / (fa - fb); // f가 0이 되는 보간 파라미터
  return lerp2(a, b, t);
}

/** 볼록 다각형(poly)을 반평면 f≥0로 자른 결과 다각형을 반환. */
export function clipPolygon(poly: Vec2[], f: HalfPlane): Vec2[] {
  if (poly.length === 0) return [];
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const fc = f(cur);
    const fp = f(prev);
    const curIn = fc >= 0;
    const prevIn = fp >= 0;
    if (curIn) {
      if (!prevIn) out.push(intersectBoundary(prev, cur, fp, fc));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersectBoundary(prev, cur, fp, fc));
    }
  }
  return out;
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

/** 테마 변경(html[data-theme]) 감시 → cb 재호출(재드로우용). 반환 함수로 관찰 중단. */
export function observeTheme(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => obs.disconnect();
}

// ---- HiDPI 캔버스 셋업 ----

/**
 * CSS 폭/높이는 그대로, backing store만 dpr배 확대. dpr은 2로 상한(모바일 성능).
 * 반환 후 그리기는 모두 CSS 픽셀 좌표(ctx에 dpr 변환이 이미 걸림).
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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

// ---- 색 보조 ----

/** 16진수 색 + 알파(0..1)를 8자리 hex로. 테마 색에 투명도를 입힐 때. */
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

/** 도식별 고정 의미색(테마 무관). 라이트·다크 모두에서 충분히 보이는 채도. */
export const COLORS = {
  /** 정점 A / 입력 어셈블리 — 파랑 */
  vA: '#3b82f6',
  /** 정점 B — 분홍 */
  vB: '#ec4899',
  /** 정점 C — 초록 */
  vC: '#22c55e',
  /** 커버된 픽셀 / 통과 — 초록 */
  pass: '#22c55e',
  /** 기각/컬링/실패 — 빨강 */
  fail: '#ef4444',
  /** 정면(front face) — 청록 */
  front: '#14b8a6',
  /** 후면(back face) — 황토 */
  back: '#f59e0b',
  /** 클립 경계 / 가드밴드 — 보라 */
  clip: '#a855f7',
  /** 단계 강조 / 스케줄러 — 인디고 */
  stage: '#6366f1',
  /** 깊이/Z — 주황 */
  depth: '#f97316',
} as const;

// ---- 캔버스 그리기 보조 ----

/** 모노스페이스 폰트 문자열(px 크기만). 도식 라벨 일관성용. */
export function monoFont(px: number): string {
  return `${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;
}

/** 둥근 사각형 경로(채우기/스트로크는 호출자). */
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

/** 화살표 from→to. */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  opts?: { dashed?: boolean; width?: number; head?: number },
): void {
  const width = opts?.width ?? 1.5;
  const head = opts?.head ?? 7;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  if (opts?.dashed) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 가운데 정렬 텍스트(그린 뒤 정렬 상태 복구). */
export function centerText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  color: string,
  font: string,
): void {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 0.5);
  ctx.restore();
}

/** 라벨 박스: 채움 + 테두리 + 중앙 텍스트(작은 노드용). */
export function labelBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  color: string,
  textColor: string,
  opts?: { font?: string; radius?: number; fillAlpha?: number },
): void {
  const r = opts?.radius ?? 6;
  const fa = opts?.fillAlpha ?? 0.18;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = withAlpha(color, fa);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  centerText(ctx, text, x + w / 2, y + h / 2, textColor, opts?.font ?? monoFont(10));
}

/** 채워진 작은 정점 핸들 + 라벨. 드래그 가능한 정점 표시용. */
export function vertexHandle(
  ctx: CanvasRenderingContext2D,
  p: Vec2,
  color: string,
  label: string,
  textColor: string,
): void {
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = `bold ${monoFont(12)}`;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, p.x, p.y - 15);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
