import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, monoFont, rooflinePerf, ridgePoint } from './mbr2d';

// Roofline (정적 차트):
// 로그-로그 그래프. x = arithmetic intensity I (FLOP/byte), y = 달성 GFLOPS.
// 두 지붕: 기울기=B 인 대역폭 지붕(y=I·B)과 수평인 compute 지붕(y=peak).
// 교차점 = ridge point I* = peak/B. 대표 커널 점은 I=2 (bandwidth-bound, ridge 왼쪽 경사).

const PEAK = 20000; // GFLOPS (peak compute)
const B = 1000; // GB/s (bandwidth)
const I_KERNEL = 2; // 대표 커널: bandwidth-bound

// 로그 축 범위
const I_MIN = 0.25;
const I_MAX = 256;
const P_MIN = 200;
const P_MAX = 40000;

export default function Roofline() {
  const ridge = ridgePoint(PEAK, B);
  const perf = rooflinePerf(I_KERNEL, B, PEAK);
  const bound = I_KERNEL < ridge;

  const xOf = (i: number, p: { x0: number; x1: number }): number => {
    const t = (Math.log2(i) - Math.log2(I_MIN)) / (Math.log2(I_MAX) - Math.log2(I_MIN));
    return p.x0 + t * (p.x1 - p.x0);
  };
  const yOf = (pf: number, p: { y0: number; y1: number }): number => {
    const t = (Math.log2(pf) - Math.log2(P_MIN)) / (Math.log2(P_MAX) - Math.log2(P_MIN));
    return p.y0 + t * (p.y1 - p.y0);
  };

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;

    const padL = 50;
    const padR = 14;
    const padT = 14;
    const padB = 36;
    const x0 = padL;
    const x1 = w - padR;
    const y0 = h - padB; // 아래(낮은 성능)
    const y1 = padT; // 위(높은 성능)
    const p = { x0, y0, x1, y1 };

    // 격자(로그 grid: I의 2의 거듭제곱)
    ctx.strokeStyle = withAlpha(theme.border, 0.7);
    ctx.lineWidth = 1;
    ctx.font = monoFont(10);
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
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.bandwidth;
    ctx.beginPath();
    ctx.moveTo(xOf(I_MIN, p), yOf(Math.max(P_MIN, I_MIN * B), p));
    ctx.lineTo(xOf(ridge, p), yOf(PEAK, p));
    ctx.stroke();
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
    ctx.font = monoFont(11, 'bold');
    ctx.fillStyle = COLORS.accent2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`ridge I*=${ridge}`, rx, ry - 8);

    // --- 커널 점 ---
    const kx = xOf(I_KERNEL, p);
    const ky = yOf(perf, p);
    const roofY = yOf(Math.min(PEAK, I_KERNEL * B), p);
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
    ctx.font = monoFont(11, 'bold');
    ctx.fillStyle = col;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`I=${I_KERNEL}`, kx + 12, ky);

    // 축 제목(최소)
    ctx.fillStyle = theme.muted;
    ctx.font = monoFont(11);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('arithmetic intensity (FLOP/byte)', (x0 + x1) / 2, h - 2);
    ctx.save();
    ctx.translate(11, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('GFLOPS', 0, 0);
    ctx.restore();
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 300, display: 'block' }} />
      </div>
      <figcaption>
        로그-로그 그래프입니다. 비스듬한{' '}
        <span style={{ color: COLORS.bandwidth }}>주황 지붕</span>은 대역폭 한계 P = I·B(기울기
        = {B} GB/s), 수평인 <span style={{ color: COLORS.compute }}>파랑 지붕</span>은 compute 한계
        peak = {(PEAK / 1000).toFixed(0)}k GFLOPS입니다. 둘이 만나는{' '}
        <span style={{ color: COLORS.accent2 }}>ridge point</span> I* = peak/B ={' '}
        <strong>{ridge} FLOP/byte</strong>가 두 영역을 가릅니다. 여기 표시한 커널은 I ={' '}
        <strong>{I_KERNEL}</strong>로 ridge 왼쪽이라{' '}
        <strong style={{ color: COLORS.bandwidth }}>bandwidth-bound</strong>입니다 — 달성 성능은{' '}
        <strong>{(perf / 1000).toFixed(1)}k GFLOPS</strong>에 그치고, 점이 경사 지붕에 붙어 compute는
        천장(점선 위쪽)까지 놀고 있습니다. intensity가 ridge를 넘으면 점은 평지 천장에 붙어
        compute-bound가 됩니다. 점은 어디서도 지붕 위로 올라갈 수 없습니다 — 그게 "achievable"의
        뜻입니다.
      </figcaption>
    </figure>
  );
}
