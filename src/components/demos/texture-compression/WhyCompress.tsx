import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, SelectControl, type SelectOption } from '../../controls';
import { setupCanvas, readTheme, observeTheme, roundRect } from './tc2d';

// ---------------------------------------------------------------------------
// 그림 1 (인터랙티브): 왜 압축하나 — 포맷·해상도를 바꾸면 VRAM/대역폭 막대가 바뀐다.
//
// 가르치는 것(과정): "포맷 = texel당 바이트수"라는 한 숫자가 어떻게 메모리와
// 매 프레임 대역폭으로 곱해지는지. RGBA8(32 bpp) → BC1(4 bpp)로 바꾸면 막대가
// 정확히 1/8로 — 아니, RGBA8 대비 8:1, RGB8(24bpp) 대비로 흔히 인용되는 6:1로 —
// 줄어드는 것을 눈으로 본다.
// ---------------------------------------------------------------------------

type Fmt = 'rgba8' | 'bc1' | 'bc7';

// 각 포맷의 texel당 비트수. (압축 포맷은 블록당 바이트수에서 환산 — 본문 유도 참조)
const BITS_PER_TEXEL: Record<Fmt, number> = {
  rgba8: 32, // 4채널 × 8비트
  bc1: 4, // 8바이트 / 16텍셀 = 0.5 B/텍셀 = 4 bpp
  bc7: 8, // 16바이트 / 16텍셀 = 1 B/텍셀 = 8 bpp
};

const FMT_LABEL: Record<Fmt, string> = {
  rgba8: 'RGBA8 (비압축)',
  bc1: 'BC1 / DXT1',
  bc7: 'BC7 / BPTC',
};

const FORMATS: ReadonlyArray<SelectOption<Fmt>> = [
  { value: 'rgba8', label: 'RGBA8 (비압축, 32bpp)' },
  { value: 'bc1', label: 'BC1 (4bpp)' },
  { value: 'bc7', label: 'BC7 (8bpp)' },
];

const FPS = 60;

// 밉맵을 포함하면 메모리가 약 4/3배. 단순화를 위해 끈 상태가 기본.
function bytes(resPx: number, bpp: number, mips: boolean): number {
  const base = (resPx * resPx * bpp) / 8;
  return mips ? base * (4 / 3) : base;
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
  const [fmt, setFmt] = useState<Fmt>('bc1');
  const [resExp, setResExp] = useState(11); // 2^11 = 2048
  const [mips, setMips] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);

  const res = 1 << resExp;
  const bpp = BITS_PER_TEXEL[fmt];
  const refBytes = bytes(res, BITS_PER_TEXEL.rgba8, mips); // 항상 RGBA8 기준선
  const curBytes = bytes(res, bpp, mips);
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

      const padL = 92;
      const padR = 130;
      const top = 26;
      const rowH = 38;
      const gap = 18;
      const barMaxW = w - padL - padR;

      // 두 줄: 메모리(VRAM), 매 프레임 대역폭. 기준선은 항상 RGBA8 비압축.
      const rows: Array<{ label: string; cur: number; refV: number; unit: 'mem' | 'bw' }> = [
        { label: 'VRAM', cur: curBytes, refV: refBytes, unit: 'mem' },
        {
          label: '대역폭',
          cur: curBytes * FPS,
          refV: refBytes * FPS,
          unit: 'bw',
        },
      ];

      ctx.textBaseline = 'middle';
      rows.forEach((rw, i) => {
        const y = top + i * (rowH + gap + 18);
        ctx.fillStyle = theme.text;
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(rw.label, padL - 12, y + rowH / 2);

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
        ctx.fillText(val, padL + barMaxW + 10, y + rowH / 2);

        // 기준선 라벨(연하게)
        ctx.fillStyle = theme.muted;
        ctx.font = '11px system-ui, sans-serif';
        const refVal = rw.unit === 'mem' ? fmtBytes(rw.refV) : fmtRate(rw.refV);
        ctx.fillText(`RGBA8: ${refVal}`, padL, y + rowH + 12);
      });

      // 절감률 배지
      ctx.textAlign = 'left';
      ctx.fillStyle = theme.muted;
      ctx.font = '12px system-ui, sans-serif';
      const pct = (savings * 100).toFixed(0);
      ctx.fillText(
        fmt === 'rgba8' ? '기준선(비압축)' : `RGBA8 대비 ${pct}% 절감`,
        padL,
        h - 14,
      );
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(canvas);
    const stop = observeTheme(run);
    return () => {
      ro.disconnect();
      stop();
    };
  }, [fmt, res, mips, curBytes, refBytes, savings]);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 620, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 200, display: 'block' }} />
      </div>
      <ControlPanel>
        <SelectControl<Fmt> label="포맷" value={fmt} options={FORMATS} onChange={setFmt} />
        <Slider
          label="해상도"
          value={resExp}
          min={9}
          max={13}
          step={1}
          onChange={setResExp}
          format={(v) => `${1 << v}²`}
        />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--text)',
          }}
        >
          <input type="checkbox" checked={mips} onChange={(e) => setMips(e.target.checked)} />
          밉맵 포함 (+33%)
        </label>
      </ControlPanel>
      <figcaption>
        파란 막대는 선택한 포맷, 회색은 항상 RGBA8(32&nbsp;bpp) 기준선이다. 위 줄은 텍스처가
        VRAM에서 차지하는 <strong>메모리</strong>, 아래 줄은 매 프레임 한 번 통째로 읽는다고
        가정했을 때의 <strong>대역폭</strong>(× {FPS}&nbsp;fps)이다. 둘 다 같은 한 숫자 —
        texel당 비트수 — 에 비례하므로 막대 길이가 똑같이 줄어든다. BC1로 바꾸면 32→4&nbsp;bpp,
        즉 <strong>8:1</strong>로 줄어 75%를 훌쩍 넘는 절감이 나온다. 해상도를 한 칸 올리면
        텍셀 수가 4배라 막대가 4배로 자라는 것도 확인해 보라 — 압축이 절감하는 절대량은
        고해상도에서 더 커진다.
      </figcaption>
    </figure>
  );
}
