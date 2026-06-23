import { useEffect, useRef } from 'react';

// 정적 도식 — 여러 코어가 같은 락(=같은 캐시라인)에 spin → 라인이 코어 사이를 M↔I로 핑퐁.
// 4코어가 한 lock 변수를 둘러싸고, 화살표로 BusRdX 트래픽(코히런시 핑퐁)을 표현.

const W = 360;
const H = 320;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const surface = cssVar('--surface', '#fff');
  const red = '#e0564b';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const cx = W / 2;
  const cy = 158;

  // 중앙: lock 변수가 든 캐시라인
  const lr = 46;
  ctx.fillStyle = surface;
  ctx.strokeStyle = red;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, lr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = red;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('lock', cx, cy - 8);
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('1개 캐시라인', cx, cy + 10);

  // 4 코어
  const cores = [
    { x: cx, y: 50, name: '코어 0', state: 'M' },
    { x: W - 56, y: cy, name: '코어 1', state: 'I' },
    { x: cx, y: H - 80, name: '코어 2', state: 'I' },
    { x: 56, y: cy, name: '코어 3', state: 'I' },
  ];
  const cw = 76;
  const ch = 46;
  for (const c of cores) {
    // 화살표 (코어 → lock, BusRdX 핑퐁)
    const dx = cx - c.x;
    const dy = cy - c.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const sx = c.x + ux * (ch / 2 + 4);
    const sy = c.y + uy * (ch / 2 + 4);
    const ex = cx - ux * (lr + 6);
    const ey = cy - uy * (lr + 6);
    ctx.strokeStyle = red;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    // 양방향 화살촉
    for (const [px, py, dirx, diry] of [
      [ex, ey, ux, uy],
      [sx, sy, -ux, -uy],
    ] as [number, number, number, number][]) {
      const a = Math.atan2(diry, dirx);
      ctx.fillStyle = red;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.cos(a - 0.4) * 7, py - Math.sin(a - 0.4) * 7);
      ctx.lineTo(px - Math.cos(a + 0.4) * 7, py - Math.sin(a + 0.4) * 7);
      ctx.closePath();
      ctx.fill();
    }
  }
  for (const c of cores) {
    ctx.fillStyle = surface;
    ctx.strokeStyle = c.state === 'M' ? '#2e9e5b' : muted;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(c.x - cw / 2, c.y - ch / 2, cw, ch, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(c.name, c.x, c.y - 7);
    ctx.fillStyle = c.state === 'M' ? '#2e9e5b' : muted;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(c.state === 'M' ? 'M (소유)' : 'I (무효)', c.x, c.y + 10);
  }

  ctx.fillStyle = red;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BusRdX 트래픽이 라인을 코어 사이로 핑퐁', cx, H - 12);
}

export default function CacheLineBounce() {
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
        여러 코어가 같은 락을 두고 경쟁하면, 그 락 변수가 든 <strong>하나의 캐시라인</strong>을
        모두가 쓰려고 합니다. CAS·`xchg` 같은 원자 쓰기는 라인을 M(Modified)로 소유해야 하므로
        매번 <strong>BusRdX</strong>가 나가 다른 코어의 사본을 I(Invalid)로 무효화합니다. 라인이 코어
        사이를 끝없이 핑퐁하며(<em>cache-line bouncing</em>) 코히런시 트래픽이 폭증합니다 — 이것이
        고경쟁 spinlock이 코어를 늘려도 안 빨라지는(오히려 느려지는) 이유입니다.
        ([`cpu-memory-hierarchy`]의 false sharing과 같은 메커니즘, 다만 여기선 <em>진짜</em> 공유입니다.)
        완화책은 backoff·라인 분리(MCS 락처럼 코어별 노드에서 spin)입니다.
      </figcaption>
    </figure>
  );
}
