import { useEffect, useMemo, useRef, useState } from 'react';
import { ControlPanel, ToggleControl } from '../../controls';
import { usePointerDrag } from './usePointerDrag';
import {
  setupCanvas,
  readTheme,
  observeTheme,
  pointerToCanvas,
  encodeBlock,
  fitEndpoints,
  quantize565,
  bc1Palette,
  rgbSub,
  rgbDot,
  rgbToHex,
  mulberry32,
  type RGB,
  type Vec2,
} from './tc2d';

// ---------------------------------------------------------------------------
// 그림 2 (인터랙티브, 드래그): BC1 블록 해부 — "압축 = 선분 위로 투영".
//
// 4×4 블록의 16색을 RGB 색공간의 점으로 뿌리고, 두 끝점 c0·c1을 잇는 선분 위에
// 4개 팔레트 점을 찍는다. 각 텍셀은 그 4점 중 가장 가까운 것으로 "투영"된다.
// 끝점을 드래그하면 선분이 움직이고, 16개 텍셀이 새 팔레트로 재양자화된다.
// 위쪽 두 4×4 그리드(원본 vs 복원)가 그 결과를 직접 보여준다.
//
// RGB는 3D지만, 이 위젯은 블록 색들이 가장 넓게 퍼진 평면(주성분 2축)에 투영해
// 2D로 그린다 — 드래그가 직관적이도록.
// ---------------------------------------------------------------------------

const N = 4; // 4×4

// 절차적 16색 블록: 한 대각선 그라데이션에 약간의 노이즈. 압축이 "잘 되는" 경우.
function makeBlock(seed: number): RGB[] {
  const rnd = mulberry32(seed);
  const a: RGB = [40, 60, 180];
  const b: RGB = [240, 200, 80];
  const out: RGB[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const t = (x + y) / (2 * (N - 1));
      const jitter = (rnd() - 0.5) * 40;
      out.push([
        Math.round(a[0] + (b[0] - a[0]) * t + jitter),
        Math.round(a[1] + (b[1] - a[1]) * t + jitter),
        Math.round(a[2] + (b[2] - a[2]) * t + jitter * 0.6),
      ]);
    }
  }
  return out;
}

// 블록 색들의 평면 기저(평균 + 두 주축)를 구해 RGB→2D 투영을 만든다.
interface Basis {
  mean: RGB;
  u: RGB; // 1축
  v: RGB; // 2축
}
function makeBasis(texels: RGB[]): Basis {
  const mean: RGB = [0, 0, 0];
  for (const t of texels) {
    mean[0] += t[0];
    mean[1] += t[1];
    mean[2] += t[2];
  }
  mean[0] /= texels.length;
  mean[1] /= texels.length;
  mean[2] /= texels.length;
  // 1축: power iteration
  let u: RGB = [1, 0.5, 0.2];
  for (let it = 0; it < 12; it++) {
    const n: RGB = [0, 0, 0];
    for (const t of texels) {
      const d = rgbSub(t, mean);
      const p = rgbDot(d, u);
      n[0] += p * d[0];
      n[1] += p * d[1];
      n[2] += p * d[2];
    }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    u = [n[0] / l, n[1] / l, n[2] / l];
  }
  // 2축: u에 직교화한 잔차의 최대 분산
  let v: RGB = [0.2, -0.5, 1];
  for (let it = 0; it < 12; it++) {
    const n: RGB = [0, 0, 0];
    for (const t of texels) {
      const d = rgbSub(t, mean);
      const pu = rgbDot(d, u);
      const res: RGB = [d[0] - pu * u[0], d[1] - pu * u[1], d[2] - pu * u[2]];
      const p = rgbDot(res, v);
      n[0] += p * res[0];
      n[1] += p * res[1];
      n[2] += p * res[2];
    }
    // u 성분 제거 후 정규화
    const pu = rgbDot(n, u);
    n[0] -= pu * u[0];
    n[1] -= pu * u[1];
    n[2] -= pu * u[2];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    v = [n[0] / l, n[1] / l, n[2] / l];
  }
  return { mean, u, v };
}

export default function BC1Block() {
  const [seed] = useState(7);
  const texels = useMemo(() => makeBlock(seed), [seed]);
  const basis = useMemo(() => makeBasis(texels), [texels]);
  const [showLines, setShowLines] = useState(true);

  // 끝점은 RGB로 들고 다닌다. 초기값은 자동 fit.
  const init = useMemo(() => fitEndpoints(texels), [texels]);
  const [c0, setC0] = useState<RGB>(init.c0);
  const [c1, setC1] = useState<RGB>(init.c1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<0 | 1 | null>(null);
  // 화면 평면 좌표계: plot 중심과 scale. 그리기와 히트테스트가 공유.
  const viewRef = useRef<{ cx: number; cy: number; s: number }>({ cx: 0, cy: 0, s: 1 });

  // RGB → 평면 좌표(픽셀): mean 기준 u·v 성분을 화면 px로.
  const project = (c: RGB): Vec2 => {
    const d = rgbSub(c, basis.mean);
    const a = rgbDot(d, basis.u);
    const b = rgbDot(d, basis.v);
    const { cx, cy, s } = viewRef.current;
    return { x: cx + a * s, y: cy - b * s };
  };
  // 평면 좌표(px) → RGB (드래그 역변환). u·v 평면에 한정, 화면 밖이면 클램프.
  const unproject = (px: Vec2): RGB => {
    const { cx, cy, s } = viewRef.current;
    const a = (px.x - cx) / s;
    const b = (cy - px.y) / s;
    const r = basis.mean[0] + a * basis.u[0] + b * basis.v[0];
    const g = basis.mean[1] + a * basis.u[1] + b * basis.v[1];
    const bl = basis.mean[2] + a * basis.u[2] + b * basis.v[2];
    return [r, g, bl];
  };

  const enc = useMemo(() => encodeBlock(texels, c0, c1), [texels, c0, c1]);
  const pal = useMemo(() => bc1Palette(c0, c1), [c0, c1]);

  usePointerDrag(canvasRef, {
    onDown: (e, canvas) => {
      const p = pointerToCanvas(e, canvas);
      const p0 = project(quantize565(c0));
      const p1 = project(quantize565(c1));
      const d0 = Math.hypot(p.x - p0.x, p.y - p0.y);
      const d1 = Math.hypot(p.x - p1.x, p.y - p1.y);
      if (Math.min(d0, d1) > 28) return false; // 끝점 근처에서만 드래그 시작
      dragRef.current = d0 <= d1 ? 0 : 1;
    },
    onMove: (e, canvas) => {
      if (dragRef.current === null) return;
      const p = pointerToCanvas(e, canvas);
      const c = unproject(p);
      if (dragRef.current === 0) setC0(c);
      else setC1(c);
    },
    onUp: () => {
      dragRef.current = null;
    },
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const run = (): void => {
      const setup = setupCanvas(canvas);
      if (!setup) return;
      const { ctx, w, h } = setup;
      const theme = readTheme(canvas);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = theme.surface;
      ctx.fillRect(0, 0, w, h);

      // 레이아웃: 왼쪽 두 4×4 그리드, 오른쪽 RGB 평면.
      const gridSize = 96;
      const cell = gridSize / N;
      const gx = 16;
      const gy0 = 24;
      const gy1 = gy0 + gridSize + 40;

      const drawGrid = (colors: RGB[], x: number, y: number, title: string) => {
        ctx.fillStyle = theme.muted;
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(title, x, y - 6);
        for (let i = 0; i < N * N; i++) {
          const cx = i % N;
          const cy = (i / N) | 0;
          ctx.fillStyle = rgbToHex(colors[i]);
          ctx.fillRect(x + cx * cell, y + cy * cell, cell - 1, cell - 1);
        }
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, gridSize, gridSize);
      };

      drawGrid(texels, gx, gy0, '원본 16색');
      drawGrid(enc.out, gx, gy1, 'BC1 복원');

      // RGB 평면 뷰
      const viewX = gx + gridSize + 36;
      const viewW = w - viewX - 16;
      const viewH = h - 28;
      const cx = viewX + viewW / 2;
      const cy = 14 + viewH / 2;
      // 화면 반경을 색 분포에 맞춰 scale 결정
      let maxR = 1;
      for (const t of texels) {
        const d = rgbSub(t, basis.mean);
        const a = rgbDot(d, basis.u);
        const b = rgbDot(d, basis.v);
        maxR = Math.max(maxR, Math.hypot(a, b));
      }
      const s = (Math.min(viewW, viewH) / 2 - 24) / Math.max(maxR, 40);
      viewRef.current = { cx, cy, s };

      // 패널 배경
      ctx.fillStyle = theme.bg;
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.fillRect(viewX, 14, viewW, viewH);
      ctx.strokeRect(viewX + 0.5, 14.5, viewW, viewH);
      ctx.fillStyle = theme.muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('RGB 색공간 (블록 주평면에 투영)', viewX + 8, 14 + 16);

      const e0 = quantize565(c0);
      const e1 = quantize565(c1);
      const p0 = project(e0);
      const p1 = project(e1);

      // 텍셀이 팔레트로 투영되는 연결선
      if (showLines) {
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1;
        for (let i = 0; i < texels.length; i++) {
          const pt = project(texels[i]);
          const pc = project(pal.colors[enc.indices[i]]);
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(pc.x, pc.y);
          ctx.stroke();
        }
      }

      // c0–c1 선분
      ctx.strokeStyle = theme.muted;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();

      // 원본 텍셀 점(작은 원, 실제 색)
      for (const t of texels) {
        const p = project(t);
        ctx.fillStyle = rgbToHex(t);
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 팔레트 4점(선분 위 큰 네모)
      for (let i = 0; i < 4; i++) {
        const p = project(pal.colors[i]);
        ctx.fillStyle = rgbToHex(pal.colors[i]);
        ctx.strokeStyle = theme.text;
        ctx.lineWidth = i < 2 ? 2 : 1; // 끝점은 굵게
        ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
        ctx.strokeRect(p.x - 6, p.y - 6, 12, 12);
      }

      // 끝점 핸들 라벨
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = theme.accent;
      ctx.textAlign = 'center';
      ctx.fillText('c0', p0.x, p0.y - 12);
      ctx.fillText('c1', p1.x, p1.y - 12);
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(canvas);
    const stop = observeTheme(run);
    return () => {
      ro.disconnect();
      stop();
    };
  }, [texels, basis, c0, c1, enc, pal, showLines]);

  const reset = (): void => {
    setC0(init.c0);
    setC1(init.c1);
  };

  return (
    <figure className="demo">
      <div
        className="demo-canvas"
        style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: 300,
            display: 'block',
            touchAction: 'none',
            cursor: 'grab',
          }}
        />
      </div>
      <ControlPanel>
        <ToggleControl label="투영선 표시" checked={showLines} onChange={setShowLines} />
        <button
          onClick={reset}
          style={{
            font: 'inherit',
            fontSize: 13,
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          자동 끝점으로 리셋
        </button>
      </ControlPanel>
      <figcaption>
        오른쪽은 이 4×4 블록의 16색을 RGB 색공간에 흩뿌린 모습이다(색이 가장 넓게 퍼진
        평면에 투영해 2D로 그렸다). 두 <strong>끝점 c0·c1</strong>(굵은 네모)을 잇는 선분
        위에 BC1은 팔레트 4색 — 끝점 둘 + 1/3·2/3 보간점 둘 — 만 둘 수 있다. 각 텍셀은 그
        4점 중 <strong>가장 가까운 것으로 투영</strong>되고(가는 연결선), 그 선택이 2비트
        인덱스다. <strong>c0·c1을 드래그</strong>해 보라: 선분이 색 분포의 긴 축을 잘 덮으면
        왼쪽 ‘BC1 복원’ 그리드가 원본과 거의 같아지고, 선분을 엉뚱한 방향으로 돌리면 16색이
        몇 개 색으로 뭉개진다. 좋은 인코더가 푸는 문제가 바로 이 ‘선분 맞추기’다.
      </figcaption>
    </figure>
  );
}
