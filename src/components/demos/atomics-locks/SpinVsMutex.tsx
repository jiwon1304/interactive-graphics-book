import { useEffect, useRef } from 'react';

// 정적 도식 — spinlock vs mutex. 락이 짧게 잡힐 때 vs 길게 잡힐 때 어느 쪽이 유리한가.
// 대기 스레드: spin은 CPU를 태우며 busy-wait, mutex는 OS에 양보하고 잠듦(전환 비용).

const W = 360;
const H = 300;

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
  const red = '#e0564b';
  const green = '#2e9e5b';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  const x0 = 14;
  const lblW = 78;
  const trackX = x0 + lblW;
  const trackW = W - 14 - trackX;

  function header(y: number, title: string) {
    ctx.textAlign = 'left';
    ctx.fillStyle = text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(title, x0, y);
  }

  function track(y: number, label: string, segs: { frac: number; color: string; t: string }[]) {
    ctx.textAlign = 'left';
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(label, x0, y + 13);
    let cx = trackX;
    for (const s of segs) {
      const w = trackW * s.frac;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(cx, y, w - 2, 26, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (w > 34) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.t, cx + w / 2, y + 13);
      }
      cx += w;
    }
  }

  // 짧은 임계구역
  header(18, '임계구역이 짧을 때');
  track(30, 'spinlock', [
    { frac: 0.25, color: '#d98a2b', t: 'spin' },
    { frac: 0.75, color: green, t: '획득→작업' },
  ]);
  track(64, 'mutex', [
    { frac: 0.2, color: muted, t: 'sleep' },
    { frac: 0.35, color: red, t: '깨우기(전환)' },
    { frac: 0.45, color: green, t: '작업' },
  ]);
  ctx.fillStyle = green;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('→ spin 유리 (전환 비용 없음)', trackX, 104);

  // 구분선
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, 124);
  ctx.lineTo(W - 14, 124);
  ctx.stroke();

  // 긴 임계구역
  header(146, '임계구역이 길 때');
  track(158, 'spinlock', [
    { frac: 0.85, color: '#d98a2b', t: 'spin (CPU 낭비)' },
    { frac: 0.15, color: green, t: '작업' },
  ]);
  track(192, 'mutex', [
    { frac: 0.15, color: muted, t: 'sleep' },
    { frac: 0.7, color: accent, t: '다른 일 / CPU 양보' },
    { frac: 0.15, color: green, t: '작업' },
  ]);
  ctx.fillStyle = accent;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('→ mutex 유리 (CPU를 안 태움)', trackX, 232);

  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('실무는 둘을 섞는다: 잠깐 spin 후 양보(adaptive)', W / 2, H - 14);
}

export default function SpinVsMutex() {
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
        <strong>spinlock</strong>은 락이 풀릴 때까지 CPU를 태우며 계속 확인합니다(busy-wait) —
        임계구역이 <em>아주 짧으면</em> 잠들었다 깨어나는 비용보다 싸서 유리합니다. <strong>mutex</strong>는
        못 잡으면 OS에 CPU를 양보하고 잠들었다가(<em>blocking</em>) 락이 풀릴 때 깨어납니다 —
        깨우기에 컨텍스트 전환 비용이 들지만, 임계구역이 <em>길면</em> 그동안 CPU를 안 태워 유리합니다.
        그래서 실무 락(예: glibc adaptive mutex)은 둘을 섞어 <strong>잠깐 spin해 보고 안 되면 양보</strong>합니다.
      </figcaption>
    </figure>
  );
}
