// ue-gpu-crash-debugging 챕터 공용 2D 유틸.
// (Luke Thatcher (Epic) 발표 기반 챕터)
// 타임라인/도식 위젯들이 공유하는: HiDPI 캔버스 셋업, 테마 색 읽기,
// 테마 변경 관찰, 픽셀 공간 그리기 보조 함수.
//
// 주의(AUTHORING-GUIDE §5.1): 이 위젯들은 벡터/타임라인 도식이라
// putImageData를 쓰지 않는다. setupCanvas로 dpr 변환을 건 ctx에 곧장 벡터로 그린다.

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

/** 포인터 이벤트 → 캔버스 CSS 픽셀 좌표 */
export function pointerToCanvas(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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

/**
 * UE GPU 프로파일링/디버깅 도식의 고정 의미색(테마 무관).
 * 라이트·다크 모두에서 충분히 보이는 채도. 텍스트/뮤트 색은 테마 변수를 따른다.
 */
export const UE_COLORS = {
  /** 그래픽스 큐/패스 — 파랑 */
  graphics: '#3b82f6',
  /** 컴퓨트(AsyncCompute) 큐 — 보라 */
  compute: '#a855f7',
  /** 카피(전송) 큐 — 청록 */
  copy: '#14b8a6',
  /** 정상/완료 — 초록 */
  ok: '#22c55e',
  /** 크래시/문제 — 빨강 */
  bad: '#ef4444',
  /** 대기/버블(스톨) — 주황 */
  stall: '#f59e0b',
  /** 현재 실행 중(active) 패스 — 주황 */
  active: '#f59e0b',
} as const;

// ---- 폰트 보조 ----

/** 등폭 폰트 문자열을 만든다. */
export function monoFont(px: number): string {
  return `${px}px ui-monospace, monospace`;
}

// ---- 캔버스 그리기 보조 ----

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

/** 점선 화살표(의존성/대기/펜스 표시). from→to. */
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

/** 가운데 정렬 라벨(단색 배경 알약). */
export function pill(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  text: string,
  fill: string,
  textColor: string,
  font = '11px ui-monospace, monospace',
): void {
  ctx.font = font;
  const w = ctx.measureText(text).width + 12;
  const h = 18;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 0.5);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}
