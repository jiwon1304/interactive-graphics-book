import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return {
    text: cs.getPropertyValue('--text').trim() || '#222',
    muted: cs.getPropertyValue('--muted').trim() || '#888',
    border: cs.getPropertyValue('--border').trim() || '#ccc',
  };
}

// 장면 함수: 가는 사선(거리장). 1이면 선 위, 0이면 바깥. 부드러운 경계 없이 hard.
function lineCoverageHard(x: number, y: number): number {
  // 직선 y = 0.55*x + 0.1 (정규화 좌표 0..1) 근처 두께 0.012
  const d = Math.abs(y - (0.55 * x + 0.12));
  return d < 0.012 ? 1 : 0;
}

/**
 * 위젯 — SSAA(슈퍼샘플링)의 원리: 픽셀당 표본 1개 vs N×N개를 평균.
 * 왼쪽은 픽셀 중심 1표본(계단/끊김), 오른쪽은 같은 픽셀을 N×N 격자로 표본한 뒤 평균(부드러움).
 * "과정": 표본 수 N을 늘리면 경계 픽셀의 회색조가 어떻게 채워지는지 직접 본다.
 */
export default function Supersampling() {
  const oneRef = useRef<HTMLCanvasElement>(null);
  const ssRef = useRef<HTMLCanvasElement>(null);
  const [n, setN] = useState(4); // N×N supersamples

  const drawPanel = (canvas: HTMLCanvasElement | null, samplesPerAxis: number) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const col = readColors(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 170;
    const cssH = 200;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const PX = 28; // 표시할 픽셀 격자 폭(저해상도로 일부러)
    const PY = Math.round((PX * cssH) / cssW);
    const W = canvas.width;
    const H = canvas.height;
    const img = ctx.createImageData(W, H);
    const data = img.data;

    for (let dy = 0; dy < H; dy++) {
      // 어느 "큰 픽셀"에 속하는지
      const py = Math.floor((dy / H) * PY);
      for (let dx = 0; dx < W; dx++) {
        const px = Math.floor((dx / W) * PX);
        // 이 큰 픽셀을 samplesPerAxis × samplesPerAxis로 표본해 평균
        let acc = 0;
        const total = samplesPerAxis * samplesPerAxis;
        for (let sy = 0; sy < samplesPerAxis; sy++) {
          for (let sx = 0; sx < samplesPerAxis; sx++) {
            const u = (px + (sx + 0.5) / samplesPerAxis) / PX;
            const v = (py + (sy + 0.5) / samplesPerAxis) / PY;
            acc += lineCoverageHard(u, v);
          }
        }
        const cov = acc / total;
        const g = Math.round((1 - cov) * 255); // 선=검정, 배경=흰색
        const idx = (dy * W + dx) * 4;
        data[idx] = g;
        data[idx + 1] = g;
        data[idx + 2] = g;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // 라벨
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = col.text;
    ctx.font = 'bold 12px system-ui, sans-serif';
    const label = samplesPerAxis === 1 ? '1 표본/픽셀' : `${samplesPerAxis}×${samplesPerAxis} 표본/픽셀`;
    ctx.fillStyle = 'rgba(127,127,127,0.85)';
    ctx.fillRect(4, 4, ctx.measureText(label).width + 10, 18);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 9, 17);
  };

  useEffect(() => {
    const redraw = () => {
      drawPanel(oneRef.current, 1);
      drawPanel(ssRef.current, n);
    };
    redraw();
    const ro = new ResizeObserver(redraw);
    if (oneRef.current) ro.observe(oneRef.current);
    if (ssRef.current) ro.observe(ssRef.current);
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  const style = {
    width: '100%',
    borderRadius: 8,
    border: '1px solid var(--border)',
    display: 'block' as const,
    imageRendering: 'pixelated' as const,
  };

  return (
    <figure className="demo">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 380, margin: '0 auto' }}>
        <div style={{ flex: '1 1 150px', minWidth: 0 }}>
          <canvas ref={oneRef} style={style} />
        </div>
        <div style={{ flex: '1 1 150px', minWidth: 0 }}>
          <canvas ref={ssRef} style={style} />
        </div>
      </div>
      <ControlPanel>
        <Slider label="표본 수 (축당)" value={n} min={1} max={8} step={1} onChange={setN} format={(v) => `${v}×${v}`} />
      </ControlPanel>
      <figcaption>
        같은 가는 사선을 같은 저해상도 격자에 그립니다. 왼쪽은 픽셀당 표본 1개 — 픽셀 중심이 선에
        걸리느냐 마느냐로 켜고 끄니 선이 계단처럼 끊깁니다. 오른쪽은 한 픽셀 안을 N×N으로 표본해
        평균낸 것 — 경계 픽셀이 회색조로 채워져 부드러워집니다. 이게 SSAA의 본질입니다: 더 많이
        표본하고 평균. 표본 수를 키워 보세요. 품질은 최고지만, 표본마다 셰이더를 다시 돌려야 해서
        비용도 그만큼(N² 배) 듭니다 — 그래서 MSAA가 "에지에서만" 표본을 늘려 비용을 아끼려 합니다.
      </figcaption>
    </figure>
  );
}
