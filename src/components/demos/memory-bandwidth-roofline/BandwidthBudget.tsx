import { useState } from 'react';
import { ControlPanel, Slider, SelectControl, type SelectOption } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, roundRect, monoFont, frameBandwidthGBps } from './mbr2d';

// BandwidthBudget (I, 계산기):
// 해상도·bpp·overdraw·fps 슬라이더 → 필요한 컬러 버퍼 대역폭(GB/s) vs GPU 예산 막대.
// 초과하면 빨강. read+write=2 고정(블렌딩: 목적지 읽고 결과 쓰기).

interface Res {
  label: string;
  w: number;
  h: number;
}
const RESOLUTIONS: ReadonlyArray<SelectOption<string>> = [
  { value: '1280x720', label: '720p (1280×720)' },
  { value: '1920x1080', label: '1080p (1920×1080)' },
  { value: '2560x1440', label: '1440p (2560×1440)' },
  { value: '3840x2160', label: '4K (3840×2160)' },
];
function parseRes(v: string): Res {
  const [w, h] = v.split('x').map(Number);
  return { label: v, w, h };
}

const RW = 2; // read + write (블렌딩)
const GPU_BUDGET = 448; // GB/s — 중급 GPU 한 장의 전형 (예: GDDR6 256-bit급)

export default function BandwidthBudget() {
  const [resKey, setResKey] = useState('1920x1080');
  const [bpp, setBpp] = useState(4); // byte/pixel (RGBA8=4, FP16=8)
  const [overdraw, setOverdraw] = useState(3);
  const [fps, setFps] = useState(60);

  const res = parseRes(resKey);
  const need = frameBandwidthGBps(res.w, res.h, bpp, RW, overdraw, fps);
  const over = need > GPU_BUDGET;
  const frac = need / GPU_BUDGET;

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;

    const padL = 14;
    const padR = 14;
    const top = 26;
    const barH = 34;
    const areaW = w - padL - padR;
    const scaleMax = Math.max(need, GPU_BUDGET) * 1.12;
    const unit = areaW / scaleMax;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // 필요 대역폭 막대
    ctx.font = monoFont(11, 'bold');
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
    ctx.font = monoFont(12, 'bold');
    ctx.textAlign = needW > 90 ? 'right' : 'left';
    ctx.fillText(
      `${need.toFixed(0)} GB/s`,
      needW > 90 ? padL + needW - 10 : padL + needW + 8,
      top + barH / 2,
    );
    if (needW <= 90) ctx.fillStyle = theme.text;

    // GPU 예산 막대
    const top2 = top + barH + 30;
    ctx.fillStyle = theme.text;
    ctx.font = monoFont(11, 'bold');
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

    // 결론
    ctx.font = monoFont(12, 'bold');
    ctx.fillStyle = over ? COLORS.bad : COLORS.good;
    ctx.textAlign = 'left';
    const msg = over
      ? `예산 초과 ${frac.toFixed(2)}× — 60fps 불가, 다른 트래픽 전에 이미 컬러만으로 넘침`
      : `예산 안 (${(frac * 100).toFixed(0)}%) — 컬러 트래픽 여유 있음`;
    ctx.fillText(msg, padL, top2 + barH + 22);
  };

  const { ref } = useCanvas2d(draw, [resKey, bpp, overdraw, fps]);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 200, display: 'block' }} />
      <ControlPanel>
        <SelectControl label="해상도" value={resKey} options={RESOLUTIONS} onChange={setResKey} />
        <Slider
          label="byte/pixel"
          value={bpp}
          min={4}
          max={16}
          step={4}
          unit=" B"
          onChange={setBpp}
        />
        <Slider
          label="평균 overdraw"
          value={overdraw}
          min={1}
          max={8}
          step={0.5}
          unit="×"
          onChange={setOverdraw}
        />
        <Slider label="fps" value={fps} min={30} max={144} step={1} onChange={setFps} />
      </ControlPanel>
      <figcaption>
        한 프레임의 컬러 버퍼 트래픽만 셈해 봅니다: BW = W·H·(byte/pixel)·(read+write)·overdraw·fps.
        read+write는 블렌딩이 목적지를 읽고 결과를 쓰므로 2로 둡니다. 지금 설정({res.w}×{res.h},{' '}
        {bpp} B/px, overdraw {overdraw}×, {fps} fps)이면 컬러 트래픽만{' '}
        <strong style={{ color: over ? COLORS.bad : COLORS.good }}>{need.toFixed(0)} GB/s</strong>가
        필요합니다. <span style={{ color: COLORS.cache }}>GPU 예산</span>은 {GPU_BUDGET} GB/s —{' '}
        {over ? (
          <>
            <strong style={{ color: COLORS.bad }}>이미 초과({frac.toFixed(2)}×)</strong>합니다. 이건
            depth·텍스처·정점을 한 byte도 안 센 값입니다. overdraw를 줄이거나(불투명 정렬·Hi-Z),
            byte/pixel을 낮추거나, 압축으로 트래픽을 깎아야 합니다.
          </>
        ) : (
          <>
            예산의 <strong>{(frac * 100).toFixed(0)}%</strong>입니다. overdraw나 해상도를 올려 막대가
            빨강 선을 넘기는 지점을 찾아보세요 — 컬러 하나만으로도 금세 예산이 찹니다.
          </>
        )}
      </figcaption>
    </figure>
  );
}
