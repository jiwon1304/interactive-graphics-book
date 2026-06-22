import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import {
  PJ_PER_BYTE_DRAM,
  PJ_PER_BYTE_SRAM,
  COLORS,
  withAlpha,
  roundRect,
  monoFont,
} from './tbr2d';

// BandwidthIsPower (정적 차트): 대표 외부 트래픽(프레임당 30MB·60fps)에서
// 같은 바이트를 DRAM에서 옮길 때 vs 온칩 SRAM에 둘 때의 에너지(mW)를 비교.
// DRAM 접근(~100 pJ/byte) vs 온칩(~1 pJ/byte)의 ~100× 비대칭을 수치로.

// 대표값: 프레임당 30MB 외부 트래픽, 60fps.
const MB = 30;
const FPS = 60;

export default function BandwidthIsPower() {
  const bytesPerSec = MB * 1e6 * FPS;
  // 같은 바이트를 DRAM에서 옮길 때 vs 온칩에 두었을 때의 에너지(초당, mW = mJ/s).
  const dramMW = (bytesPerSec * PJ_PER_BYTE_DRAM) / 1e9; // pJ/s → mW (1 mW = 1e9 pJ/s)
  const sramMW = (bytesPerSec * PJ_PER_BYTE_SRAM) / 1e9;

  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;

    const pad = 12;
    const labelW = 104;
    const barH = 44;
    const barAreaW = w - labelW - pad * 2 - 78;
    const maxMW = Math.max(dramMW, 1);

    const rows = [
      { name: 'DRAM 접근', mw: dramMW, col: COLORS.dram, sub: `${PJ_PER_BYTE_DRAM} pJ/byte` },
      { name: '온칩(GMEM)', mw: sramMW, col: COLORS.gmem, sub: `~${PJ_PER_BYTE_SRAM} pJ/byte` },
    ];

    let y = 32;
    for (const r of rows) {
      ctx.font = monoFont(13, 'bold');
      ctx.fillStyle = r.col;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.name, pad, y + barH / 2 - 7);
      ctx.font = monoFont(11);
      ctx.fillStyle = theme.muted;
      ctx.fillText(r.sub, pad, y + barH / 2 + 9);

      const bx = pad + labelW;
      const bw2 = Math.max(3, (r.mw / maxMW) * barAreaW);
      roundRect(ctx, bx, y, bw2, barH, 6);
      ctx.fillStyle = withAlpha(r.col, 0.8);
      ctx.fill();

      ctx.font = monoFont(13, 'bold');
      ctx.fillStyle = theme.text;
      ctx.fillText(`${r.mw.toFixed(1)} mW`, bx + bw2 + 6, y + barH / 2);
      y += barH + 22;
    }
    ctx.textBaseline = 'alphabetic';

    const ratio = sramMW > 0 ? dramMW / sramMW : 0;
    ctx.font = monoFont(16, 'bold');
    ctx.fillStyle = COLORS.power;
    ctx.textAlign = 'center';
    ctx.fillText(`같은 바이트, ${Math.round(ratio)}× 더 비싼 전력`, w / 2, y + 10);
    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.fillText(`프레임당 ${MB}MB · ${FPS}fps 기준`, w / 2, y + 28);
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
        에너지 = 바이트 × (pJ/byte). 프레임당 {MB}MB를 {FPS}fps로 옮길 때, 같은 데이터라도{' '}
        <strong style={{ color: COLORS.dram }}>외부 DRAM</strong> 접근은 1바이트당 약{' '}
        <strong>{PJ_PER_BYTE_DRAM} pJ</strong>(60~150 pJ 범위)인 반면,{' '}
        <strong style={{ color: COLORS.gmem }}>온칩 메모리</strong> 접근은 그 100분의 1 수준입니다.
        칩을 떠나 패키지 핀과 PCB를 지나 DRAM까지 갔다 오는 전기적 비용이 그만큼 큽니다. 참고로
        연산 한 번(FLOP)은 약 0.05 pJ — DRAM 한 바이트의 <strong>약 2000분의 1</strong>입니다.
        TBR이 외부 트래픽을 줄인다는 건 곧 빨간 막대를 줄인다는 뜻이고, 그게 그대로 배터리 수명과
        발열로 돌아옵니다. 모바일 GPU 설계가 "연산을 아끼자"보다 "DRAM 왕복을 없애자"에 집착하는
        이유가 이 비대칭입니다.
      </figcaption>
    </figure>
  );
}
