import { useEffect, useRef, useState } from 'react';
import {
  ControlPanel,
  Slider,
  SelectControl,
  ToggleControl,
  type SelectOption,
} from '../../controls';
import { valueNoise2D, valueAt, type Smoothing } from './noise';

const SMOOTH_OPTIONS: ReadonlyArray<SelectOption<Smoothing>> = [
  { value: 'linear', label: '선형 (없음)' },
  { value: 'smoothstep', label: 'smoothstep' },
  { value: 'quintic', label: 'quintic' },
];

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
 * 2D value noise 필드(흑백 히트맵).
 * 격자 오버레이를 켜면 정수 셀 경계와, 프로브가 있는 셀의 코너 4개 무작위 값을 보여준다.
 * 프로브(십자선)는 드래그 가능. 필드 아래에는 프로브 y를 지나는 가로 단면(1D 곡선)을 그려,
 * "노이즈 함수를 한 줄로 잘라낸 것"이 무엇인지 실시간으로 보여준다.
 */
export default function LatticeField2D() {
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const sliceRef = useRef<HTMLCanvasElement>(null);
  const [freq, setFreq] = useState(4); // 화면 폭에 들어갈 격자 셀 수
  const [seed, setSeed] = useState(3);
  const [smoothing, setSmoothing] = useState<Smoothing>('smoothstep');
  const [showGrid, setShowGrid] = useState(true);
  // 프로브 위치(0..1 정규화 좌표).
  const [probe, setProbe] = useState({ x: 0.42, y: 0.5 });
  const draggingRef = useRef(false);

  // 화면 정규화 좌표(0..1) → 노이즈 격자 좌표.
  const toGrid = (u: number) => u * freq;

  // 필드 그리기.
  useEffect(() => {
    const canvas = fieldRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const col = readColors(canvas);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 480;
      const cssH = 300;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);

      // 흑백 노이즈 필드를 저해상도 오프스크린 버퍼로 계산해 CSS로 업스케일한다.
      // (드래그 중 매번 다시 그리므로, 표시용 grayscale 필드는 내부 해상도를 모바일 위해 캡)
      const W = Math.min(Math.round(cssW), 320);
      const H = Math.round(W * (cssH / cssW));
      const buf = document.createElement('canvas');
      buf.width = W;
      buf.height = H;
      const bctx = buf.getContext('2d');
      if (!bctx) return;
      const img = bctx.createImageData(W, H);
      const data = img.data;
      for (let py = 0; py < H; py++) {
        const gy = toGrid(py / H);
        for (let px = 0; px < W; px++) {
          const gx = toGrid(px / W);
          const v = valueNoise2D(gx, gy, seed, smoothing); // [0,1)
          const g = Math.round(v * 255);
          const idx = (py * W + px) * 4;
          data[idx] = g;
          data[idx + 1] = g;
          data[idx + 2] = g;
          data[idx + 3] = 255;
        }
      }
      bctx.putImageData(img, 0, 0);

      // 이후 오버레이는 CSS 픽셀 좌표로. 버퍼를 부드럽게 확대.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buf, 0, 0, cssW, cssH);

      // 격자 오버레이.
      if (showGrid) {
        ctx.strokeStyle = col.accent;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1;
        for (let i = 0; i <= freq; i++) {
          const x = (i / freq) * cssW;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, cssH);
          ctx.stroke();
          const y = (i / freq) * cssH;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(cssW, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // 프로브가 있는 셀의 코너 4개 무작위 값 라벨.
        const cx = Math.floor(toGrid(probe.x));
        const cy = Math.floor(toGrid(probe.y));
        const cellL = (cx / freq) * cssW;
        const cellT = (cy / freq) * cssH;
        const cellW = cssW / freq;
        const cellH = cssH / freq;
        ctx.strokeStyle = col.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(cellL, cellT, cellW, cellH);

        const labelCorner = (ox: number, oy: number, ax: number, ay: number) => {
          const val = valueAt(cx + ox, cy + oy, seed);
          const x = cellL + ox * cellW;
          const y = cellT + oy * cellH;
          ctx.fillStyle = col.accent;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = 'bold 12px system-ui, sans-serif';
          const txt = val.toFixed(2);
          const tw = ctx.measureText(txt).width;
          const bx = x + ax * (tw + 8);
          const by = y + ay * 16;
          ctx.fillStyle = col.surface;
          ctx.fillRect(bx - 3, by - 12, tw + 6, 16);
          ctx.fillStyle = col.text;
          ctx.fillText(txt, bx, by);
        };
        // 네 코너 라벨을 셀 안쪽으로 살짝 들여 배치.
        labelCorner(0, 0, 0.15, 1.0);
        labelCorner(1, 0, -1.2, 1.0);
        labelCorner(0, 1, 0.15, -0.2);
        labelCorner(1, 1, -1.2, -0.2);
      }

      // 단면 위치를 나타내는 가로선.
      const probePxY = probe.y * cssH;
      ctx.strokeStyle = col.accent;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, probePxY);
      ctx.lineTo(cssW, probePxY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 프로브 십자선.
      const probePxX = probe.x * cssW;
      ctx.strokeStyle = col.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(probePxX, probePxY, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(probePxX - 12, probePxY);
      ctx.lineTo(probePxX + 12, probePxY);
      ctx.moveTo(probePxX, probePxY - 12);
      ctx.lineTo(probePxX, probePxY + 12);
      ctx.stroke();
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
  }, [freq, seed, smoothing, showGrid, probe]);

  // 단면(가로) 곡선 그리기.
  useEffect(() => {
    const canvas = sliceRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const col = readColors(canvas);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 480;
      const cssH = 130;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const padY = 16;
      const plotH = cssH - padY * 2;
      const Y = (v: number) => padY + (1 - v) * plotH;

      // 0/1 기준선.
      ctx.strokeStyle = col.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Y(0));
      ctx.lineTo(cssW, Y(0));
      ctx.moveTo(0, Y(1));
      ctx.lineTo(cssW, Y(1));
      ctx.stroke();

      // 격자 셀 경계 세로선.
      ctx.strokeStyle = col.border;
      ctx.globalAlpha = 0.6;
      for (let i = 0; i <= freq; i++) {
        const x = (i / freq) * cssW;
        ctx.beginPath();
        ctx.moveTo(x, padY);
        ctx.lineTo(x, padY + plotH);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 단면 곡선: 고정된 프로브 y, x를 가로로 훑는다.
      const gy = toGrid(probe.y);
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const steps = Math.max(240, freq * 40);
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const v = valueNoise2D(toGrid(u), gy, seed, smoothing);
        if (s === 0) ctx.moveTo(u * cssW, Y(v));
        else ctx.lineTo(u * cssW, Y(v));
      }
      ctx.stroke();

      // 프로브 x 위치 표시 점.
      const v = valueNoise2D(toGrid(probe.x), gy, seed, smoothing);
      ctx.fillStyle = col.text;
      ctx.beginPath();
      ctx.arc(probe.x * cssW, Y(v), 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = col.muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('프로브 y를 지나는 가로 단면 = 1D 노이즈', 6, 13);
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
  }, [freq, seed, smoothing, probe]);

  // 포인터로 프로브 드래그.
  const updateProbe = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setProbe({ x, y });
  };

  return (
    <figure className="demo">
      <canvas
        ref={fieldRef}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateProbe(e);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) updateProbe(e);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        style={{
          width: '100%',
          borderRadius: 10,
          border: '1px solid var(--border)',
          touchAction: 'none',
          display: 'block',
          cursor: 'crosshair',
        }}
      />
      <canvas
        ref={sliceRef}
        style={{
          width: '100%',
          marginTop: 8,
          borderRadius: 10,
          border: '1px solid var(--border)',
          touchAction: 'none',
          display: 'block',
        }}
      />
      <ControlPanel>
        <Slider label="주파수 (격자 셀 수)" value={freq} min={2} max={12} step={1} onChange={setFreq} />
        <Slider label="seed" value={seed} min={1} max={64} step={1} onChange={setSeed} />
        <SelectControl
          label="완화 방식"
          value={smoothing}
          options={SMOOTH_OPTIONS}
          onChange={setSmoothing}
        />
        <ToggleControl label="격자·코너값 표시" checked={showGrid} onChange={setShowGrid} />
      </ControlPanel>
      <figcaption>
        필드를 <strong>드래그</strong>해 프로브를 옮겨 보세요. 격자를 켜면 프로브가 있는 셀의{' '}
        <strong>코너 4개 무작위 값</strong>이 보입니다. 셀 내부는 이 네 값을 가로·세로로 양선형
        보간한 것이고, 아래 곡선은 프로브 y를 지나는 <strong>가로 단면</strong>입니다. 완화를 끄면
        (선형) 셀 경계가 각지고, smoothstep·quintic으로 바꾸면 경계가 매끄러워집니다.
      </figcaption>
    </figure>
  );
}
