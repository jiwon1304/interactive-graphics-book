// 마이크로패싯 위젯 공용 유틸: 색 변환, 2D 캔버스(dpr/테마) 보일러플레이트, BRDF 수식.
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';

const _scratchColor = new THREE.Color();

/** '#rrggbb'(sRGB) → 선형 공간 RGB. 셰이딩 전에 반드시 선형화한다. */
export function hexToLinearRGB(hex: string): [number, number, number] {
  _scratchColor.set(hex).convertSRGBToLinear();
  return [_scratchColor.r, _scratchColor.g, _scratchColor.b];
}

/** 현재 테마의 CSS 변수 색을 그릴 때마다 다시 읽어온다(테마 토글 대응). */
export interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
}

export function readThemeColors(el: HTMLElement): ThemeColors {
  const cs = getComputedStyle(el);
  const read = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    return v.length > 0 ? v : fallback;
  };
  return {
    bg: read('--bg', '#ffffff'),
    surface: read('--surface', '#f5f6f8'),
    border: read('--border', '#e2e5ea'),
    text: read('--text', '#1a1d23'),
    muted: read('--muted', '#5b6472'),
    accent: read('--accent', '#2f86cf'),
  };
}

export interface Canvas2DContext {
  ctx: CanvasRenderingContext2D;
  width: number; // CSS px
  height: number; // CSS px
  colors: ThemeColors;
}

/**
 * 반응형 2D 캔버스 보일러플레이트.
 * - devicePixelRatio 처리(선명함) + 컨테이너 폭에 맞춘 리사이즈(ResizeObserver)
 * - 그릴 때마다 테마 CSS 변수를 다시 읽어 colors로 전달
 * - draw 콜백은 deps가 바뀌거나 리사이즈될 때 호출된다.
 *
 * @param cssHeight 고정 높이(px). 폭은 컨테이너에 맞춰 측정.
 * @param draw      매 렌더 시 호출되는 그리기 콜백.
 * @param deps      draw가 의존하는 값들(바뀌면 다시 그림).
 */
export function useCanvas2D(
  cssHeight: number,
  draw: (c: Canvas2DContext) => void,
  deps: ReadonlyArray<unknown>,
): RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  // 실제 그리기 + dpr 세팅
  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const cssWidth = parent ? parent.clientWidth : canvas.clientWidth;
    if (cssWidth <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const colors = readThemeColors(canvas);
    drawRef.current({ ctx, width: cssWidth, height: cssHeight, colors });
  };

  // deps 변경 시 다시 그림
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(render, deps);

  // 리사이즈 관찰
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement ?? canvas;
    const ro = new ResizeObserver(() => render());
    ro.observe(parent);
    // 테마 토글(data-theme 속성 변경) 감지해 다시 그림
    const mo = new MutationObserver(() => render());
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return canvasRef;
}

// ---- BRDF 수식 (JS, 2D 위젯용) ----

export const PI = Math.PI;

/** GGX 법선 분포. alpha = roughness^2. */
export function distributionGGX(NdotH: number, alpha: number): number {
  const a2 = alpha * alpha;
  const d = NdotH * NdotH * (a2 - 1) + 1;
  return a2 / (PI * d * d);
}

/** 직접광 k 재매핑. */
export function directK(roughness: number): number {
  return ((roughness + 1) * (roughness + 1)) / 8;
}

/** Schlick–GGX 단일 방향 항. */
export function geometrySchlickGGX(NdotX: number, k: number): number {
  return NdotX / (NdotX * (1 - k) + k);
}

/** Schlick 프레넬(스칼라 F0). */
export function fresnelSchlick(cosTheta: number, F0: number): number {
  const c = Math.min(Math.max(1 - cosTheta, 0), 1);
  return F0 + (1 - F0) * Math.pow(c, 5);
}

/** 결정론적 의사난수(시드 기반). -1..1 범위. */
export function seededNoise(i: number, seed = 12.9898): number {
  const x = Math.sin((i + 1) * seed) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
