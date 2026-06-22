import { useEffect, useRef } from 'react';
import { setupCanvas, readTheme, observeTheme, roundRect } from './tc2d';

// ---------------------------------------------------------------------------
// 그림 1 (정적 차트): 왜 압축하나.
//
// 대표로 BC1(4bpp) vs RGBA8(32bpp) 기준선을 2048² 텍스처에서 비교한다.
// "포맷 = texel당 바이트수"라는 한 숫자가 어떻게 VRAM과 매 프레임 대역폭으로 곱해지는지를
// 두 막대(메모리·대역폭)로 보인다. 8:1 절감. 다른 포맷·해상도 효과는 figcaption.
// ---------------------------------------------------------------------------

const BITS_PER_TEXEL = { rgba8: 32, bc1: 4 };
const RES = 2048;
const FPS = 60;

function bytes(resPx: number, bpp: number): number {
  return (resPx * resPx * bpp) / 8;
}
function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n.toFixed(0)} B`;
}
function fmtRate(bytesPerSec: number): string {
  const gb = bytesPerSec / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB/s`;
  return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
}

export default function WhyCompress() {
  const ref = useRef<HTMLCanvasElement>(null);

  const refBytes = bytes(RES, BITS_PER_TEXEL.rgba8);
  const curBytes = bytes(RES, BITS_PER_TEXEL.bc1);
  const savings = 1 - curBytes / refBytes;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const run = (): void => {
      const setup = setupCanvas(canvas);
      if (!setup) return;
      const { ctx, w, h } = setup;
      const theme = readTheme(canvas);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = theme.surface;
      ctx.fillRect(0, 0, w, h);

      const padL = 70;
      const padR = 90;
      const top = 24;
      const rowH = 36;
      const gap = 16;
      const barMaxW = w - padL - padR;

      const rows: Array<{ label: string; cur: number; refV: number; unit: 'mem' | 'bw' }> = [
        { label: 'VRAM', cur: curBytes, refV: refBytes, unit: 'mem' },
        { label: '대역폭', cur: curBytes * FPS, refV: refBytes * FPS, unit: 'bw' },
      ];

      ctx.textBaseline = 'middle';
      rows.forEach((rw, i) => {
        const y = top + i * (rowH + gap + 18);
        ctx.fillStyle = theme.text;
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(rw.label, padL - 10, y + rowH / 2);

        // 회색 기준선 막대(RGBA8 100%)
        ctx.fillStyle = theme.border;
        roundRect(ctx, padL, y, barMaxW, rowH, 6);
        ctx.fill();

        // 현재 포맷 막대(기준선 대비 비율)
        const frac = rw.cur / rw.refV;
        ctx.fillStyle = theme.accent;
        roundRect(ctx, padL, y, Math.max(4, barMaxW * frac), rowH, 6);
        ctx.fill();

        // 막대 우측에 절대값
        ctx.fillStyle = theme.text;
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.textAlign = 'left';
        const val = rw.unit === 'mem' ? fmtBytes(rw.cur) : fmtRate(rw.cur);
        ctx.fillText(val, padL + barMaxW + 8, y + rowH / 2);

        // 기준선 라벨(연하게)
        ctx.fillStyle = theme.muted;
        ctx.font = '12px system-ui, sans-serif';
        const refVal = rw.unit === 'mem' ? fmtBytes(rw.refV) : fmtRate(rw.refV);
        ctx.fillText(`RGBA8: ${refVal}`, padL, y + rowH + 12);
      });

      // 절감률 배지
      ctx.textAlign = 'left';
      ctx.fillStyle = theme.muted;
      ctx.font = '12px system-ui, sans-serif';
      const pct = (savings * 100).toFixed(0);
      ctx.fillText(`BC1 (4bpp) · ${RES}² — RGBA8 대비 ${pct}% 절감 (8:1)`, padL, h - 12);
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(canvas);
    const stop = observeTheme(run);
    return () => {
      ro.disconnect();
      stop();
    };
  }, [curBytes, refBytes, savings]);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 200, display: 'block' }} />
      </div>
      <figcaption>
        파란 막대는 BC1(4&nbsp;bpp), 회색은 RGBA8(32&nbsp;bpp) 기준선입니다. 위 줄은 2048² 텍스처가
        VRAM에서 차지하는 <strong>메모리</strong>, 아래 줄은 매 프레임 한 번 통째로 읽는다고 가정했을
        때의 <strong>대역폭</strong>(× {FPS}&nbsp;fps)입니다. 둘 다 같은 한 숫자 — texel당 비트수 — 에
        비례하므로 막대 길이가 똑같이 줄어듭니다. BC1은 32→4&nbsp;bpp, 즉 <strong>8:1</strong>로 줄어
        75%를 훌쩍 넘는 절감입니다(BC7은 8&nbsp;bpp라 4:1). 해상도를 한 칸 올리면 텍셀 수가 4배라 두
        막대 모두 4배로 자라므로, 압축이 절감하는 절대량은 고해상도에서 더 커집니다. 밉맵까지 포함하면
        메모리가 약 4/3배가 됩니다.
      </figcaption>
    </figure>
  );
}
