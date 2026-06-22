import { useEffect, useRef, useState } from 'react';
import { ControlPanel, SelectControl, ToggleControl } from '../../controls';
import type { SelectOption } from '../../controls';

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

type Rate = '1x1' | '2x1' | '2x2' | '2x4' | '4x4';

const RATES: ReadonlyArray<SelectOption<Rate>> = [
  { value: '1x1', label: '1×1 (full)' },
  { value: '2x1', label: '2×1' },
  { value: '2x2', label: '2×2' },
  { value: '2x4', label: '2×4' },
  { value: '4x4', label: '4×4' },
];

function rateDims(r: Rate): [number, number] {
  switch (r) {
    case '1x1':
      return [1, 1];
    case '2x1':
      return [2, 1];
    case '2x2':
      return [2, 2];
    case '2x4':
      return [2, 4];
    case '4x4':
      return [4, 4];
  }
}

/**
 * 한 장면을 셰이딩 rate별로 보여준다. 핵심: fragment shader는 coarse pixel(NxM 블록)당
 * "한 번"만 실행되고 그 결과가 블록 전체로 broadcast된다는 과정을 드러낸다.
 * 표면은 한 광원에 대한 specular highlight가 섞인 그라데이션(고주파/저주파가 공존).
 * 블록 좌상단 한 점을 "셰이딩한 픽셀"로 찍고(점), 나머지에 복사한다.
 */
export default function CoarsePixel() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [rate, setRate] = useState<Rate>('2x2');
  const [showShadedPoints, setShowShadedPoints] = useState(true);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 440;
      const cssH = 280;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const W = canvas.width;
      const H = canvas.height;
      const [bx, by] = rateDims(rate);
      // 블록 픽셀 크기(디바이스 픽셀). 블록 격자가 또렷하게 보이도록 넉넉히.
      const cell = Math.round(10 * dpr);
      const blockW = bx * cell;
      const blockH = by * cell;

      // 화면공간 셰이딩 함수: 저주파 그라데이션 + specular 점 하이라이트(고주파).
      const shade = (u: number, v: number) => {
        // u,v in [0,1]
        const base = 0.18 + 0.5 * v + 0.15 * Math.sin(u * 6.0);
        // 광원 하이라이트(작고 날카로움 → 고주파)
        const du = u - 0.66;
        const dv = v - 0.34;
        const d2 = du * du + dv * dv;
        const spec = Math.exp(-d2 * 140.0);
        const t = Math.min(1, Math.max(0, base + spec));
        const r = Math.round(255 * (0.25 + 0.7 * t));
        const g = Math.round(255 * (0.35 + 0.6 * t * t));
        const b = Math.round(255 * (0.55 + 0.45 * Math.sqrt(t)));
        return [r, g, b] as const;
      };

      const img = ctx.createImageData(W, H);
      const data = img.data;
      for (let yb = 0; yb < H; yb += blockH) {
        for (let xb = 0; xb < W; xb += blockW) {
          // 블록(=coarse pixel)당 한 번 셰이딩: 블록 중심을 샘플.
          const cu = (xb + blockW / 2) / W;
          const cv = (yb + blockH / 2) / H;
          const [r, g, b] = shade(cu, cv);
          for (let y = yb; y < Math.min(yb + blockH, H); y++) {
            for (let x = xb; x < Math.min(xb + blockW, W); x++) {
              const idx = (y * W + x) * 4;
              data[idx] = r;
              data[idx + 1] = g;
              data[idx + 2] = b;
              data[idx + 3] = 255;
            }
          }
        }
      }
      ctx.putImageData(img, 0, 0);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // coarse pixel 격자선(rate가 1x1이 아닐 때만).
      if (rate !== '1x1') {
        ctx.strokeStyle = col.border;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        const bw = (bx * cell) / dpr;
        const bh = (by * cell) / dpr;
        ctx.beginPath();
        for (let x = 0; x <= cssW; x += bw) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, cssH);
        }
        for (let y = 0; y <= cssH; y += bh) {
          ctx.moveTo(0, y);
          ctx.lineTo(cssW, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // "실제로 셰이딩된 픽셀"을 블록 중심에 점으로.
      if (showShadedPoints && rate !== '1x1') {
        const bw = (bx * cell) / dpr;
        const bh = (by * cell) / dpr;
        ctx.fillStyle = col.text;
        for (let y = bh / 2; y < cssH; y += bh) {
          for (let x = bw / 2; x < cssW; x += bw) {
            ctx.beginPath();
            ctx.arc(x, y, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 라벨 박스(셰이딩 호출 횟수).
      const blocksX = Math.ceil(cssW / ((bx * cell) / dpr));
      const blocksY = Math.ceil(cssH / ((by * cell) / dpr));
      const invocations = blocksX * blocksY;
      const full = Math.ceil(cssW / (cell / dpr)) * Math.ceil(cssH / (cell / dpr));
      const pct = Math.round((invocations / full) * 100);
      const label = rate === '1x1' ? 'shade 100%' : `shade ≈ ${pct}%`;
      ctx.fillStyle = col.surface;
      ctx.fillRect(6, 6, 96, 22);
      ctx.strokeStyle = col.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(6, 6, 96, 22);
      ctx.fillStyle = col.text;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(label, 12, 21);
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
  }, [rate, showShadedPoints]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        style={{
          width: '100%',
          borderRadius: 10,
          border: '1px solid var(--border)',
          touchAction: 'none',
          display: 'block',
        }}
      />
      <ControlPanel>
        <SelectControl label="shading rate" value={rate} options={RATES} onChange={setRate} />
        <ToggleControl label="셰이딩된 픽셀 표시" checked={showShadedPoints} onChange={setShowShadedPoints} />
      </ControlPanel>
      <figcaption>
        같은 표면을 shading rate만 바꿔 그립니다. <strong>점 하나가 fragment shader가 실제로
        실행된 픽셀</strong>이고, 그 색이 coarse pixel(N×M 블록) 전체로 복사됩니다. 2×2면 블록당
        한 번 — 셰이딩 호출이 1/4로 줍니다. 오른쪽 위 specular 하이라이트(고주파)는 rate를 올릴수록
        뭉개지지만, 왼쪽 아래 매끈한 그라데이션(저주파)은 4×4에서도 거의 그대로죠. 이게 VRS의
        전부입니다: <strong>화면에서 디테일이 적은 곳만 굵게 셰이딩</strong>.
      </figcaption>
    </figure>
  );
}
