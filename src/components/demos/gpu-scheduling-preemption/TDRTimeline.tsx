import { useEffect, useRef } from 'react';

// 정적 도식 — TDR(Timeout Detection and Recovery).
// 하나의 거대한 작업이 2초(기본 TdrDelay)를 넘기면 OS가 GPU가 멈췄다고 판단해 리셋하고, 앱은
// 디바이스 제거 에러를 받는다. 대표로 2.4초짜리 단일 작업이 데드라인을 넘겨 TDR이 터지는 컷을 그린다.
// 청크로 쪼개 TDR을 피하는 방법은 figcaption.

const W = 380;
const H = 170;
const TDR_MS = 2000; // Windows 기본 TdrDelay = 2초
const MAXVIEW = 3000; // 타임라인 가로 = 3초
const WORK_MS = 2400; // 단일 작업(데드라인 초과)

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const muted = cssVar('--muted', '#888');
  ctx.clearRect(0, 0, W, H);
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  const x0 = 12;
  const sx = (W - 24) / MAXVIEW;
  const y = 54;
  const barH = 34;

  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText('GPU 작업 타임라인', x0, y - 14);

  // 단일 작업(데드라인 초과 → 빨강)
  const w = Math.min(WORK_MS, MAXVIEW) * sx;
  ctx.fillStyle = '#e0564b';
  ctx.globalAlpha = 0.8;
  ctx.fillRect(x0, y, Math.max(1, w), barH);
  ctx.globalAlpha = 1;

  // 2초 TDR 데드라인
  const tx = x0 + TDR_MS * sx;
  ctx.strokeStyle = '#e0564b';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(tx, y - 8);
  ctx.lineTo(tx, y + barH + 8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#e0564b';
  ctx.textAlign = 'center';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('2초 (TdrDelay)', tx, y + barH + 16);

  // 상태
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#e0564b';
  ctx.fillText('⚠ TDR! GPU 리셋 → 디바이스 제거', x0, H - 16);
}

export default function TDRTimeline() {
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
        단일 작업(dispatch) 하나가 2초(빨간 점선, Windows 기본 <code>TdrDelay</code>)를 넘기면{' '}
        <strong>TDR</strong>이 터집니다 — OS가 GPU를 멈춘 것으로 보고 리셋하며, 앱은{' '}
        <code>DXGI_ERROR_DEVICE_HUNG</code>으로 디바이스를 잃습니다. 여기 그린 2.4초짜리 작업이 바로 그
        경우입니다. 같은 총량을 작은 <strong>청크</strong>(예: 200ms씩)로 나누면 매 경계에서 프리엠션이
        가능해져, 화면이 멈추지도 TDR이 나지도 않습니다 — 긴 컴퓨트 커널을 타일로 쪼개는 이유입니다.
      </figcaption>
    </figure>
  );
}
