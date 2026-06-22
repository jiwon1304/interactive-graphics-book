import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, roundRect, monoFont, frameBandwidthGBps } from './mbr2d';

// BandwidthBudget (정적 계산기):
// 대표 설정(1080p · RGBA8 · overdraw 3× · 60fps)에서 필요한 컬러 버퍼 대역폭(GB/s)을
// GPU 예산과 막대로 비교. 컬러 트래픽만으로도 이미 예산을 크게 넘는 한 컷.

const RES = { w: 1920, h: 1080 };
const BPP = 4; // RGBA8
const OVERDRAW = 3;
const FPS = 60;
const RW = 2; // read + write (블렌딩)
const GPU_BUDGET = 448; // GB/s — 중급 GPU 한 장의 전형 (예: GDDR6 256-bit급)

export default function BandwidthBudget() {
  const need = frameBandwidthGBps(RES.w, RES.h, BPP, RW, OVERDRAW, FPS);
  const over = need > GPU_BUDGET;
  const frac = need / GPU_BUDGET;

  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;

    const padL = 12;
    const padR = 12;
    const top = 26;
    const barH = 34;
    const areaW = w - padL - padR;
    const scaleMax = Math.max(need, GPU_BUDGET) * 1.12;
    const unit = areaW / scaleMax;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // 필요 대역폭 막대
    ctx.font = monoFont(12, 'bold');
    ctx.fillStyle = theme.text;
    ctx.fillText('필요 대역폭', padL, top - 12);
    roundRect(ctx, padL, top, areaW, barH, 5);
    ctx.fillStyle = withAlpha(theme.border, 0.4);
    ctx.fill();
    const needW = Math.max(2, need * unit);
    roundRect(ctx, padL, top, needW, barH, 5);
    ctx.fillStyle = withAlpha(over ? COLORS.bad : COLORS.good, 0.9);
    ctx.fill();
    ctx.fillStyle = theme.bg;
    ctx.font = monoFont(13, 'bold');
    ctx.textAlign = needW > 100 ? 'right' : 'left';
    ctx.fillText(
      `${need.toFixed(0)} GB/s`,
      needW > 100 ? padL + needW - 10 : padL + needW + 8,
      top + barH / 2,
    );

    // GPU 예산 막대
    const top2 = top + barH + 30;
    ctx.fillStyle = theme.text;
    ctx.font = monoFont(12, 'bold');
    ctx.textAlign = 'left';
    ctx.fillText(`GPU 예산 ${GPU_BUDGET} GB/s`, padL, top2 - 12);
    roundRect(ctx, padL, top2, areaW, barH, 5);
    ctx.fillStyle = withAlpha(theme.border, 0.4);
    ctx.fill();
    const budW = GPU_BUDGET * unit;
    roundRect(ctx, padL, top2, budW, barH, 5);
    ctx.fillStyle = withAlpha(COLORS.cache, 0.85);
    ctx.fill();

    // 예산 한계 수직선(두 막대 모두 가로지름)
    const budX = padL + budW;
    ctx.strokeStyle = withAlpha(COLORS.bad, over ? 0.9 : 0.4);
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(budX, top - 4);
    ctx.lineTo(budX, top2 + barH + 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // 설정 + 결론
    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.fillText(`1920×1080 · RGBA8 · overdraw ${OVERDRAW}× · ${FPS}fps`, padL, top2 + barH + 18);
    ctx.font = monoFont(12, 'bold');
    ctx.fillStyle = over ? COLORS.bad : COLORS.good;
    ctx.fillText(
      over ? `예산 초과 ${frac.toFixed(1)}× — 컬러만으로 이미 넘침` : `예산 안 (${(frac * 100).toFixed(0)}%)`,
      padL,
      top2 + barH + 36,
    );
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 200, display: 'block' }} />
      </div>
      <figcaption>
        한 프레임의 컬러 버퍼 트래픽만 셈해 봅니다: BW = W·H·(byte/pixel)·(read+write)·overdraw·fps.
        read+write는 블렌딩이 목적지를 읽고 결과를 쓰므로 2로 둡니다. 대표 설정({RES.w}×{RES.h},{' '}
        {BPP} B/px, overdraw {OVERDRAW}×, {FPS} fps)이면 컬러 트래픽만{' '}
        <strong style={{ color: COLORS.bad }}>{need.toFixed(0)} GB/s</strong>가 필요합니다.{' '}
        <span style={{ color: COLORS.cache }}>GPU 예산</span>은 {GPU_BUDGET} GB/s — 이미{' '}
        <strong style={{ color: COLORS.bad }}>{frac.toFixed(1)}×</strong> 초과입니다. 이건
        depth·텍스처·정점을 한 byte도 안 센 값입니다. overdraw를 줄이거나(불투명 정렬·Hi-Z),
        byte/pixel을 낮추거나, 압축으로 트래픽을 깎아야 60fps를 지킵니다 — 컬러 하나만으로도 금세
        예산이 찬다는 게 핵심입니다.
      </figcaption>
    </figure>
  );
}
