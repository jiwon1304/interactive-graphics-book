import { useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, roundRect, monoFont } from './tbr2d';

// ImrVsTbr (과정): overdraw 슬라이더를 올리면 한 픽셀이 d번 셰이딩된다.
// - IMR: 프래그먼트마다 DRAM color 프레임버퍼를 read-modify-write → 외부 트래픽이 overdraw에 비례.
// - TBR: 같은 overdraw가 온칩 GMEM에서 일어나 외부로 안 샌다. 타일 끝에 최종 color 1회만 DRAM write.
//
// 한 픽셀을 확대해, overdraw 만큼 쌓인 레이어를 보이고, 각 레이어가 만드는 "외부 DRAM 접근"을
// 카운트한다. IMR 카운터는 overdraw에 비례, TBR은 거의 불변(=1)임을 막대로 보인다.

// 외부 DRAM 접근 횟수(픽셀 1개 기준).
function dramAccesses(overdraw: number): { imr: number; tbr: number } {
  // IMR: 프래그먼트마다 color RMW = read+write = 2회. overdraw 배.
  const imr = overdraw * 2;
  // TBR: 모든 overdraw는 GMEM 안. 타일 끝에 1회 write만 외부로.
  const tbr = 1;
  return { imr, tbr };
}

export default function ImrVsTbr() {
  const [overdraw, setOverdraw] = useState(3);

  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;
    const od = Math.round(overdraw);
    const acc = dramAccesses(od);

    const pad = 14;
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
    const layerH = Math.min(20, 150 / Math.max(1, od));
    const stackW = Math.min(colW * 0.5, 90);

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
    ctx.font = monoFont(10, 'bold');
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.dram;
    ctx.fillText('각 레이어 → DRAM', imrX + colW / 2, memY);
    ctx.fillStyle = COLORS.gmem;
    ctx.fillText('모든 레이어 → GMEM(온칩)', tbrX + colW / 2, memY);

    // --- 외부 DRAM 접근 카운터 막대 ---
    const barTop = memY + 16;
    const barH = 22;
    const maxAcc = 12 * 2; // overdraw 최대 12 × RMW 2
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
      ctx.fillText(caption, x0 + Math.max(2, n * unit) + 8, barTop + barH / 2);
      ctx.textBaseline = 'alphabetic';
    };

    drawBar(imrX, acc.imr, COLORS.dram, `${acc.imr}회`);
    drawBar(tbrX, acc.tbr, COLORS.gmem, `${acc.tbr}회`);
  };

  const { ref } = useCanvas2d(draw, [overdraw]);
  const od = Math.round(overdraw);
  const acc = dramAccesses(od);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 320, display: 'block' }} />
      <ControlPanel>
        <Slider
          label="overdraw (픽셀당 프래그먼트 수)"
          value={overdraw}
          min={1}
          max={12}
          step={1}
          onChange={setOverdraw}
          format={(v) => `${Math.round(v)}×`}
        />
      </ControlPanel>
      <figcaption>
        한 픽셀 위에 <strong>{od}개</strong>의 프래그먼트가 겹쳐 셰이딩됩니다(overdraw {od}×). 같은
        장면을 두 방식으로 그립니다.{' '}
        <span style={{ color: COLORS.dram }}>IMR</span>은 color 프레임버퍼가 DRAM에 있어, 프래그먼트
        하나마다 그 픽셀을 DRAM에서 읽고(이전 색) 다시 씁니다(read-modify-write = 2회). 그래서 외부
        DRAM 접근이 overdraw에 <strong>비례</strong>해 지금 <strong style={{ color: COLORS.dram }}>{acc.imr}회</strong>
        입니다.{' '}
        <span style={{ color: COLORS.gmem }}>TBR</span>은 그 픽셀이 속한 타일을 통째로 온칩 GMEM에
        올려놓고 겹침을 전부 거기서 처리합니다 — 외부로 새는 트래픽이 없습니다. 타일이 다 끝나면 최종
        색만 DRAM에 <strong>한 번</strong> 씁니다(<strong style={{ color: COLORS.gmem }}>{acc.tbr}회</strong>).{' '}
        <strong>슬라이더를 올려 보세요:</strong> overdraw가 늘수록 IMR 막대는 길어지지만 TBR 막대는
        꿈쩍도 하지 않습니다. 모바일 GPU가 화면을 타일로 쪼개는 이유의 절반이 바로 이 그림입니다.
      </figcaption>
    </figure>
  );
}
