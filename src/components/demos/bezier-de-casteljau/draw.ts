// 베지에 위젯 공유 캔버스 그리기 프리미티브.
// 좌표 매핑(toCanvas)과 테마 팔레트를 받아 폴리라인·곡선·점·라벨을 그린다.
// 색은 호출 시점에 읽은 팔레트를 사용하므로 라이트/다크에 자동 적응한다.

import type { Pt } from './geometry';
import { sampleBezier } from './geometry';
import { toCanvas, type CanvasMetrics } from './canvasKit';

/** 캔버스 배경을 surface 색으로 채운다(테두리는 CSS .demo-canvas가 그림). */
export function fillBackground(
  ctx: CanvasRenderingContext2D,
  m: CanvasMetrics,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, m.width, m.height);
  ctx.restore();
}

/** 가상 좌표 폴리라인을 그린다. */
export function strokePolyline(
  ctx: CanvasRenderingContext2D,
  m: CanvasMetrics,
  pts: Pt[],
  opts: { color: string; width?: number; alpha?: number; dashed?: boolean },
): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = opts.width ?? 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (opts.dashed) ctx.setLineDash([5, 5]);
  ctx.beginPath();
  const first = toCanvas(pts[0], m);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const c = toCanvas(pts[i], m);
    ctx.lineTo(c.x, c.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** 제어점들을 잇는 제어 다각형(점선) + 점들을 그린다. */
export function drawControlPolygon(
  ctx: CanvasRenderingContext2D,
  m: CanvasMetrics,
  pts: Pt[],
  color: string,
  alpha = 1,
): void {
  strokePolyline(ctx, m, pts, { color, width: 1.5, alpha, dashed: true });
}

/** 베지에 곡선 자체를 매끄러운 폴리라인으로 그린다. */
export function drawBezierCurve(
  ctx: CanvasRenderingContext2D,
  m: CanvasMetrics,
  pts: Pt[],
  color: string,
  width = 3,
  samples = 80,
): void {
  if (pts.length < 2) return;
  strokePolyline(ctx, m, sampleBezier(pts, samples), { color, width });
}

/** 점 하나를 원으로 그린다(채움 + 테두리). */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  m: CanvasMetrics,
  p: Pt,
  opts: { radius?: number; fill: string; stroke?: string; strokeWidth?: number },
): void {
  const c = toCanvas(p, m);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, opts.radius ?? 6, 0, Math.PI * 2);
  ctx.fillStyle = opts.fill;
  ctx.fill();
  if (opts.stroke) {
    ctx.lineWidth = opts.strokeWidth ?? 2;
    ctx.strokeStyle = opts.stroke;
    ctx.stroke();
  }
  ctx.restore();
}

/** 점 옆에 텍스트 라벨을 그린다. */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  m: CanvasMetrics,
  p: Pt,
  text: string,
  color: string,
  opts: { dx?: number; dy?: number; size?: number; align?: CanvasTextAlign } = {},
): void {
  const c = toCanvas(p, m);
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${opts.size ?? 12}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.x + (opts.dx ?? 10), c.y + (opts.dy ?? -10));
  ctx.restore();
}
