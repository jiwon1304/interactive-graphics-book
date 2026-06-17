// 베지에 위젯 공유 React 훅.
// 캔버스 크기 관측(ResizeObserver) + dpr 보정 + 드래그 가능한 제어점 + 리드로우 트리거를 묶는다.
// 위젯은 draw 콜백만 제공하면 되고, 드래그/리사이즈/테마변경 시 자동으로 다시 그린다.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Pt } from './geometry';
import {
  clampVirtual,
  hitTest,
  pointerToCanvasPx,
  setupHiDPICanvas,
  toVirtual,
  type CanvasMetrics,
} from './canvasKit';

/** draw 콜백에 넘기는 인자. */
export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  metrics: CanvasMetrics;
  /** 현재 드래그 중인 점 인덱스(-1이면 없음). 하이라이트에 사용. */
  draggingIndex: number;
}

export interface UseBezierCanvasOptions {
  /** 캔버스 종횡비(폭/높이). 높이는 폭에 맞춰 계산된다. */
  aspect?: number;
  /** 드래그 히트 반경(px). */
  hitRadiusPx?: number;
}

export interface UseBezierCanvasResult {
  /** <canvas>에 붙일 ref. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** <canvas>를 감쌀 래퍼 div의 ref(폭 측정용). */
  wrapRef: RefObject<HTMLDivElement | null>;
  /** 외부 상태가 바뀌었을 때 수동으로 다시 그리게 한다(예: 슬라이더 t 변경). */
  redraw: () => void;
  /** 현재 드래그 중인 점 인덱스(-1이면 없음). */
  draggingIndex: number;
}

/**
 * 드래그 가능한 점 집합과 draw 콜백을 받아 캔버스 상호작용을 관리한다.
 * @param points 현재 제어점들(가상 좌표). 드래그하면 onPointsChange로 갱신을 알린다.
 * @param onPointsChange 드래그로 점이 움직일 때 호출(없으면 드래그 비활성).
 * @param draw 캔버스를 그리는 콜백. points가 바뀌거나 redraw()가 불리면 호출된다.
 */
export function useBezierCanvas(
  points: Pt[],
  onPointsChange: ((next: Pt[]) => void) | null,
  draw: (dc: DrawContext) => void,
  options: UseBezierCanvasOptions = {},
): UseBezierCanvasResult {
  const { aspect = 1.6, hitRadiusPx = 16 } = options;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(-1);

  // 콜백/포인트의 최신 값을 ref로 들고 있어 이벤트 핸들러를 재구독하지 않는다.
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const onChangeRef = useRef(onPointsChange);
  onChangeRef.current = onPointsChange;
  const draggingRef = useRef(-1);

  const cssSizeRef = useRef<CanvasMetrics>({ width: 0, height: 0 });

  /** 실제 그리기 수행: 캔버스를 dpr 보정 후 draw 콜백 호출. */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = cssSizeRef.current;
    if (width === 0 || height === 0) return;
    const setup = setupHiDPICanvas(canvas, width, height);
    if (!setup) return;
    drawRef.current({
      ctx: setup.ctx,
      metrics: setup.metrics,
      draggingIndex: draggingRef.current,
    });
  }, []);

  const redraw = useCallback(() => {
    render();
  }, [render]);

  // points 등 의존성이 바뀔 때마다 다시 그린다.
  useEffect(() => {
    render();
  });

  // 래퍼 폭을 관측해 캔버스 CSS 크기를 정하고 다시 그린다.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = w / aspect;
        cssSizeRef.current = { width: w, height: h };
        render();
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [aspect, render]);

  // 포인터 드래그 처리.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onChangeRef.current) return;

    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const { x, y } = pointerToCanvasPx(e.clientX, e.clientY, rect);
      const idx = hitTest(x, y, pointsRef.current, cssSizeRef.current, hitRadiusPx);
      if (idx < 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      draggingRef.current = idx;
      setDragging(idx);
    };

    const onMove = (e: PointerEvent) => {
      if (draggingRef.current < 0) return;
      const handler = onChangeRef.current;
      if (!handler) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const { x, y } = pointerToCanvasPx(e.clientX, e.clientY, rect);
      const v = clampVirtual(toVirtual(x, y, cssSizeRef.current));
      const next = pointsRef.current.slice();
      next[draggingRef.current] = v;
      handler(next);
    };

    const onUp = (e: PointerEvent) => {
      if (draggingRef.current < 0) return;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      draggingRef.current = -1;
      setDragging(-1);
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [hitRadiusPx]);

  return { canvasRef, wrapRef, redraw, draggingIndex: dragging };
}
