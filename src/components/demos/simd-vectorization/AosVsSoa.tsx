import { useEffect, useRef } from 'react';

// 정적 도식 — AoS vs SoA 메모리 레이아웃이 SIMD load에 미치는 영향.
// 입자 4개의 {x,y,z}를 두 방식으로 배치하고, "x만 4개 모으기"가
// AoS에서는 stride-3 gather, SoA에서는 연속 1 load가 됨을 보인다.

const W = 360;
const H = 320;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

const COLS = { x: '#3b82f6', y: '#e0a23b', z: '#8b8b8b' } as const;
const N = 4; // 입자 수

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const border = cssVar('--border', '#ccc');

  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  const cell = 26;
  const gap = 2;
  const x0 = 14;

  function slot(x: number, y: number, label: string, color: string, picked: boolean) {
    ctx.fillStyle = color;
    ctx.globalAlpha = picked ? 0.55 : 0.16;
    ctx.fillRect(x, y, cell, cell);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = picked ? text : border;
    ctx.lineWidth = picked ? 2 : 1;
    ctx.strokeRect(x, y, cell, cell);
    ctx.fillStyle = text;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + cell / 2, y + cell / 2 + 1);
  }

  // --- AoS: x0 y0 z0 x1 y1 z1 ... (x만 stride 3) ---
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('AoS — struct { x, y, z } 배열', x0, 18);

  const aY = 34;
  const fields = ['x', 'y', 'z'] as const;
  let idx = 0;
  for (let p = 0; p < N; p++) {
    for (const f of fields) {
      const x = x0 + idx * (cell + gap);
      slot(x, aY, f + p, COLS[f], f === 'x');
      idx++;
    }
  }
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('"x 4개 모으기" → stride-3 gather (흩어져 있음)', x0, aY + cell + 16);

  // --- SoA: 모든 x, 모든 y, 모든 z ---
  const sY = aY + cell + 44;
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('SoA — { x[], y[], z[] }', x0, sY - 8);

  const rowGap = 6;
  fields.forEach((f, r) => {
    const y = sY + 10 + r * (cell + rowGap);
    for (let p = 0; p < N; p++) {
      const x = x0 + p * (cell + gap);
      slot(x, y, f + p, COLS[f], f === 'x');
    }
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(f + '[]', x0 + N * (cell + gap) + 6, y + cell / 2);
  });

  const lastY = sY + 10 + fields.length * (cell + rowGap);
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('"x 4개 모으기" → 연속 1 load (한 줄 통째로)', x0, lastY + 8);

  // 강조: 파랑 = x lane
  ctx.fillStyle = text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('진한 칸 = SIMD가 한 번에 채우려는 x lane', x0, H - 12);
}

export default function AosVsSoa() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const run = () => draw(ctx);
    run();
    const obs = new MutationObserver(run);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas ref={ref} width={W} height={H} style={{ width: '100%', maxWidth: W, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }} />
      </div>
      <figcaption>
        같은 입자 4개를 두 방식으로 메모리에 둡니다. <strong>AoS</strong>(struct 배열)는 한 입자의
        x·y·z가 붙어 있어, "모든 입자의 x"만 모으려면 세 칸씩 건너뛰며(stride-3) 흩어진 값을 모아야
        합니다 — 이것이 <strong>gather</strong>입니다. <strong>SoA</strong>(필드별 배열)는 x들이 한 줄로
        연속이라 SIMD 레지스터를 <strong>연속 load 한 번</strong>으로 채웁니다. 그래서 같은 필드를
        병렬 처리하는 SIMD/벡터화에는 SoA가 거의 항상 유리합니다(둘을 섞은 AoSoA도 있습니다).
      </figcaption>
    </figure>
  );
}
