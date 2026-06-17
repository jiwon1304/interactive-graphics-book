import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { valueNoise2D, perlin2D01, gradientAt } from './noise';

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

type Kind = 'value' | 'perlin';

/**
 * value noise vs Perlin(그래디언트) noise를 같은 seed로 나란히.
 * 왼쪽은 value, 오른쪽은 Perlin. Perlin은 격자점의 무작위 그래디언트(화살표)와
 * (점 − 코너) 오프셋의 내적을 보간하므로 격자점에서 정확히 0이 되고, 더 등방적이다.
 * value noise는 축 정렬된 격자 자국이 잘 보인다.
 */
export default function GradientVsValue() {
  const valueRef = useRef<HTMLCanvasElement>(null);
  const perlinRef = useRef<HTMLCanvasElement>(null);
  const [freq, setFreq] = useState(5);
  const [seed, setSeed] = useState(7);
  const [showArrows, setShowArrows] = useState(true);

  const drawPanel = (canvas: HTMLCanvasElement | null, kind: Kind, arrows: boolean) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const col = readColors(canvas);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 280;
    const cssH = 240;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const W = canvas.width;
    const H = canvas.height;
    const img = ctx.createImageData(W, H);
    const data = img.data;
    for (let py = 0; py < H; py++) {
      const gy = (py / H) * freq;
      for (let px = 0; px < W; px++) {
        const gx = (px / W) * freq;
        const v = kind === 'value' ? valueNoise2D(gx, gy, seed, 'quintic') : perlin2D01(gx, gy, seed, 'quintic');
        const g = Math.round(Math.min(1, Math.max(0, v)) * 255);
        const idx = (py * W + px) * 4;
        data[idx] = g;
        data[idx + 1] = g;
        data[idx + 2] = g;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Perlin 패널에서 그래디언트 화살표 + 격자점 표시.
    if (kind === 'perlin' && arrows) {
      const cellW = cssW / freq;
      const cellH = cssH / freq;
      const len = Math.min(cellW, cellH) * 0.38;
      for (let j = 0; j <= freq; j++) {
        for (let i = 0; i <= freq; i++) {
          const [gxv, gyv] = gradientAt(i, j, seed);
          const ox = i * cellW;
          const oy = j * cellH;
          // 격자점(노이즈가 0인 곳).
          ctx.fillStyle = col.accent;
          ctx.beginPath();
          ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
          ctx.fill();
          // 그래디언트 방향 화살표.
          const ex = ox + gxv * len;
          const ey = oy + gyv * len;
          ctx.strokeStyle = col.accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          // 화살촉.
          const a = Math.atan2(gyv, gxv);
          const hs = 5;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - hs * Math.cos(a - 0.4), ey - hs * Math.sin(a - 0.4));
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - hs * Math.cos(a + 0.4), ey - hs * Math.sin(a + 0.4));
          ctx.stroke();
        }
      }
    }

    // 패널 제목.
    ctx.fillStyle = col.surface;
    ctx.fillRect(0, 0, kind === 'value' ? 110 : 130, 22);
    ctx.fillStyle = col.text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(kind === 'value' ? 'value noise' : 'Perlin (그래디언트)', 6, 16);
  };

  useEffect(() => {
    const redraw = () => {
      drawPanel(valueRef.current, 'value', showArrows);
      drawPanel(perlinRef.current, 'perlin', showArrows);
    };
    redraw();
    const ro = new ResizeObserver(redraw);
    if (valueRef.current) ro.observe(valueRef.current);
    if (perlinRef.current) ro.observe(perlinRef.current);
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq, seed, showArrows]);

  const canvasStyle = {
    width: '100%',
    borderRadius: 10,
    border: '1px solid var(--border)',
    touchAction: 'none' as const,
    display: 'block' as const,
  };

  return (
    <figure className="demo">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <canvas ref={valueRef} style={canvasStyle} />
        </div>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <canvas ref={perlinRef} style={canvasStyle} />
        </div>
      </div>
      <ControlPanel>
        <Slider label="주파수" value={freq} min={2} max={10} step={1} onChange={setFreq} />
        <Slider label="seed" value={seed} min={1} max={64} step={1} onChange={setSeed} />
        <ToggleControl label="그래디언트 화살표" checked={showArrows} onChange={setShowArrows} />
      </ControlPanel>
      <figcaption>
        같은 seed, 다른 방식입니다. 오른쪽 Perlin 패널의 화살표는 각 <strong>격자점의 무작위
        그래디언트</strong>입니다. Perlin은 코너 그래디언트와 (점 − 코너) 벡터의 <strong>내적</strong>을
        보간하므로 격자점에서 값이 정확히 0(중간 회색)이고, 더 등방적입니다. 왼쪽 value noise는
        축에 정렬된 <strong>격자 자국</strong>이 도드라지죠. 화살표를 끄고 두 질감을 비교해 보세요.
      </figcaption>
    </figure>
  );
}
