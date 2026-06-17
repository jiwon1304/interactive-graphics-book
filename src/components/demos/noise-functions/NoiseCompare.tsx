import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { valueNoise2D, perlin2D01, simplex2D01 } from './noise';

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return {
    text: cs.getPropertyValue('--text').trim() || '#222',
    surface: cs.getPropertyValue('--surface').trim() || '#fff',
    border: cs.getPropertyValue('--border').trim() || '#ccc',
  };
}

type Kind = 'value' | 'perlin' | 'simplex';
const TITLES: Record<Kind, string> = {
  value: 'value',
  perlin: 'Perlin',
  simplex: 'simplex',
};

/**
 * value · Perlin · simplex 세 패널을 같은 seed로 나란히 비교.
 * 같은 무작위성, 다른 구성. value의 격자 자국, Perlin의 축 방향 편향,
 * simplex의 더 균일·등방적 구조를 한눈에 본다.
 */
export default function NoiseCompare() {
  const valRef = useRef<HTMLCanvasElement>(null);
  const perRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<HTMLCanvasElement>(null);
  const [freq, setFreq] = useState(6);
  const [seed, setSeed] = useState(11);

  const drawPanel = (canvas: HTMLCanvasElement | null, kind: Kind) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const col = readColors(canvas);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 200;
    const cssH = 200;
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
        let v: number;
        if (kind === 'value') v = valueNoise2D(gx, gy, seed, 'quintic');
        else if (kind === 'perlin') v = perlin2D01(gx, gy, seed, 'quintic');
        else v = simplex2D01(gx, gy, seed);
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
    ctx.fillStyle = col.surface;
    ctx.fillRect(0, 0, 78, 22);
    ctx.fillStyle = col.text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(TITLES[kind], 6, 16);
  };

  useEffect(() => {
    const redraw = () => {
      drawPanel(valRef.current, 'value');
      drawPanel(perRef.current, 'perlin');
      drawPanel(simRef.current, 'simplex');
    };
    redraw();
    const ro = new ResizeObserver(redraw);
    if (valRef.current) ro.observe(valRef.current);
    if (perRef.current) ro.observe(perRef.current);
    if (simRef.current) ro.observe(simRef.current);
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq, seed]);

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
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <canvas ref={valRef} style={canvasStyle} />
        </div>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <canvas ref={perRef} style={canvasStyle} />
        </div>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <canvas ref={simRef} style={canvasStyle} />
        </div>
      </div>
      <ControlPanel>
        <Slider label="주파수" value={freq} min={2} max={12} step={1} onChange={setFreq} />
        <Slider label="seed" value={seed} min={1} max={64} step={1} onChange={setSeed} />
      </ControlPanel>
      <figcaption>
        세 패널 모두 <strong>같은 seed</strong>입니다. 무작위성은 같고 구성만 다르죠.{' '}
        <strong>value</strong>는 정사각 격자 자국이, <strong>Perlin</strong>은 수평·수직 축을 따른
        미세한 방향 편향이 보입니다. <strong>simplex</strong>는 삼각형 격자를 써서 코너 수가 적고
        (차원이 커질수록 비용 이득) 방향 편향이 약해 더 균일·등방적입니다.
      </figcaption>
    </figure>
  );
}
