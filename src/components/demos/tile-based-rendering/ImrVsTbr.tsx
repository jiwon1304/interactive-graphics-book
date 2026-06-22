import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, roundRect, monoFont } from './tbr2d';

// ImrVsTbr (정적): 한 픽셀에 overdraw 4× 쌓인 대표 상태.
// - IMR: 프래그먼트마다 DRAM color 프레임버퍼를 read-modify-write → 외부 트래픽이 overdraw에 비례.
// - TBR: 같은 overdraw가 온칩 GMEM에서 일어나 외부로 안 샌다. 타일 끝에 최종 color 1회만 DRAM write.
// 외부 DRAM 접근 횟수(IMR=overdraw×2, TBR=1)를 막대로 대비.

const OVERDRAW = 4;

// 외부 DRAM 접근 횟수(픽셀 1개 기준).
function dramAccesses(overdraw: number): { imr: number; tbr: number } {
  // IMR: 프래그먼트마다 color RMW = read+write = 2회. overdraw 배.
  return { imr: overdraw * 2, tbr: 1 };
}

export default function ImrVsTbr() {
  const od = OVERDRAW;
  const acc = dramAccesses(od);

  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;

    const pad = 12;
    const colW = (w - pad * 3) / 2;
    const imrX = pad;
    const tbrX = pad * 2 + colW;
    const top = 8;

    // 두 칼럼 제목
    ctx.font = monoFont(13, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLORS.dram;
    ctx.fillText('IMR (즉시 모드)', imrX + colW / 2, top + 14);
    ctx.fillStyle = COLORS.gmem;
    ctx.fillText('TBR (타일 기반)', tbrX + colW / 2, top + 14);

    // 한 픽셀 위에 쌓인 overdraw 레이어 도식.
    const stackTop = top + 28;
    const layerH = Math.min(22, 130 / Math.max(1, od));
    const stackW = Math.min(colW * 0.5, 84);

    const drawStack = (cx: number, onChip: boolean) => {
      const x = cx - stackW / 2;
      for (let i = 0; i < od; i++) {
        const y = stackTop + i * (layerH + 3);
        roundRect(ctx, x, y, stackW, layerH, 3);
        const base = onChip ? COLORS.gmem : COLORS.dram;
        ctx.fillStyle = withAlpha(base, 0.18 + 0.5 * (i / Math.max(1, od - 1 || 1)));
        ctx.fill();
        ctx.strokeStyle = withAlpha(base, 0.7);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // 픽셀 1칸 강조 경계
      const stackH = od * (layerH + 3) - 3;
      roundRect(ctx, x, stackTop, stackW, stackH, 4);
      ctx.strokeStyle = COLORS.tile;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    };

    drawStack(imrX + colW / 2, false);
    drawStack(tbrX + colW / 2, true);

    // 메모리 위치 라벨
    const stackH = od * (layerH + 3) - 3;
    const memY = stackTop + stackH + 18;
    ctx.font = monoFont(11, 'bold');
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.dram;
    ctx.fillText('각 레이어 → DRAM', imrX + colW / 2, memY);
    ctx.fillStyle = COLORS.gmem;
    ctx.fillText('레이어 → GMEM(온칩)', tbrX + colW / 2, memY);

    // --- 외부 DRAM 접근 카운터 막대 ---
    const barTop = memY + 16;
    const barH = 22;
    const maxAcc = 12 * 2;
    const barAreaW = colW - 8;
    const unit = barAreaW / maxAcc;

    const drawBar = (x0: number, n: number, col: string, caption: string) => {
      ctx.font = monoFont(10, 'bold');
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.fillText('외부 DRAM 접근', x0, barTop - 4);
      roundRect(ctx, x0, barTop, Math.max(2, n * unit), barH, 4);
      ctx.fillStyle = withAlpha(col, 0.8);
      ctx.fill();
      ctx.font = monoFont(12, 'bold');
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(caption, x0 + Math.max(2, n * unit) + 6, barTop + barH / 2);
      ctx.textBaseline = 'alphabetic';
    };

    drawBar(imrX, acc.imr, COLORS.dram, `${acc.imr}회`);
    drawBar(tbrX, acc.tbr, COLORS.gmem, `${acc.tbr}회`);
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 300, display: 'block' }} />
      </div>
      <figcaption>
        한 픽셀 위에 <strong>{od}개</strong>의 프래그먼트가 겹쳐 셰이딩됩니다(overdraw {od}×). 같은
        장면을 두 방식으로 그립니다.{' '}
        <span style={{ color: COLORS.dram }}>IMR</span>은 color 프레임버퍼가 DRAM에 있어, 프래그먼트
        하나마다 그 픽셀을 DRAM에서 읽고(이전 색) 다시 씁니다(read-modify-write = 2회). 그래서 외부
        DRAM 접근이 overdraw에 <strong>비례</strong>해{' '}
        <strong style={{ color: COLORS.dram }}>{acc.imr}회</strong>입니다.{' '}
        <span style={{ color: COLORS.gmem }}>TBR</span>은 그 픽셀이 속한 타일을 통째로 온칩 GMEM에
        올려놓고 겹침을 전부 거기서 처리합니다 — 외부로 새는 트래픽이 없습니다. 타일이 다 끝나면 최종
        색만 DRAM에 <strong>한 번</strong> 씁니다(<strong style={{ color: COLORS.gmem }}>{acc.tbr}회</strong>).
        overdraw가 늘수록 IMR 막대만 길어지고 TBR 막대는 꿈쩍도 하지 않습니다. 모바일 GPU가 화면을
        타일로 쪼개는 이유의 절반이 바로 이 그림입니다.
      </figcaption>
    </figure>
  );
}
