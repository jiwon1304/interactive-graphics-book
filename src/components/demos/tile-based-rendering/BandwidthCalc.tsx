import { useState } from 'react';
import { ControlPanel, Slider, SelectControl, type SelectOption } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { bandwidth, fmtBytesPerSec, COLORS, withAlpha, roundRect, monoFont } from './tbr2d';

// BandwidthCalc (인터랙티브 계산기): 해상도·overdraw·fps 슬라이더 →
// IMR vs TBR 외부 대역폭(GB/s) 막대 + 절감 배수. 공식은 본문/figcaption에.

interface Res {
  label: string;
  w: number;
  h: number;
}
const RESOLUTIONS: ReadonlyArray<SelectOption<string>> = [
  { value: '720', label: '1280×720 (HD)' },
  { value: '1080', label: '1920×1080 (FHD)' },
  { value: '1440', label: '2560×1440 (QHD)' },
  { value: '4k', label: '3840×2160 (4K)' },
];
const RES_MAP: Record<string, Res> = {
  '720': { label: 'HD', w: 1280, h: 720 },
  '1080': { label: 'FHD', w: 1920, h: 1080 },
  '1440': { label: 'QHD', w: 2560, h: 1440 },
  '4k': { label: '4K', w: 3840, h: 2160 },
};

// parameter buffer 추정: 프레임당 대략 고정 8MB 가정(도식용 단순화).
const PARAM_BYTES = 8 * 1e6;

export default function BandwidthCalc() {
  const [resKey, setResKey] = useState<string>('1080');
  const [overdraw, setOverdraw] = useState(4);
  const [fps, setFps] = useState(60);

  const res = RES_MAP[resKey];
  const bw = bandwidth({
    width: res.w,
    height: res.h,
    bpp: 4,
    overdraw,
    fps,
    paramBytes: PARAM_BYTES,
  });

  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;

    const pad = 14;
    const barH = 40;
    const labelW = 70;
    const barAreaW = w - labelW - pad * 2 - 90;
    const maxBw = Math.max(bw.imr, bw.tbr, 1);

    const rows = [
      { name: 'IMR', val: bw.imr, col: COLORS.dram },
      { name: 'TBR', val: bw.tbr, col: COLORS.gmem },
    ];

    let y = 40;
    for (const r of rows) {
      ctx.font = monoFont(13, 'bold');
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
      ctx.fillText(fmtBytesPerSec(r.val), bx + bw2 + 8, y + barH / 2);
      y += barH + 24;
    }
    ctx.textBaseline = 'alphabetic';

    // 절감 배수 강조
    ctx.font = monoFont(22, 'bold');
    ctx.fillStyle = COLORS.gmem;
    ctx.textAlign = 'center';
    ctx.fillText(`외부 대역폭 ${bw.ratio.toFixed(2)}× 절감`, w / 2, y + 18);
    ctx.textAlign = 'start';
  };

  const { ref } = useCanvas2d(draw, [resKey, overdraw, fps]);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 230, display: 'block' }} />
      <ControlPanel>
        <SelectControl label="해상도" value={resKey} options={RESOLUTIONS} onChange={setResKey} />
        <Slider
          label="overdraw"
          value={overdraw}
          min={1}
          max={10}
          step={1}
          onChange={setOverdraw}
          format={(v) => `${Math.round(v)}×`}
        />
        <Slider label="fps" value={fps} min={30} max={120} step={1} onChange={setFps} unit=" fps" />
      </ControlPanel>
      <figcaption>
        color 프레임버퍼 트래픽만 센 단순 모델입니다. <strong>IMR</strong>은 프래그먼트마다 color를
        read-modify-write 하므로{' '}
        <code>해상도 × 4B × 2(read+write) × overdraw × fps</code>,{' '}
        <strong>TBR</strong>은 타일 끝에 color를 1회 write 하므로{' '}
        <code>해상도 × 4B × 1 × fps</code>에 binning의 parameter buffer(여기선 프레임당 8MB로
        고정 가정)를 더합니다. overdraw를 올리면 IMR만 비례해 늘고 TBR은 거의 그대로라, 절감 배수가
        커집니다. depth 트래픽까지 넣으면 IMR 쪽이 더 불리해지므로 실제 절감은 이보다 큽니다 —
        흔히 인용되는 <strong>약 1.96×</strong>는 보수적인 추정입니다.{' '}
        <strong>직접 해보세요:</strong> 4K·overdraw 8×로 올리면 IMR이 수십 GB/s에 이르는데, 모바일
        DRAM의 실효 대역폭은 보통 그보다 작습니다 — 그래서 모바일은 IMR을 쓸 수가 없습니다.
      </figcaption>
    </figure>
  );
}
