import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { fbm, fbmOctave } from './noise';

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return {
    text: cs.getPropertyValue('--text').trim() || '#222',
    muted: cs.getPropertyValue('--muted').trim() || '#888',
    surface: cs.getPropertyValue('--surface').trim() || '#fff',
  };
}

const LACUNARITY = 2; // 옥타브마다 주파수 ×2
const BASE_FREQ = 3; // 0번 옥타브의 기본 주파수

/**
 * fBm(fractal Brownian motion)을 옥타브별로 쌓는 과정.
 * 위쪽 큰 캔버스 = 옥타브 합(최종 필드). 아래 썸네일 행 = 각 옥타브의 단독 기여.
 * octaves를 늘리면 더 작은 디테일이 점점 누적되는 것을 본다.
 */
export default function FbmOctaves() {
  const sumRef = useRef<HTMLCanvasElement>(null);
  const thumbsRef = useRef<HTMLCanvasElement>(null);
  const [octaves, setOctaves] = useState(5);
  const [gain, setGain] = useState(0.5);
  const [seed, setSeed] = useState(13);

  // 합 필드.
  useEffect(() => {
    const canvas = sumRef.current;
    if (!canvas) return;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 420;
      const cssH = 260;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const W = canvas.width;
      const H = canvas.height;
      const img = ctx.createImageData(W, H);
      const data = img.data;
      for (let py = 0; py < H; py++) {
        const y = (py / H) * BASE_FREQ;
        for (let px = 0; px < W; px++) {
          const x = (px / W) * BASE_FREQ;
          const v = fbm(x, y, {
            seed,
            octaves,
            lacunarity: LACUNARITY,
            gain,
            base: 'perlin',
            smoothing: 'quintic',
          });
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
      ctx.fillRect(0, 0, 150, 22);
      ctx.fillStyle = col.text;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(`옥타브 합 (${octaves}개)`, 6, 16);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [octaves, gain, seed]);

  // 옥타브 썸네일 행.
  useEffect(() => {
    const canvas = thumbsRef.current;
    if (!canvas) return;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 420;
      const maxOct = 6;
      const gap = 6;
      const labelH = 18;
      const cell = Math.floor((cssW - gap * (maxOct - 1)) / maxOct);
      const cssH = cell + labelH;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // 썸네일은 작은 오프스크린 ImageData로 그린 뒤 셀에 그린다.
      for (let o = 0; o < maxOct; o++) {
        const active = o < octaves;
        const x0 = o * (cell + gap);
        const res = Math.round(cell * dpr);
        const img = ctx.createImageData(res, res);
        const data = img.data;
        for (let py = 0; py < res; py++) {
          const y = (py / res) * BASE_FREQ;
          for (let px = 0; px < res; px++) {
            const x = (px / res) * BASE_FREQ;
            let g: number;
            if (active) {
              const v = fbmOctave(x, y, o, {
                seed,
                lacunarity: LACUNARITY,
                base: 'perlin',
                smoothing: 'quintic',
              });
              g = Math.round(Math.min(1, Math.max(0, v)) * 255);
            } else {
              g = 30; // 비활성 옥타브는 어둡게
            }
            const idx = (py * res + px) * 4;
            data[idx] = g;
            data[idx + 1] = g;
            data[idx + 2] = g;
            data[idx + 3] = active ? 255 : 90;
          }
        }
        // ImageData는 변환을 무시하므로 임시 캔버스를 거쳐 배치.
        const tmp = document.createElement('canvas');
        tmp.width = res;
        tmp.height = res;
        const tctx = tmp.getContext('2d');
        if (tctx) {
          tctx.putImageData(img, 0, 0);
          ctx.drawImage(tmp, x0, 0, cell, cell);
        }
        // 라벨(진폭 = gain^o).
        ctx.fillStyle = active ? col.text : col.muted;
        ctx.font = '12px system-ui, sans-serif';
        const amp = Math.pow(gain, o);
        ctx.fillText(`#${o} ×${amp.toFixed(2)}`, x0 + 2, cell + 14);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [octaves, gain, seed]);

  return (
    <figure className="demo">
      <canvas
        ref={sumRef}
        style={{
          width: '100%',
          borderRadius: 10,
          border: '1px solid var(--border)',
          touchAction: 'none',
          display: 'block',
        }}
      />
      <canvas
        ref={thumbsRef}
        style={{
          width: '100%',
          marginTop: 8,
          touchAction: 'none',
          display: 'block',
        }}
      />
      <ControlPanel>
        <Slider label="옥타브 수" value={octaves} min={1} max={6} step={1} onChange={setOctaves} />
        <Slider
          label="gain (진폭 감쇠)"
          value={gain}
          min={0.2}
          max={0.8}
          step={0.05}
          onChange={setGain}
          format={(v) => v.toFixed(2)}
        />
        <Slider label="seed" value={seed} min={1} max={64} step={1} onChange={setSeed} />
      </ControlPanel>
      <figcaption>
        위 필드는 아래 썸네일들의 <strong>합</strong>입니다. 각 옥타브는 주파수를 2배(lacunarity 2)로
        키우고 진폭을 <code>gain</code>배로 줄입니다(라벨의 ×값). <strong>옥타브 수</strong>를 늘릴
        때마다 더 미세한 디테일이 차곡차곡 쌓여 구름·지형 같은 프랙탈 질감이 만들어집니다.{' '}
        <code>gain</code>이 클수록 잔디테일이 강해 거칠어집니다.
      </figcaption>
    </figure>
  );
}
