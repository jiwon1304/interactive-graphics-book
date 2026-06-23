import { useEffect, useRef } from 'react';

// 정적 도식 — 메모리 모델 스펙트럼(강함 → 약함)과 각 모델이 허용하는 재정렬 종류.
// Sequential Consistency → x86 TSO → ARM/POWER weak. 행=모델, 열=4가지 재정렬 허용 여부.

const W = 360;
const H = 250;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

const ROWS = [
  { name: 'Sequential', sub: '(이론적 기준)', cells: [false, false, false, false] },
  { name: 'x86 TSO', sub: 'Intel/AMD', cells: [false, false, true, false] },
  { name: 'ARM / POWER', sub: 'weak', cells: [true, true, true, true] },
];
const COLS = ['L→L', 'L→S', 'S→L', 'S→S'];

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  const surface = cssVar('--surface', '#fff');
  const red = '#e0564b';
  const green = '#2e9e5b';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('허용되는 재정렬 (강함 → 약함)', 14, 18);

  const labelW = 118;
  const gridX = 14 + labelW;
  const gridW = W - 14 - gridX;
  const colW = gridW / COLS.length;
  const headY = 42;
  const rowH = 50;
  const top = 56;

  // 열 헤더
  ctx.textAlign = 'center';
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = muted;
  for (let j = 0; j < COLS.length; j++) {
    ctx.fillText(COLS[j], gridX + colW * (j + 0.5), headY);
  }

  for (let i = 0; i < ROWS.length; i++) {
    const y = top + i * rowH;
    // 행 라벨
    ctx.textAlign = 'left';
    ctx.fillStyle = text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(ROWS[i].name, 14, y + rowH / 2 - 7);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(ROWS[i].sub, 14, y + rowH / 2 + 10);

    for (let j = 0; j < COLS.length; j++) {
      const cx = gridX + colW * j;
      const allowed = ROWS[i].cells[j];
      ctx.fillStyle = surface;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(cx + 3, y + 5, colW - 6, rowH - 10, 6);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillStyle = allowed ? green : red;
      ctx.fillText(allowed ? '✓' : '✕', cx + colW / 2, y + rowH / 2);
    }
  }

  // 화살표(강→약)
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(8, top + 6);
  ctx.lineTo(8, top + ROWS.length * rowH - 6);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(8, top + ROWS.length * rowH - 6);
  ctx.lineTo(5, top + ROWS.length * rowH - 13);
  ctx.lineTo(11, top + ROWS.length * rowH - 13);
  ctx.closePath();
  ctx.fill();

  // 캡션
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('L=load, S=store. ✓=하드웨어가 순서를 바꿔도 됨', 14, H - 12);
}

export default function MemoryModelLadder() {
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
        메모리 모델은 하드웨어가 <em>같은 코어 안의</em> 메모리 연산을 얼마나 자유롭게 재정렬해도 되는지를
        정합니다. <strong>Sequential Consistency</strong>는 아무것도 안 바꾸는 이론적 기준,
        <strong>x86 TSO</strong>는 오직 <code>store→load</code>(앞 store가 store buffer에 머무는 동안 뒤
        load가 추월) 하나만 허용합니다. <strong>ARM/POWER</strong>는 거의 모든 짝을 재정렬할 수 있는
        <em>weak</em> 모델입니다 — 그래서 x86에서 멀쩡하던 lock-free 코드가 ARM으로 옮기면 깨지곤 합니다.
        해법은 같습니다: 필요한 곳에 fence(또는 acquire/release)를 명시해 순서를 못 박는 것.
      </figcaption>
    </figure>
  );
}
