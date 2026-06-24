import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, SelectControl, type SelectOption } from '../../controls';

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return {
    text: cs.getPropertyValue('--text').trim() || '#222',
    muted: cs.getPropertyValue('--muted').trim() || '#888',
    border: cs.getPropertyValue('--border').trim() || '#ccc',
    accent: cs.getPropertyValue('--accent').trim() || '#4f9dde',
    surface: cs.getPropertyValue('--surface').trim() || '#fff',
    bg: cs.getPropertyValue('--bg').trim() || '#fff',
  };
}

type Mode = '1x' | '4x';
const MODE_OPTIONS: ReadonlyArray<SelectOption<Mode>> = [
  { value: '1x', label: '1× (안티에일리어싱 없음)' },
  { value: '4x', label: '4× MSAA' },
];

// 픽셀 중심 기준 4x 회전 그리드(rotated grid) 표본 위치(상대 [-0.5,0.5]).
const SAMPLES_4X: ReadonlyArray<[number, number]> = [
  [-0.125, -0.375],
  [0.375, -0.125],
  [-0.375, 0.125],
  [0.125, 0.375],
];
const SAMPLES_1X: ReadonlyArray<[number, number]> = [[0, 0]];

/**
 * 위젯 — MSAA coverage 메커니즘.
 * 한 픽셀을 크게 확대해 격자로 그리고, 그 위를 가로지르는 삼각형 에지를 슬라이더로 움직인다.
 * 각 픽셀마다 표본점(1개 또는 4개)이 에지 안쪽(삼각형)에 몇 개 들어갔는지 세어 그만큼만 색을 섞는다.
 * "과정": 셰이더는 픽셀당 한 번 실행되지만, 그 색이 coverage 비율로 서브샘플에 분배되는 과정을 본다.
 */
export default function MSAACoverage() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('4x');
  const [edge, setEdge] = useState(0.35); // 에지의 절편(0..1, 대각선 위치)

  const draw = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const col = readColors(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 360;
    const cssH = 320;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const GRID = 6; // 6×6 픽셀
    const margin = 14;
    const size = Math.min(cssW - margin * 2, cssH - margin * 2 - 24);
    const ox = (cssW - size) / 2;
    const oy = 8;
    const cell = size / GRID;

    const samples = mode === '4x' ? SAMPLES_4X : SAMPLES_1X;
    // 에지: 좌상→우하 방향의 직선. inside = below the line.
    // 그리드 좌표 [0,GRID] 기준. 직선: y = m*x + b. 화면이 좁아 기울기 고정(1.1).
    const m = 1.1;
    const b = (edge - 0.5) * GRID * 1.4;
    const inside = (gx: number, gy: number) => gy > m * gx + b;

    const triFill = '#4f9dde';

    // 각 픽셀 그리기
    for (let py = 0; py < GRID; py++) {
      for (let px = 0; px < GRID; px++) {
        // 픽셀 중심의 그리드 좌표
        const cxGrid = px + 0.5;
        const cyGrid = py + 0.5;
        let covered = 0;
        for (const [sx, sy] of samples) {
          if (inside(cxGrid + sx, cyGrid + sy)) covered++;
        }
        const cov = covered / samples.length;
        const x = ox + px * cell;
        const y = oy + py * cell;
        // 픽셀 색 = 배경 위에 삼각형색을 coverage만큼 섞음
        if (cov > 0) {
          ctx.fillStyle = triFill;
          ctx.globalAlpha = cov;
          ctx.fillRect(x, y, cell, cell);
          ctx.globalAlpha = 1;
        }
        // 격자선
        ctx.strokeStyle = col.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cell, cell);
        // 표본점
        for (const [sx, sy] of samples) {
          const psx = ox + (cxGrid + sx) * cell;
          const psy = oy + (cyGrid + sy) * cell;
          const hit = inside(cxGrid + sx, cyGrid + sy);
          ctx.fillStyle = hit ? '#fff' : col.muted;
          ctx.strokeStyle = hit ? triFill : col.muted;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(psx, psy, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // 진짜 에지(연속) 선 — 빨강
    ctx.strokeStyle = '#e0734f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    // 화면 좌표로 직선 두 점
    const gxToX = (gx: number) => ox + gx * cell;
    const gyToY = (gy: number) => oy + gy * cell;
    ctx.moveTo(gxToX(0), gyToY(m * 0 + b));
    ctx.lineTo(gxToX(GRID), gyToY(m * GRID + b));
    ctx.stroke();

    // 캡션 라벨
    ctx.fillStyle = col.text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      mode === '4x' ? '픽셀당 표본 4개 → coverage로 부드럽게' : '픽셀당 표본 1개 → 계단',
      cssW / 2,
      oy + size + 18,
    );
    ctx.textAlign = 'left';
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
  }, [mode, edge]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        style={{
          width: '100%',
          maxWidth: 360,
          borderRadius: 10,
          border: '1px solid var(--border)',
          display: 'block',
          margin: '0 auto',
        }}
      />
      <ControlPanel>
        <SelectControl label="샘플링" value={mode} options={MODE_OPTIONS} onChange={setMode} />
        <Slider label="에지 위치" value={edge} min={0} max={1} step={0.01} onChange={setEdge} format={(v) => v.toFixed(2)} />
      </ControlPanel>
      <figcaption>
        한 픽셀을 격자 한 칸으로 크게 본 그림입니다. 빨간 선이 삼각형의 진짜 에지이고, 각 칸의 점은
        <strong>표본점</strong>입니다. 1×에서는 픽셀 중심 한 점만 보므로 칸은 "삼각형 안이거나
        밖이거나" 둘 중 하나 — 계단이 생깁니다. 4× MSAA는 한 픽셀에 표본 4개를 두고, 그중 삼각형
        안에 든 개수(coverage)만큼만 색을 섞습니다(½이면 50% 투명). 에지 위치 슬라이더를 움직이며
        경계 칸의 밝기가 <em>연속적으로</em> 변하는 걸 보세요. 핵심: 픽셀 셰이더는 칸마다 여전히
        한 번만 실행되고, 그 색이 coverage 비율로 분배될 뿐입니다.
      </figcaption>
    </figure>
  );
}
