import { useEffect, useRef } from 'react';

// 정적 도식 — A100을 MIG로 공간 분할.
// A100: compute 7 슬라이스 + memory 8 슬라이스(40GB). 대표 분할:
// 7×(1g.5gb), 또는 2×(3g.20gb), 또는 1×(7g.40gb) 등. 여기선 한 그림에 세 구성을 세로로 비교.

const W = 360;
const H = 300;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const palette = ['#3b82f6', '#2e9e5b', '#e08a2b', '#a855c7', '#e0564b', '#0ea5b7', '#7c83ff'];
  const x0 = 14;
  const barW = W - 28;

  // 한 행 = 한 분할 구성. parts: 각 인스턴스의 compute 슬라이스 수(합 = 7).
  const rows: { label: string; parts: { c: number; mem: number; name: string }[] }[] = [
    { label: '7 × 1g.5gb (최대 분할)', parts: Array.from({ length: 7 }, (_, i) => ({ c: 1, mem: 5, name: `${i + 1}` })) },
    { label: '2 × 3g.20gb + 1 × 1g.5gb', parts: [{ c: 3, mem: 20, name: '3g' }, { c: 3, mem: 20, name: '3g' }, { c: 1, mem: 5, name: '1g' }] },
    { label: '1 × 7g.40gb (분할 안 함)', parts: [{ c: 7, mem: 40, name: '7g.40gb · 풀 GPU' }] },
  ];

  const rowH = 50;
  const rowGap = 34;
  const top = 30;

  ctx.fillStyle = muted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('A100 (compute 7 슬라이스 · 40GB) 를 나누는 세 가지 예', x0, 16);

  rows.forEach((row, ri) => {
    const y = top + ri * (rowH + rowGap);
    ctx.fillStyle = text;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(row.label, x0, y - 8);

    // 7 슬라이스 폭에 비례해 박스 그리기
    let cx = x0;
    row.parts.forEach((p, pi) => {
      const w = (p.c / 7) * barW;
      const col = palette[(ri * 3 + pi) % palette.length];
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.22;
      roundRect(ctx, cx + 1, y, w - 2, rowH, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      roundRect(ctx, cx + 1, y, w - 2, rowH, 6);
      ctx.stroke();
      ctx.fillStyle = text;
      ctx.textAlign = 'center';
      if (w > 60) {
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(p.name, cx + w / 2, y + 18);
        ctx.fillStyle = muted;
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(`${p.c}g · ${p.mem}GB`, cx + w / 2, y + 34);
      } else {
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(p.name, cx + w / 2, y + rowH / 2);
      }
      cx += w;
    });

    // 슬라이스 경계 눈금
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    for (let k = 1; k < 7; k++) {
      const gx = x0 + (k / 7) * barW;
      ctx.beginPath();
      ctx.moveTo(gx, y + rowH + 4);
      ctx.lineTo(gx, y + rowH + 9);
      ctx.stroke();
    }
  });
}

export default function MigSlices() {
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
        <strong>MIG는 한 GPU를 물리적으로 잘라</strong> 여러 인스턴스로 나눕니다. A100은 compute 7
        슬라이스와 40GB를 가져, 최대 <strong>7개의 1g.5gb</strong>로 잘게 쪼개거나, 큰 일에는 3g.20gb를
        두어 굵게 묶거나, 안 나누고 7g.40gb 한 덩이로 쓸 수 있습니다. 각 조각은 전용 SM·메모리·캐시는
        물론 NVDEC 같은 엔진까지 자기 몫을 받습니다(정확한 개수는 GPU 세대마다 다릅니다).
      </figcaption>
    </figure>
  );
}
