// 베지에 위젯 공유 캔버스 유틸.
// 모든 위젯이 같은 방식으로 (1) devicePixelRatio 보정, (2) 테마 색 읽기,
// (3) 가상 좌표(0..1) ↔ 캔버스 픽셀 매핑, (4) 드래그 히트 테스트를 처리한다.

import type { Pt } from './geometry';

/** 위젯이 그려지는 고정 가상 좌표 박스: x,y ∈ [0,1]. 화면 종횡비와 무관하게 같은 비율. */
export const VIRTUAL = { minX: 0, minY: 0, maxX: 1, maxY: 1 } as const;

/** 캔버스 내부 여백(가상 좌표 단위). 제어점이 가장자리에 붙어도 잘리지 않게 한다. */
export const PAD = 0.06;

/** 그려진 캔버스의 픽셀 크기와 dpr(매핑 계산에 필요). */
export interface CanvasMetrics {
  width: number; // CSS 픽셀 폭
  height: number; // CSS 픽셀 높이
}

/** 가상 좌표(0..1) → 캔버스 CSS 픽셀. y는 화면 좌표라 위아래를 뒤집는다. */
export function toCanvas(p: Pt, m: CanvasMetrics): Pt {
  const u = (p.x - VIRTUAL.minX) / (VIRTUAL.maxX - VIRTUAL.minX);
  const v = (p.y - VIRTUAL.minY) / (VIRTUAL.maxY - VIRTUAL.minY);
  const innerW = m.width * (1 - 2 * PAD);
  const innerH = m.height * (1 - 2 * PAD);
  return {
    x: m.width * PAD + u * innerW,
    y: m.height * PAD + (1 - v) * innerH, // y 뒤집기: 가상 위쪽이 화면 위쪽이 되도록
  };
}

/** 캔버스 CSS 픽셀 → 가상 좌표(0..1). toCanvas의 역변환. 드래그에 사용. */
export function toVirtual(px: number, py: number, m: CanvasMetrics): Pt {
  const innerW = m.width * (1 - 2 * PAD);
  const innerH = m.height * (1 - 2 * PAD);
  const u = (px - m.width * PAD) / innerW;
  const v = 1 - (py - m.height * PAD) / innerH;
  return {
    x: VIRTUAL.minX + u * (VIRTUAL.maxX - VIRTUAL.minX),
    y: VIRTUAL.minY + v * (VIRTUAL.maxY - VIRTUAL.minY),
  };
}

/** 포인터 이벤트의 clientX/Y를 캔버스 CSS 픽셀 좌표로 바꾼다(bounding rect 기준). */
export function pointerToCanvasPx(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/**
 * 드래그 대상 제어점 찾기. 화면(픽셀)상 거리로 판정해 작은 점도 손가락으로 잡기 쉽게 한다.
 * @param hitRadiusPx 히트 반경(기본 16px) — 모바일 터치 친화
 * @returns 가장 가까운(반경 내) 점의 인덱스, 없으면 -1
 */
export function hitTest(
  px: number,
  py: number,
  points: Pt[],
  m: CanvasMetrics,
  hitRadiusPx = 16,
): number {
  let best = -1;
  let bestD = hitRadiusPx * hitRadiusPx;
  for (let i = 0; i < points.length; i++) {
    const c = toCanvas(points[i], m);
    const dx = c.x - px;
    const dy = c.y - py;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** 가상 좌표를 박스 안(여유 두고)으로 클램프해 점이 캔버스를 벗어나지 않게 한다. */
export function clampVirtual(p: Pt): Pt {
  return {
    x: Math.min(VIRTUAL.maxX, Math.max(VIRTUAL.minX, p.x)),
    y: Math.min(VIRTUAL.maxY, Math.max(VIRTUAL.minY, p.y)),
  };
}

/** 캔버스 요소에서 읽은 테마 색 묶음. 매 렌더 시 한 번 읽어 캐시한다. */
export interface ThemePalette {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentBrand: string;
  accentContrast: string;
}

/**
 * 캔버스 요소에 적용된 CSS 변수에서 테마 색을 읽는다.
 * 라이트/다크 토글 시 변수 값이 바뀌므로 그릴 때마다 다시 읽으면 자동 적응된다.
 */
export function readPalette(el: HTMLElement): ThemePalette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string): string => {
    const value = cs.getPropertyValue(name).trim();
    return value.length > 0 ? value : fallback;
  };
  return {
    bg: v('--bg', '#ffffff'),
    surface: v('--surface', '#f5f6f8'),
    border: v('--border', '#e2e5ea'),
    text: v('--text', '#1a1d23'),
    muted: v('--muted', '#5b6472'),
    accent: v('--accent', '#2f86cf'),
    accentBrand: v('--accent-brand', '#4f9dde'),
    accentContrast: v('--accent-contrast', '#ffffff'),
  };
}

/**
 * 캔버스를 dpr에 맞춰 백버퍼 크기를 키우고, 그리기 좌표는 CSS 픽셀로 유지하도록 변환을 건다.
 * @returns 그릴 준비가 된 2D 컨텍스트와 CSS 픽셀 크기. 컨텍스트가 없으면 null.
 */
export function setupHiDPICanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): { ctx: CanvasRenderingContext2D; metrics: CanvasMetrics } | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5); // 상한으로 모바일 메모리 보호
  const pxW = Math.max(1, Math.round(cssWidth * dpr));
  const pxH = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;
  // CSS 표시 크기는 CSS 픽셀로 고정한다. 폭은 컴포넌트가 width:100%로 컨테이너에 맞추지만,
  // 높이는 명시하지 않으면 백버퍼 픽셀(=cssHeight*dpr) 그대로 표시돼 레티나에서 2배로 늘어난다.
  // 그래서 여기서 CSS 높이를 cssHeight(px)로 직접 지정해 종횡비를 보장한다.
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // CSS 픽셀 단위로 그리도록 스케일. 매번 초기화 후 스케일.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, metrics: { width: cssWidth, height: cssHeight } };
}

/** 단계 인덱스(0..n)에 따라 옅어지는 알파를 돌려준다. 사다리/분할에서 단계 구분에 사용. */
export function levelAlpha(levelIndex: number, totalLevels: number): number {
  if (totalLevels <= 1) return 1;
  // 깊은 단계일수록 진하게(최종 점이 가장 또렷하도록).
  const tt = levelIndex / (totalLevels - 1);
  return 0.4 + 0.6 * tt;
}
