import { useEffect, useRef, useState } from 'react';
import {
  ControlPanel,
  Slider,
  SelectControl,
  ToggleControl,
  type SelectOption,
} from '../../controls';
import { fbm, type BaseNoise, type Smoothing } from './noise';

const BASE_OPTIONS: ReadonlyArray<SelectOption<BaseNoise>> = [
  { value: 'perlin', label: 'Perlin' },
  { value: 'value', label: 'value' },
];

const SMOOTH_OPTIONS: ReadonlyArray<SelectOption<Smoothing>> = [
  { value: 'smoothstep', label: 'smoothstep' },
  { value: 'quintic', label: 'quintic' },
  { value: 'linear', label: '선형' },
];

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return {
    text: cs.getPropertyValue('--text').trim() || '#222',
    surface: cs.getPropertyValue('--surface').trim() || '#fff',
  };
}

/**
 * 놀이터 위젯: fBm 필드를 실시간으로 만진다.
 * 도메인 워핑을 켜면 노이즈를 자기 자신의 좌표에 먹여
 *   warp(x,y) = (x + s·noise(x,y), y + s·noise(x+5.2, y+1.3))
 * 대리석/연기 같은 유기적 소용돌이가 생긴다.
 * 애니메이션을 켜면 시간 오프셋으로 패턴이 흐른다.
 * 성능을 위해 저해상도 필드를 CSS로 확대한다(모바일 부드러움 우선).
 */
export default function LiveField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [freq, setFreq] = useState(4);
  const [seed, setSeed] = useState(21);
  const [base, setBase] = useState<BaseNoise>('perlin');
  const [smoothing, setSmoothing] = useState<Smoothing>('quintic');
  const [warp, setWarp] = useState(true);
  const [warpStrength, setWarpStrength] = useState(0.8);
  const [animate, setAnimate] = useState(true);

  // 최신 파라미터를 ref로 들고 있어 애니메이션 루프를 재시작하지 않게.
  const paramsRef = useRef({ freq, seed, base, smoothing, warp, warpStrength, animate });
  paramsRef.current = { freq, seed, base, smoothing, warp, warpStrength, animate };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 저해상도 오프스크린 버퍼(연산량↓), CSS로 업스케일.
    const RES = 150;
    const buf = document.createElement('canvas');
    buf.width = RES;
    buf.height = RES;
    const bctx = buf.getContext('2d');
    if (!bctx) return;
    const img = bctx.createImageData(RES, RES);
    const data = img.data;

    let raf = 0;
    let start = performance.now();
    let lastStatic = -1; // 정적 모드에서 파라미터 변화 감지용 해시

    const sampleFbm = (x: number, y: number, p: typeof paramsRef.current) =>
      fbm(x, y, {
        seed: p.seed,
        octaves: 4,
        lacunarity: 2,
        gain: 0.5,
        base: p.base,
        smoothing: p.smoothing,
      });

    const renderField = (t: number) => {
      const p = paramsRef.current;
      const col = readColors(canvas);
      for (let py = 0; py < RES; py++) {
        const v0 = (py / RES) * p.freq;
        for (let px = 0; px < RES; px++) {
          const u0 = (px / RES) * p.freq;
          let x = u0 + t * 0.15; // 애니메이션 시 천천히 흐름
          let y = v0;
          if (p.warp) {
            // 노이즈를 좌표에 먹여 워핑.
            const wx = sampleFbm(x, y, p) - 0.5;
            const wy = sampleFbm(x + 5.2, y + 1.3, p) - 0.5;
            x += p.warpStrength * wx * 2;
            y += p.warpStrength * wy * 2;
          }
          const val = sampleFbm(x, y, p);
          const g = Math.round(Math.min(1, Math.max(0, val)) * 255);
          const idx = (py * RES + px) * 4;
          data[idx] = g;
          data[idx + 1] = g;
          data[idx + 2] = g;
          data[idx + 3] = 255;
        }
      }
      bctx.putImageData(img, 0, 0);

      // 메인 캔버스에 확대 그리기(부드러운 보간).
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 420;
      const cssH = 300;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buf, 0, 0, cssW, cssH);

      // 라벨.
      ctx.fillStyle = col.surface;
      ctx.fillRect(0, 0, p.warp ? 150 : 90, 22);
      ctx.fillStyle = col.text;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(p.warp ? '도메인 워핑 ON' : '기본 fBm', 6, 16);
    };

    const loop = () => {
      const p = paramsRef.current;
      if (p.animate) {
        const t = (performance.now() - start) / 1000;
        renderField(t);
        raf = requestAnimationFrame(loop);
      } else {
        // 정적: 파라미터가 바뀔 때만 다시 그린다(배터리 절약).
        const h =
          p.freq * 1e6 +
          p.seed * 1e3 +
          (p.warp ? 1 : 0) * 7 +
          p.warpStrength * 13 +
          (p.base === 'perlin' ? 1 : 2) +
          (p.smoothing === 'quintic' ? 3 : p.smoothing === 'smoothstep' ? 5 : 9);
        if (h !== lastStatic) {
          lastStatic = h;
          renderField(0);
        }
        raf = requestAnimationFrame(loop);
      }
    };

    start = performance.now();
    loop();

    const onResize = () => {
      lastStatic = -1; // 리사이즈 시 강제 재렌더
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);
    const mo = new MutationObserver(() => {
      lastStatic = -1;
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

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
        <Slider label="주파수" value={freq} min={1} max={8} step={0.5} onChange={setFreq} />
        <Slider label="seed" value={seed} min={1} max={64} step={1} onChange={setSeed} />
        <SelectControl label="기본 노이즈" value={base} options={BASE_OPTIONS} onChange={setBase} />
        <SelectControl
          label="완화"
          value={smoothing}
          options={SMOOTH_OPTIONS}
          onChange={setSmoothing}
        />
        <ToggleControl label="도메인 워핑" checked={warp} onChange={setWarp} />
        <Slider
          label="워핑 강도"
          value={warpStrength}
          min={0}
          max={2}
          step={0.05}
          onChange={setWarpStrength}
          format={(v) => v.toFixed(2)}
        />
        <ToggleControl label="애니메이션" checked={animate} onChange={setAnimate} />
      </ControlPanel>
      <figcaption>
        마음껏 만져 보세요. <strong>도메인 워핑</strong>은 노이즈를 자기 자신의 좌표에 먹이는
        기법입니다: <code>noise(x + s·noise(x,y), …)</code>. 강도를 올리면 대리석·연기 같은 유기적
        소용돌이가 생깁니다. 애니메이션을 켜면 패턴이 천천히 흐릅니다(끄면 배터리를 아낍니다).
      </figcaption>
    </figure>
  );
}
