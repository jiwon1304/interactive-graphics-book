import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { bandwidth, fmtBytesPerSec, COLORS, withAlpha, roundRect, monoFont } from './tbr2d';

// BandwidthCalc (정적 차트): 대표 설정 한 컷 —
// 1080p · overdraw 4× · 60fps에서 IMR vs TBR 외부 대역폭(GB/s) 막대 + 절감 배수.
// 공식·해석은 figcaption.

// 대표값: FHD, overdraw 4×, 60fps.
const RES = { w: 1920, h: 1080 };
const OVERDRAW = 4;
const FPS = 60;
// parameter buffer 추정: 프레임당 대략 고정 8MB 가정(도식용 단순화).
const PARAM_BYTES = 8 * 1e6;

export default function BandwidthCalc() {
  const bw = bandwidth({
    width: RES.w,
    height: RES.h,
    bpp: 4,
    overdraw: OVERDRAW,
    fps: FPS,
    paramBytes: PARAM_BYTES,
  });

  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;

    const pad = 12;
    const barH = 38;
    const labelW = 56;
    const barAreaW = w - labelW - pad * 2 - 84;
    const maxBw = Math.max(bw.imr, bw.tbr, 1);

    const rows = [
      { name: 'IMR', val: bw.imr, col: COLORS.dram },
      { name: 'TBR', val: bw.tbr, col: COLORS.gmem },
    ];

    let y = 30;
    for (const r of rows) {
      ctx.font = monoFont(14, 'bold');
      ctx.fillStyle = r.col;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.name, pad, y + barH / 2);

      const bx = pad + labelW;
      const bw2 = Math.max(3, (r.val / maxBw) * barAreaW);
      roundRect(ctx, bx, y, bw2, barH, 6);
      ctx.fillStyle = withAlpha(r.col, 0.8);
      ctx.fill();

      ctx.font = monoFont(13, 'bold');
      ctx.fillStyle = theme.text;
      ctx.fillText(fmtBytesPerSec(r.val), bx + bw2 + 6, y + barH / 2);
      y += barH + 22;
    }
    ctx.textBaseline = 'alphabetic';

    // 설정 라벨
    ctx.font = monoFont(12);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'center';
    ctx.fillText(`1920×1080 · overdraw ${OVERDRAW}× · ${FPS}fps`, w / 2, y + 4);

    // 절감 배수 강조
    ctx.font = monoFont(20, 'bold');
    ctx.fillStyle = COLORS.gmem;
    ctx.fillText(`외부 대역폭 ${bw.ratio.toFixed(2)}× 절감`, w / 2, y + 30);
    ctx.textAlign = 'start';
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 220, display: 'block', maxWidth: 400, margin: '0 auto' }}
      />
      <figcaption>
        color 프레임버퍼 트래픽만 센 단순 모델로 1920×1080 · overdraw {OVERDRAW}× · {FPS}fps를
        비교한 한 컷입니다. <strong>IMR</strong>은 프래그먼트마다 color를 read-modify-write 하므로{' '}
        <code>해상도 × 4B × 2(read+write) × overdraw × fps</code>,{' '}
        <strong>TBR</strong>은 타일 끝에 color를 1회 write 하므로{' '}
        <code>해상도 × 4B × 1 × fps</code>에 binning의 parameter buffer(여기선 프레임당 8MB로
        고정 가정)를 더합니다. overdraw가 IMR만 비례해 늘리고 TBR은 거의 그대로라 절감 배수가
        나옵니다. depth 트래픽까지 넣으면 IMR 쪽이 더 불리해져 실제 절감은 이보다 큽니다 —
        흔히 인용되는 <strong>약 1.96×</strong>는 보수적인 추정입니다. 4K·overdraw 8×라면 IMR이
        수십 GB/s에 이르는데, 모바일 DRAM의 실효 대역폭은 보통 그보다 작습니다 — 그래서 모바일은
        IMR을 쓸 수가 없습니다.
      </figcaption>
    </figure>
  );
}
