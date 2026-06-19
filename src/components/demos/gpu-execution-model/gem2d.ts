// gpu-execution-model 챕터 공용 2D 유틸.
// SM 플로어플랜·코어 수 산수·워프 락스텝·SIMT 도식이 공유하는:
// HiDPI 캔버스 셋업, 테마 색 읽기, 테마 변경 관찰, 픽셀 공간 그리기 보조 함수.
//
// 주의(AUTHORING-GUIDE §5.1): 이 위젯들은 전부 STATIC 벡터 도식이라
// putImageData를 쓰지 않는다. setupCanvas로 dpr 변환을 건 ctx에 곧장 벡터로 그린다.
// (command-queues 챕터의 cq2d.ts를 그대로 본떠 자급자족 폴더로 둔다.)

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

/** 도식별 고정 의미색(테마 무관). 라이트·다크 모두에서 충분히 보이는 채도. */
export const COLORS = {
  /** FP32 ALU 레인 / 그래픽스 — 파랑 */
  fp32: '#3b82f6',
  /** INT ALU 레인 — 보라 */
  int: '#a855f7',
  /** SFU(초월함수) — 청록 */
  sfu: '#14b8a6',
  /** LSU(로드/스토어) — 진청록 */
  lsu: '#0ea5e9',
  /** 텐서/행렬 코어 — 분홍 */
  tensor: '#ec4899',
  /** 레지스터 파일 / 메모리 — 황토 */
  mem: '#f59e0b',
  /** 활성(active) 레인 — 초록 */
  active: '#22c55e',
  /** 비활성/마스크 off 레인 — 빨강 */
  masked: '#ef4444',
  /** 스케줄러/디스패치 — 회청 강조용 */
  sched: '#6366f1',
} as const;

// ---- 캔버스 그리기 보조 ----

/** 모노스페이스 폰트 문자열(px 크기만 받는다). 도식 라벨 일관성용. */
export function monoFont(px: number): string {
  return `${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;
}

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

/** 화살표(브로드캐스트/의존성 표시). from→to. */
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
  // 화살촉
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - head * Math.cos(ang - Math.PI / 6),
    y2 - head * Math.sin(ang - Math.PI / 6),
  );
  ctx.lineTo(
    x2 - head * Math.cos(ang + Math.PI / 6),
    y2 - head * Math.sin(ang + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 가운데 정렬 텍스트. 그린 뒤 정렬 상태를 기본값으로 복구한다. */
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

/** 라벨 박스: 채움 + 테두리 + 중앙 텍스트(작은 블록 노드용). */
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
