import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, roundRect, monoFont } from './mbr2d';

// ComputeVsBandwidth (정적 차트):
// 한 커널이 byte 하나당 몇 번 연산하는가(arithmetic intensity)에 따라
// "연산 시간"과 "데이터 대기 시간" 중 어느 쪽이 더 긴지를 막대로 보인다.
// 대표 상태: element당 8 FLOP, 4 byte read → bandwidth-bound.
//
// 모델: compute 처리율 PEAK_FLOPS, bandwidth 처리율 PEAK_BW. 요즘 하드웨어는 PEAK_FLOPS ≫ PEAK_BW.

const PEAK_FLOPS = 100; // op / 유닛시간 (compute가 빠르다)
const PEAK_BW = 5; // byte / 유닛시간 (대역폭은 느리다) → 20:1
const FLOPS = 8; // element당 연산 수(대표값)
const BYTES = 4; // float 하나 read

export default function ComputeVsBandwidth() {
  const computeTime = FLOPS / PEAK_FLOPS;
  const waitTime = BYTES / PEAK_BW;
  const actual = Math.max(computeTime, waitTime);
  const bandwidthBound = waitTime >= computeTime;
  const intensity = FLOPS / BYTES;

  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;

    const padL = 90;
    const padR = 16;
    const barAreaW = w - padL - padR;
    const barH = 30;
    const gap = 22;
    const top = 30;

    const tMax = Math.max(computeTime, waitTime, 1) * 1.08;
    const unit = barAreaW / tMax;

    ctx.textBaseline = 'middle';

    const rows: Array<{ name: string; t: number; col: string }> = [
      { name: '연산 시간', t: computeTime, col: COLORS.compute },
      { name: '데이터 대기', t: waitTime, col: COLORS.bandwidth },
    ];

    let y = top;
    for (const row of rows) {
      const longer =
        (row.name === '연산 시간' && !bandwidthBound) ||
        (row.name === '데이터 대기' && bandwidthBound);

      ctx.font = monoFont(12, 'bold');
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'right';
      ctx.fillText(row.name, padL - 10, y + barH / 2);

      roundRect(ctx, padL, y, barAreaW, barH, 5);
      ctx.fillStyle = withAlpha(theme.border, 0.4);
      ctx.fill();

      const bw = Math.max(2, row.t * unit);
      roundRect(ctx, padL, y, bw, barH, 5);
      ctx.fillStyle = withAlpha(row.col, longer ? 0.95 : 0.55);
      ctx.fill();
      if (longer) {
        roundRect(ctx, padL, y, bw, barH, 5);
        ctx.strokeStyle = row.col;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      y += barH + gap;
    }

    // "실제 시간 = 더 긴 쪽" 점선 표시
    const actualX = padL + actual * unit;
    ctx.strokeStyle = withAlpha(theme.text, 0.6);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(actualX, top - 8);
    ctx.lineTo(actualX, y - gap + barH + 8);
    ctx.stroke();
    ctx.setLineDash([]);

    // 결론 라벨
    ctx.font = monoFont(13, 'bold');
    ctx.fillStyle = bandwidthBound ? COLORS.bandwidth : COLORS.compute;
    ctx.textAlign = 'left';
    ctx.fillText(bandwidthBound ? 'bandwidth-bound' : 'compute-bound', padL, y + 6);
    ctx.fillStyle = theme.muted;
    ctx.font = monoFont(11);
    ctx.fillText(`${FLOPS} FLOP / ${BYTES} B = ${intensity.toFixed(1)} FLOP/byte · 실제 시간 = 더 긴 쪽(점선)`, padL, y + 24);
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 200, display: 'block' }} />
      </div>
      <figcaption>
        한 커널이 메모리에서 float 하나(4 byte)를 읽어 그 위에 연산을{' '}
        <strong>{FLOPS}</strong>번 합니다. 위 막대는 그 연산에 걸리는 시간(
        <span style={{ color: COLORS.compute }}>파랑</span>), 아래 막대는 그 4 byte가 도착하기를
        기다리는 시간(<span style={{ color: COLORS.bandwidth }}>주황</span>)입니다. 두 일은 겹쳐
        돌므로 <strong>실제 시간은 둘 중 더 긴 쪽</strong>(점선)입니다. 이 하드웨어는 연산이 데이터
        전송보다 약 20배 빠릅니다(요즘 GPU의 전형). 그래서 arithmetic intensity{' '}
        {intensity.toFixed(1)} FLOP/byte 정도로는 칩이{' '}
        <strong style={{ color: COLORS.bandwidth }}>데이터를 기다리며</strong> 놀고 있습니다 —
        연산 수를 한참 더 올려야 비로소 연산이 병목이 됩니다.
      </figcaption>
    </figure>
  );
}
