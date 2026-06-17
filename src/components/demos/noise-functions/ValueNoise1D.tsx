import { useEffect, useRef, useState } from 'react';
import {
  ControlPanel,
  Slider,
  SelectControl,
  ToggleControl,
  type SelectOption,
} from '../../controls';
import { valueAt1D, ease, type Smoothing } from './noise';

// 보간(완화) 방식 선택.
const SMOOTH_OPTIONS: ReadonlyArray<SelectOption<Smoothing>> = [
  { value: 'linear', label: '선형 (linear)' },
  { value: 'smoothstep', label: 'smoothstep (3t²−2t³)' },
  { value: 'quintic', label: 'quintic (6t⁵−15t⁴+10t³)' },
];

// 캔버스에서 CSS 변수 색을 읽는다(테마 토글에 자동 반응).
function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return {
    text: cs.getPropertyValue('--text').trim() || '#222',
    muted: cs.getPropertyValue('--muted').trim() || '#888',
    border: cs.getPropertyValue('--border').trim() || '#ccc',
    accent: cs.getPropertyValue('--accent').trim() || '#4f9dde',
    surface: cs.getPropertyValue('--surface').trim() || '#fff',
  };
}

/**
 * 1D value noise.
 * 정수 격자점마다 무작위 값(점)을 찍고, 그 사이를 선택한 완화 함수로 보간한 곡선을 그린다.
 * 격자점 개수(주파수)·seed·보간 방식을 바꾸며 "무작위 점 + 부드러운 사잇값"을 직접 본다.
 */
export default function ValueNoise1D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(8); // 격자점 개수(주파수)
  const [seed, setSeed] = useState(1);
  const [smoothing, setSmoothing] = useState<Smoothing>('quintic');
  const [showKnots, setShowKnots] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const col = readColors(canvas);

      // 백킹 스토어 해상도(DPR 상한 2)로 선명도 유지.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 600;
      const cssH = 260;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const padX = 24;
      const padY = 30;
      const plotW = cssW - padX * 2;
      const plotH = cssH - padY * 2;
      // x: 격자점 0..count 를 가로폭에 매핑, y: 값 0..1 을 세로(위가 1)에 매핑.
      const X = (gx: number) => padX + (gx / count) * plotW;
      const Y = (v: number) => padY + (1 - v) * plotH;

      // 기준선/격자(연한 세로선) + 0/1 가로선
      ctx.strokeStyle = col.border;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i <= count; i++) {
        ctx.beginPath();
        ctx.moveTo(X(i), padY);
        ctx.lineTo(X(i), padY + plotH);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(padX, Y(0));
      ctx.lineTo(padX + plotW, Y(0));
      ctx.moveTo(padX, Y(1));
      ctx.lineTo(padX + plotW, Y(1));
      ctx.stroke();

      // 보간 곡선: 각 격자 구간을 잘게 샘플.
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const steps = Math.max(200, count * 30);
      for (let s = 0; s <= steps; s++) {
        const gx = (s / steps) * count; // 0..count
        const i0 = Math.floor(gx);
        const f = gx - i0;
        const v0 = valueAt1D(i0, seed);
        const v1 = valueAt1D(i0 + 1, seed);
        const v = v0 + (v1 - v0) * ease(f, smoothing);
        if (s === 0) ctx.moveTo(X(gx), Y(v));
        else ctx.lineTo(X(gx), Y(v));
      }
      ctx.stroke();

      // 격자점(무작위 값 = 곡선이 반드시 통과하는 knot) 마커
      if (showKnots) {
        for (let i = 0; i <= count; i++) {
          const v = valueAt1D(i, seed);
          ctx.fillStyle = col.text;
          ctx.beginPath();
          ctx.arc(X(i), Y(v), 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = col.surface;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // 축 레이블
      ctx.fillStyle = col.muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('값 1', 4, Y(1) + 4);
      ctx.fillText('값 0', 4, Y(0) + 4);
      ctx.fillText('격자점(정수) →', padX, cssH - 8);
    };

    draw();
    // 리사이즈·테마 토글 시 다시 그린다.
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [count, seed, smoothing, showKnots]);

  return (
    <figure className="demo">
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          borderRadius: 10,
          border: '1px solid var(--border)',
          touchAction: 'none',
          display: 'block',
        }}
      />
      <ControlPanel>
        <Slider
          label="격자점 개수 (주파수)"
          value={count}
          min={2}
          max={24}
          step={1}
          onChange={setCount}
        />
        <Slider label="seed" value={seed} min={1} max={64} step={1} onChange={setSeed} />
        <SelectControl
          label="보간 방식"
          value={smoothing}
          options={SMOOTH_OPTIONS}
          onChange={setSmoothing}
        />
        <ToggleControl label="격자점 표시" checked={showKnots} onChange={setShowKnots} />
      </ControlPanel>
      <figcaption>
        검은 점이 <strong>정수 격자점의 무작위 값</strong>입니다. 곡선은 그 점들 사이를 보간한
        것이죠. 보간 방식을 <strong>선형 → smoothstep → quintic</strong>으로 바꿔 보세요. 선형은
        격자점마다 꺾인 자국이 보이지만, quintic은 격자점에서 1·2차 도함수가 모두 0이라 자국 없이
        매끈합니다. seed를 돌리면 같은 구조로 다른 무작위 패턴이 나옵니다.
      </figcaption>
    </figure>
  );
}
