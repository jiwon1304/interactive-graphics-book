import { useEffect, useRef } from 'react';

// 정적 도식 — CAS retry loop. atomic counter++ 을 두 스레드가 시도.
// 한쪽 CAS는 성공(expected 일치), 다른 쪽은 그 사이 값이 바뀌어 실패 → 새 값 읽고 재시도.

const W = 360;
const H = 360;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const surface = cssVar('--surface', '#fff');
  const border = cssVar('--border', '#ccc');
  const green = '#2e9e5b';
  const red = '#e0564b';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('CAS(addr, expected, new) — counter++', 14, 16);

  // 가운데 메모리 값 타임라인
  const midX = W / 2;
  const memValY = [54, 134, 214, 294];
  const memVals = ['10', '11', '11', '12'];
  // 메모리 칸
  for (let i = 0; i < memValY.length; i++) {
    const y = memValY[i];
    ctx.fillStyle = surface;
    ctx.strokeStyle = i === 2 ? red : green;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(midX - 28, y - 16, 56, 32, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(memVals[i], midX, y);
  }
  // 메모리 세로선
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(midX, 38);
  ctx.lineTo(midX, 310);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('공유 카운터', midX, 32);

  // 좌(스레드 A) / 우(스레드 B) 단계
  function step(side: 'L' | 'R', y: number, line1: string, line2: string, color: string) {
    const left = side === 'L';
    const bx = left ? 14 : midX + 40;
    const bw = midX - 40 - 14;
    ctx.fillStyle = surface;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(bx, y - 20, bw, 40, 7);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = text;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(line1, bx + 8, y - 7);
    ctx.fillStyle = color;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(line2, bx + 8, y + 9);
    // 화살표 to memory
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (left) {
      ctx.moveTo(bx + bw, y);
      ctx.lineTo(midX - 28, y);
    } else {
      ctx.moveTo(bx, y);
      ctx.lineTo(midX + 28, y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = accent;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('스레드 A', 14, 44);
  ctx.textAlign = 'right';
  ctx.fillText('스레드 B', W - 14, 44);

  step('L', 94, 'CAS(c, 10, 11)', '성공 ✓ (일치)', green);
  step('R', 174, 'CAS(c, 10, 11)', '실패 ✕ (이미 11)', red);
  step('R', 254, 'CAS(c, 11, 12)', '재시도 → 성공 ✓', green);

  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('실패하면 새 값을 읽어 다시 시도 (낙관적 동시성)', W / 2, H - 12);
}

export default function CasRetryLoop() {
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
        <strong>CAS(주소, expected, new)</strong>는 "주소의 값이 아직 <code>expected</code>면
        <code>new</code>로 바꾸고 성공, 아니면 아무것도 안 하고 실패"를 <em>하나의 원자 연산</em>으로
        합니다. 두 스레드가 동시에 카운터를 11로 올리려 하면, 먼저 도착한 A의 CAS는 성공하지만
        B의 CAS는 값이 이미 11이라 <strong>실패</strong>합니다. B는 새 값(11)을 읽어
        <code>CAS(c, 11, 12)</code>로 <strong>재시도</strong>해 성공합니다. 락 없이 "일단 해 보고
        틀리면 다시"로 진행하는 <strong>낙관적 동시성(optimistic)</strong>의 핵심 루프입니다.
      </figcaption>
    </figure>
  );
}
