import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, roundRect, monoFont } from './mbr2d';

// DeltaColorCompression (S, 정적 메커니즘):
// 한 블록(4×4)을 anchor 1개 + 나머지는 anchor 대비 작은 delta로 저장 → 비트수 절감.
// 두 예: 부드러운 그라데이션(delta가 작아 잘 압축) vs 노이즈(delta가 커서 압축 안 됨).
// 데이터플로/구조라 정적. 채널은 단일(8-bit 휘도)로 단순화해 수를 보여준다.

const N = 4; // 4×4 블록
const BPC = 8; // 채널당 원본 비트(0..255)

// 두 블록의 픽셀 값(0..255, 단일 채널로 단순화).
function gradientBlock(): number[] {
  const a: number[] = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) a.push(Math.round(60 + (x + y) * 12)); // 매끈한 경사
  return a;
}
function noiseBlock(): number[] {
  // 결정적(SSR 안전) 의사난수.
  const a: number[] = [];
  let s = 12345;
  for (let i = 0; i < N * N; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    a.push(40 + (s % 200));
  }
  return a;
}

// delta 인코딩 비용: anchor BPC 비트 + 나머지 15개는 max|delta|를 담을 비트 폭으로.
function encodedBits(vals: number[]): { anchor: number; deltaBits: number; total: number } {
  const anchor = vals[0];
  let maxAbs = 0;
  for (let i = 1; i < vals.length; i++) maxAbs = Math.max(maxAbs, Math.abs(vals[i] - anchor));
  // 부호 포함 delta 비트 폭: ceil(log2(maxAbs+1)) + 1(sign). 최소 1.
  const deltaBits = maxAbs === 0 ? 1 : Math.ceil(Math.log2(maxAbs + 1)) + 1;
  const total = BPC + (vals.length - 1) * deltaBits;
  return { anchor, deltaBits, total };
}

const RAW = N * N * BPC; // 128 bit

function drawBlock(
  ctx: CanvasRenderingContext2D,
  vals: number[],
  title: string,
  bx: number,
  by: number,
  cell: number,
  theme: { text: string; muted: string; bg: string; border: string },
): void {
  const enc = encodedBits(vals);
  const ratio = RAW / enc.total;

  ctx.font = monoFont(12, 'bold');
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, bx, by - 8);

  // 픽셀 격자(휘도로 칠함).
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = vals[y * N + x];
      const px = bx + x * cell;
      const py = by + y * cell;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(px, py, cell - 1, cell - 1);
      ctx.strokeStyle = withAlpha(theme.border, 0.6);
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
    }
  }
  // anchor 강조(좌상단).
  ctx.strokeStyle = COLORS.accent2;
  ctx.lineWidth = 2.4;
  ctx.strokeRect(bx + 1, by + 1, cell - 2, cell - 2);
  ctx.fillStyle = COLORS.accent2;
  ctx.font = monoFont(9, 'bold');
  ctx.textAlign = 'center';
  ctx.fillText('anchor', bx + cell / 2, by - 22);

  // 막대: RAW vs encoded.
  const barX = bx;
  const barY = by + N * cell + 16;
  const barW = N * cell;
  const barH = 16;
  const scale = barW / RAW;
  // raw
  roundRect(ctx, barX, barY, barW, barH, 4);
  ctx.fillStyle = withAlpha(theme.border, 0.5);
  ctx.fill();
  // encoded
  const ew = Math.max(4, enc.total * scale);
  const good = ratio >= 1.4;
  roundRect(ctx, barX, barY, ew, barH, 4);
  ctx.fillStyle = withAlpha(good ? COLORS.good : COLORS.bad, 0.9);
  ctx.fill();

  ctx.font = monoFont(10, 'bold');
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `${enc.total} bit / ${RAW} bit  =  ${ratio.toFixed(2)}× (delta ${enc.deltaBits}b)`,
    barX,
    barY + barH + 6,
  );
}

export default function DeltaColorCompression() {
  const grad = gradientBlock();
  const noise = noiseBlock();

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const cell = Math.min(38, Math.floor((Math.min(w, 520) / 2 - 60) / N));
    const blockW = N * cell;
    const colGap = Math.max(40, (w - blockW * 2) / 3);
    const by = 44;
    const x1 = colGap;
    const x2 = colGap * 2 + blockW;
    void h;

    drawBlock(ctx, grad, '매끈한 gradient', x1, by, cell, theme);
    drawBlock(ctx, noise, '노이즈', x2, by, cell, theme);
  };

  const { ref } = useCanvas2d(draw, []);

  const eg = encodedBits(grad);
  const en = encodedBits(noise);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 250, display: 'block' }} />
      <figcaption>
        DCC는 4×4 블록을 통째 저장하지 않고, 한{' '}
        <span style={{ color: COLORS.accent2 }}>anchor</span> 값 하나 + 나머지 15개를 anchor 대비{' '}
        <strong>delta</strong>(작은 차이)로 적습니다. 매끈한{' '}
        <strong style={{ color: COLORS.good }}>gradient</strong> 블록은 이웃 값이 거의 같아 delta가{' '}
        {eg.deltaBits} bit면 충분 — {RAW} bit가 {eg.total} bit로 줄어 {(RAW / eg.total).toFixed(2)}×
        절감입니다. <strong style={{ color: COLORS.bad }}>노이즈</strong> 블록은 이웃 값이 멋대로라
        delta가 {en.deltaBits} bit까지 필요해 {en.total} bit — 거의 안 줄어듭니다(
        {(RAW / en.total).toFixed(2)}×). 핵심은 둘 다 <strong>무손실</strong>이라는 점입니다: 압축이
        안 되는 블록은 원본 그대로 두면 되니 화질 손해가 없습니다. 실제 화면은 대부분 매끈한 영역이라
        평균적으로 컬러 트래픽이 30~70% 줄고, GPU는 압축된 채로 메모리를 오가다 ROP/TMU에서만 펴
        읽습니다. 어느 블록이 압축되는지는 매 프레임 메타데이터에 기록됩니다.
      </figcaption>
    </figure>
  );
}
