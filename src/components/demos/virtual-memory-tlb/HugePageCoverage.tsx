import { useEffect, useRef } from 'react';

// 정적 도식 — huge page가 TLB reach(한 엔트리가 덮는 메모리)를 어떻게 키우는지.
// 같은 64 엔트리로 4KB / 2MB / 1GB 페이지가 덮는 총량을 막대(로그 직관)와 수치로.

const W = 360;
const H = 270;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

const N = 64; // 엔트리 수(예시)
const ROWS = [
  { name: '4 KB 페이지', per: '4 KB', total: '256 KB', frac: 0.04 },
  { name: '2 MB 페이지', per: '2 MB', total: '128 MB', frac: 0.42 },
  { name: '1 GB 페이지', per: '1 GB', total: '64 GB', frac: 1.0 },
];

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const surface = cssVar('--surface', '#fff');
  const green = '#2e9e5b';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(`같은 TLB(엔트리 ${N}개)가 덮는 메모리`, 14, 18);
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('= TLB reach (막대는 로그 직관)', 14, 36);

  const x0 = 14;
  const barX = 120;
  const barMax = W - 14 - barX;
  const top = 58;
  const rowH = 58;
  for (let i = 0; i < ROWS.length; i++) {
    const y = top + i * rowH;
    ctx.textAlign = 'left';
    ctx.fillStyle = text;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(ROWS[i].name, x0, y + 12);
    ctx.fillStyle = muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('엔트리당 ' + ROWS[i].per, x0, y + 28);

    // 막대
    const w = Math.max(8, barMax * ROWS[i].frac);
    ctx.fillStyle = i === ROWS.length - 1 ? green : accent;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(barX, y, w, 26, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 총량 라벨
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = w > 70 ? 'right' : 'left';
    if (w > 70) ctx.fillText(ROWS[i].total, barX + w - 8, y + 13);
    else {
      ctx.fillStyle = text;
      ctx.fillText(ROWS[i].total, barX + w + 8, y + 13);
    }
  }

  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('큰 페이지 = 엔트리당 더 넓은 영역 → TLB miss 급감', W / 2, H - 12);
}

export default function HugePageCoverage() {
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
        TLB 엔트리 하나는 <em>페이지 하나</em>의 변환만 담습니다. 그래서 TLB가 한 번에 덮는 총
        메모리(<strong>TLB reach</strong>)는 "엔트리 수 × 페이지 크기"입니다. 페이지를 4 KB에서
        2 MB(×512), 1 GB(×512²)로 키우면 같은 엔트리 수로 덮는 영역이 그만큼 넓어져 TLB miss가
        급감합니다 — 큰 working set(DB·과학계산·가상화)에서 **huge/large page**를 쓰는 핵심 이유입니다.
        (예시 엔트리 수 {N}는 도식용 — 실제 L1/L2 TLB는 페이지 크기별로 별도 자원입니다.)
      </figcaption>
    </figure>
  );
}
