import { useEffect, useRef, useState } from 'react';
import { ControlPanel, SelectControl, Slider, type SelectOption } from '../../controls';

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return { border: cs.getPropertyValue('--border').trim() || '#ccc', text: cs.getPropertyValue('--text').trim() || '#222' };
}

type View = 'input' | 'edges' | 'fxaa';
const VIEW_OPTIONS: ReadonlyArray<SelectOption<View>> = [
  { value: 'input', label: '입력 이미지 (계단)' },
  { value: 'edges', label: '검출된 에지 (luma 대비)' },
  { value: 'fxaa', label: 'FXAA 결과 (에지 블러)' },
];

// 하드 에지가 있는 작은 장면(원 + 사선)을 그레이스케일로 렌더.
function sceneLuma(x: number, y: number): number {
  // 원
  const dx = x - 0.62;
  const dy = y - 0.4;
  if (dx * dx + dy * dy < 0.052) return 0.1;
  // 굵은 사선
  if (Math.abs(y - (0.7 * x + 0.05)) < 0.05) return 0.15;
  return 0.92;
}

/**
 * 위젯 — FXAA의 원리: 최종 이미지의 luma 대비로 에지를 찾아 그 방향으로만 블러.
 * 입력(계단) → 검출된 에지 마스크 → FXAA 결과를 토글로 비교.
 * "과정": 기하 정보 없이 픽셀 색만으로 에지를 찾고 다듬는 후처리 과정을 본다.
 */
export default function FxaaEdges() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>('fxaa');
  const [thresh, setThresh] = useState(0.1);

  const draw = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const col = readColors(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 340;
    const cssH = 240;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 저해상도 그리드에서 계단이 생기도록 렌더(픽셀화)
    const PW = 80;
    const PH = Math.round((PW * cssH) / cssW);
    const lum = new Float32Array(PW * PH);
    for (let py = 0; py < PH; py++) {
      for (let px = 0; px < PW; px++) {
        lum[py * PW + px] = sceneLuma((px + 0.5) / PW, (py + 0.5) / PH);
      }
    }

    const out = new Float32Array(PW * PH);
    const sample = (px: number, py: number) =>
      lum[Math.max(0, Math.min(PH - 1, py)) * PW + Math.max(0, Math.min(PW - 1, px))];

    for (let py = 0; py < PH; py++) {
      for (let px = 0; px < PW; px++) {
        const c = sample(px, py);
        const n = sample(px, py - 1);
        const s = sample(px, py + 1);
        const e = sample(px + 1, py);
        const w = sample(px - 1, py);
        const contrast = Math.max(n, s, e, w, c) - Math.min(n, s, e, w, c);
        if (view === 'edges') {
          out[py * PW + px] = contrast > thresh ? 0.05 : 0.95;
        } else if (view === 'fxaa') {
          if (contrast > thresh) {
            // 에지 근처: 4-이웃 평균으로 블러(방향성 단순화)
            out[py * PW + px] = (c + n + s + e + w) / 5;
          } else {
            out[py * PW + px] = c;
          }
        } else {
          out[py * PW + px] = c;
        }
      }
    }

    // 큰 캔버스로 nearest 확대
    const W = canvas.width;
    const H = canvas.height;
    const img = ctx.createImageData(W, H);
    const data = img.data;
    for (let dy = 0; dy < H; dy++) {
      const py = Math.floor((dy / H) * PH);
      for (let dx = 0; dx < W; dx++) {
        const px = Math.floor((dx / W) * PW);
        const g = Math.round(out[py * PW + px] * 255);
        const idx = (dy * W + dx) * 4;
        data[idx] = g;
        data[idx + 1] = g;
        data[idx + 2] = g;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const label = VIEW_OPTIONS.find((o) => o.value === view)?.label ?? '';
    ctx.fillStyle = 'rgba(127,127,127,0.85)';
    ctx.fillRect(6, 6, ctx.measureText(label).width + 14, 20);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(label, 12, 20);
    void col;
  };

  useEffect(() => {
    const redraw = () => draw(ref.current);
    redraw();
    const ro = new ResizeObserver(redraw);
    if (ref.current) ro.observe(ref.current);
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, thresh]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        style={{
          width: '100%',
          maxWidth: 340,
          borderRadius: 10,
          border: '1px solid var(--border)',
          display: 'block',
          margin: '0 auto',
        }}
      />
      <ControlPanel>
        <SelectControl label="표시" value={view} options={VIEW_OPTIONS} onChange={setView} />
        <Slider label="에지 임계값" value={thresh} min={0.02} max={0.4} step={0.01} onChange={setThresh} format={(v) => v.toFixed(2)} />
      </ControlPanel>
      <figcaption>
        FXAA는 기하 정보를 전혀 모릅니다. 이미 완성된 이미지의 <strong>픽셀 휘도(luma) 대비</strong>만
        보고 에지를 찾습니다 — "검출된 에지" 보기에서 이웃과 밝기차가 임계값을 넘는 픽셀이 에지로
        잡히는 걸 보세요. 그런 다음 그 에지를 따라서만 살짝 블러를 먹여 계단을 흐립니다("FXAA 결과").
        장점은 압도적인 저비용과 범용성(디퍼드·투명 무관, 모바일 친화)입니다. 대가는 디테일까지 약간
        흐려지고, 색만 보므로 진짜 에지와 무늬를 헷갈릴 수 있다는 점입니다. SMAA는 같은 후처리이되
        더 똑똑한 패턴 검출로 이 흐림을 줄입니다.
      </figcaption>
    </figure>
  );
}
