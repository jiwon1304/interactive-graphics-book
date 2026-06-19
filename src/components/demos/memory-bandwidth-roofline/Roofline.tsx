import { useRef, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import {
  COLORS,
  withAlpha,
  monoFont,
  rooflinePerf,
  ridgePoint,
  pointerToCanvas,
} from './mbr2d';

// Roofline (I, 핵심):
// 로그-로그 그래프. x = arithmetic intensity I (FLOP/byte), y = 달성 GFLOPS.
// 두 지붕: 기울기=B 인 대역폭 지붕(y=I·B)과 수평인 compute 지붕(y=peak).
// 교차점 = ridge point I* = peak/B. 커널 점을 I 슬라이더(또는 드래그)로 좌우로 끌면
// bandwidth-bound(왼쪽 경사) ↔ compute-bound(오른쪽 평지) 전환을 본다. 점은 항상 지붕 아래.

const PEAK = 20000; // GFLOPS (peak compute)
const B = 1000; // GB/s (bandwidth)
// ridge point = 20000/1000 = 20 FLOP/byte

// 로그 축 범위
const I_MIN = 0.25;
const I_MAX = 256;
const P_MIN = 200;
const P_MAX = 40000;

export default function Roofline() {
  const [logI, setLogI] = useState(Math.log2(2)); // 시작: I=2 (bandwidth-bound)
  const I = Math.pow(2, logI);

  const ridge = ridgePoint(PEAK, B);
  const perf = rooflinePerf(I, B, PEAK);
  const bound = I < ridge;

  // 플롯 영역(그리기/드래그가 공유) — ref로 저장.
  const plotRef = useRef({ x0: 0, y0: 0, x1: 0, y1: 0 });

  const xOf = (i: number, p: { x0: number; x1: number }): number => {
    const t = (Math.log2(i) - Math.log2(I_MIN)) / (Math.log2(I_MAX) - Math.log2(I_MIN));
    return p.x0 + t * (p.x1 - p.x0);
  };
  const yOf = (pf: number, p: { y0: number; y1: number }): number => {
    const t = (Math.log2(pf) - Math.log2(P_MIN)) / (Math.log2(P_MAX) - Math.log2(P_MIN));
    // y0=아래(낮은 성능), y1=위(높은 성능) — 캔버스 y-down이므로 위가 작은 y.
    return p.y0 + t * (p.y1 - p.y0);
  };

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;

    const padL = 52;
    const padR = 16;
    const padT = 16;
    const padB = 38;
    const x0 = padL;
    const x1 = w - padR;
    const y0 = h - padB; // 아래(낮은 성능)
    const y1 = padT; // 위(높은 성능)
    plotRef.current = { x0, y0, x1, y1 };
    const p = plotRef.current;

    // 격자(로그 grid: I의 2의 거듭제곱)
    ctx.strokeStyle = withAlpha(theme.border, 0.7);
    ctx.lineWidth = 1;
    ctx.font = monoFont(9);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = I_MIN; i <= I_MAX + 1e-6; i *= 4) {
      const xx = xOf(i, p);
      ctx.beginPath();
      ctx.moveTo(xx, y1);
      ctx.lineTo(xx, y0);
      ctx.stroke();
      ctx.fillText(i < 1 ? i.toFixed(2) : i.toString(), xx, y0 + 6);
    }
    // y 격자
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let pp = 250; pp <= P_MAX + 1e-6; pp *= 4) {
      const yy = yOf(pp, p);
      ctx.strokeStyle = withAlpha(theme.border, 0.5);
      ctx.beginPath();
      ctx.moveTo(x0, yy);
      ctx.lineTo(x1, yy);
      ctx.stroke();
      const lab = pp >= 1000 ? `${pp / 1000}k` : `${pp}`;
      ctx.fillStyle = theme.muted;
      ctx.fillText(lab, x0 - 6, yy);
    }

    // --- 지붕(roofline) ---
    // 대역폭 지붕: y = I·B, ridge에서 끝.
    // compute 지붕: y = PEAK, ridge에서 시작.
    ctx.lineWidth = 3;
    // 대역폭 경사(주황): I_MIN → ridge
    ctx.strokeStyle = COLORS.bandwidth;
    ctx.beginPath();
    ctx.moveTo(xOf(I_MIN, p), yOf(Math.max(P_MIN, I_MIN * B), p));
    ctx.lineTo(xOf(ridge, p), yOf(PEAK, p));
    ctx.stroke();
    // compute 평지(파랑): ridge → I_MAX
    ctx.strokeStyle = COLORS.compute;
    ctx.beginPath();
    ctx.moveTo(xOf(ridge, p), yOf(PEAK, p));
    ctx.lineTo(xOf(I_MAX, p), yOf(PEAK, p));
    ctx.stroke();

    // ridge point 표식
    const rx = xOf(ridge, p);
    const ry = yOf(PEAK, p);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = withAlpha(theme.text, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx, y0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.accent2;
    ctx.beginPath();
    ctx.arc(rx, ry, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = monoFont(10, 'bold');
    ctx.fillStyle = COLORS.accent2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`ridge I*=${ridge}`, rx, ry - 8);

    // --- 커널 점 ---
    const kx = xOf(I, p);
    const ky = yOf(perf, p);
    // 점에서 지붕까지 수직선(놀고 있는 여유 = 지붕 - 현재)
    const roofY = yOf(Math.min(PEAK, I * B), p);
    if (Math.abs(ky - roofY) > 1) {
      ctx.strokeStyle = withAlpha(theme.muted, 0.5);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(kx, roofY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const col = bound ? COLORS.bandwidth : COLORS.compute;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(kx, ky, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.bg;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 축 제목(최소)
    ctx.fillStyle = theme.muted;
    ctx.font = monoFont(10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('arithmetic intensity  (FLOP/byte)', (x0 + x1) / 2, h - 2);
    ctx.save();
    ctx.translate(12, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('GFLOPS', 0, 0);
    ctx.restore();
  };

  const { ref, redraw } = useCanvas2d(draw, [logI]);

  // 드래그로 I 조정(x 좌표 → log2 I).
  const setFromX = (px: number) => {
    const p = plotRef.current;
    if (p.x1 <= p.x0) return;
    const t = Math.max(0, Math.min(1, (px - p.x0) / (p.x1 - p.x0)));
    const li = Math.log2(I_MIN) + t * (Math.log2(I_MAX) - Math.log2(I_MIN));
    setLogI(li);
  };
  usePointerDrag(ref, {
    onDown: (e, canvas) => {
      setFromX(pointerToCanvas(e, canvas).x);
    },
    onMove: (e, canvas) => {
      setFromX(pointerToCanvas(e, canvas).x);
      redraw();
    },
  });

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 300, display: 'block', touchAction: 'none', cursor: 'ew-resize' }}
      />
      <ControlPanel>
        <Slider
          label="arithmetic intensity"
          value={I}
          min={I_MIN}
          max={I_MAX}
          step={0.01}
          format={(v) => `${v.toFixed(2)} FLOP/byte`}
          onChange={(v) => setLogI(Math.log2(Math.max(I_MIN, v)))}
        />
      </ControlPanel>
      <figcaption>
        로그-로그 그래프입니다. 비스듬한{' '}
        <span style={{ color: COLORS.bandwidth }}>주황 지붕</span>은 대역폭 한계 P = I·B(기울기
        = {B} GB/s), 수평인 <span style={{ color: COLORS.compute }}>파랑 지붕</span>은 compute 한계
        peak = {(PEAK / 1000).toFixed(0)}k GFLOPS입니다. 둘이 만나는{' '}
        <span style={{ color: COLORS.accent2 }}>ridge point</span> I* = peak/B ={' '}
        <strong>{ridge} FLOP/byte</strong>가 두 영역을 가릅니다. 커널 점을 끌어(또는 슬라이더로)
        intensity를 바꿔 보세요. 지금 I = <strong>{I.toFixed(2)}</strong>,
        달성 성능 = <strong>{(perf / 1000).toFixed(1)}k GFLOPS</strong> —{' '}
        {bound ? (
          <>
            ridge 왼쪽이라 <strong style={{ color: COLORS.bandwidth }}>bandwidth-bound</strong>:
            점이 경사 지붕에 붙어 있고, compute는 천장(점선 위쪽)까지 놀고 있습니다.
          </>
        ) : (
          <>
            ridge 오른쪽이라 <strong style={{ color: COLORS.compute }}>compute-bound</strong>:
            점이 평지 천장에 붙어, 대역폭은 더 줄 여유가 있어도 연산이 못 따라갑니다.
          </>
        )}{' '}
        점은 어디서도 지붕 위로 올라갈 수 없습니다 — 그게 "achievable"의 뜻입니다.
      </figcaption>
    </figure>
  );
}
