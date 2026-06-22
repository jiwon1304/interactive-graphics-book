import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, roundRect, withAlpha, monoFont, centerText } from './gem2d';

// ---------------------------------------------------------------------------
// 정적 도식: 마케팅 "코어 수"가 어디서 나오는가.
//
//   레인/파티션 × 파티션/SM × SM/카드 = 카드의 FP32 코어 수
//   32 × 4 × 128 = 16,384   (RTX 4090)
//
// 캔버스엔 세 인자 박스와 결과만. 곱셈 기호와 등호로 잇는다.
// 설명/유도는 figcaption + 본문 KaTeX.
// ---------------------------------------------------------------------------

const CANVAS_H = 230;

// RTX 4090 실측값(AD102 풀칩은 144 SM이나 4090은 16 SM 비활성 → 128 SM)
const LANES_PER_PART = 32; // FP32 레인 / 파티션
const PARTS_PER_SM = 4; // 파티션 / SM  → SM당 128 FP32
const SMS = 128; // SM / 카드
const TOTAL = LANES_PER_PART * PARTS_PER_SM * SMS; // 16,384

export default function CoreCountBuilder() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const factors = [
      { big: String(LANES_PER_PART), small: 'FP32 레인 / 파티션', color: COLORS.fp32 },
      { big: String(PARTS_PER_SM), small: '파티션 / SM', color: COLORS.sched },
      { big: String(SMS), small: 'SM / 카드', color: COLORS.mem },
    ];

    const boxW = Math.min(118, (w - 60) / 3.4);
    const boxH = 70;
    const opW = 26; // 곱셈/등호 기호 폭
    const cy = 86;

    // 세 인자 박스 + 두 곱셈기호의 총 폭
    const rowW = 3 * boxW + 2 * opW + 2 * opW; // factor,× ,factor,×,factor
    let x = (w - rowW) / 2;

    const drawFactor = (
      fx: number,
      big: string,
      small: string,
      color: string,
    ): void => {
      roundRect(ctx, fx, cy, boxW, boxH, 9);
      ctx.fillStyle = withAlpha(color, 0.16);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      centerText(ctx, big, fx + boxW / 2, cy + 26, theme.text, monoFont(28));
      ctx.font = monoFont(9.5);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 두 줄로 쪼개 캔버스 글자 폭을 줄임
      const parts = small.split(' / ');
      ctx.fillText(parts[0], fx + boxW / 2, cy + 50);
      ctx.fillText('/ ' + (parts[1] ?? ''), fx + boxW / 2, cy + 61);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    };

    const op = (ox: number, sym: string): void => {
      centerText(ctx, sym, ox + opW / 2, cy + boxH / 2, theme.muted, monoFont(22));
    };

    // factor 1
    drawFactor(x, factors[0].big, factors[0].small, factors[0].color);
    x += boxW;
    op(x, '×');
    x += opW;
    // factor 2
    drawFactor(x, factors[1].big, factors[1].small, factors[1].color);
    x += boxW;
    op(x, '×');
    x += opW;
    // factor 3
    drawFactor(x, factors[2].big, factors[2].small, factors[2].color);
    x += boxW;

    // 결과 줄: =  16,384  CUDA 코어
    const resY = cy + boxH + 34;
    const resText = TOTAL.toLocaleString('en-US');
    ctx.font = monoFont(34);
    const resW = ctx.measureText(resText).width;
    const eqGap = 22;
    const labelGap = 12;
    ctx.font = monoFont(12);
    const labelW = ctx.measureText('CUDA 코어').width;
    const totalResW = eqGap + resW + labelGap + labelW;
    let rx = (w - totalResW) / 2;

    centerText(ctx, '=', rx + eqGap / 2, resY, theme.muted, monoFont(22));
    rx += eqGap;

    // 결과 강조 박스
    const padR = 10;
    roundRect(ctx, rx - padR, resY - 24, resW + 2 * padR, 44, 9);
    ctx.fillStyle = withAlpha(COLORS.active, 0.16);
    ctx.fill();
    ctx.strokeStyle = COLORS.active;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    centerText(ctx, resText, rx + resW / 2, resY - 1, theme.text, monoFont(34));
    rx += resW + labelGap;

    ctx.font = monoFont(12);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('CUDA 코어', rx, resY - 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: CANVAS_H, display: 'block' }} />
      </div>
      <figcaption>
        스펙시트의 거대한 “코어 수”는 마법의 숫자가 아니라 <strong>곱셈 한 줄</strong>입니다. 파티션
        하나에 FP32 레인 <strong>32</strong>개, SM 하나에 파티션 <strong>4</strong>개(= SM당 128
        코어), 카드 하나에 SM <strong>128</strong>개 — 셋을 곱하면{' '}
        <strong>{TOTAL.toLocaleString('en-US')}</strong>개의 FP32 코어가 됩니다(RTX 4090).
        “1만 6천 코어”라는 말에 압도되지 마세요. 그건 동시에 <em>독립적으로</em> 다른 일을 하는 1만
        6천 개의 똑똑한 코어가 아니라, <em>32개씩 묶여 똑같은 명령을 강제로 함께 실행하는</em> 산술
        레인의 총합입니다. 왜 하필 32개씩 묶이는지 — 그게 다음 그림의 <strong>워프</strong>입니다.
      </figcaption>
    </figure>
  );
}
