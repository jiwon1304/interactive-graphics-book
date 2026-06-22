import { useEffect, useRef } from 'react';

// 정적 도식 — 프리엠션 granularity와 지연.
// GPU는 임의 지점에서 멈추지 못하고 정의된 "경계"에서만 컨텍스트를 전환한다.
// 대표로 픽셀 경계 granularity에서 고우선 B가 45% 지점에 도착하는 상황을 그린다 — B는 다음 경계까지
// 기다린다(빨강) 뒤 끼어든다(초록). 경계가 거칠수록(DMA 버퍼) 더 오래 기다리는 것은 figcaption.

const W = 380;
const H = 200;
const BOUNDARIES = 16; // 픽셀 경계
const ARRIVE_PCT = 0.45;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  ctx.clearRect(0, 0, W, H);
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  const x0 = 12;
  const x1 = W - 12;
  const span = x1 - x0;
  const aY = 44;
  const bY = 110;
  const barH = 30;
  const aLen = span * 0.78;
  const arriveX = x0 + aLen * ARRIVE_PCT;

  const n = BOUNDARIES;
  const seg = aLen / n;
  const nextBoundary = x0 + Math.ceil((arriveX - x0) / seg) * seg;
  const latency = nextBoundary - arriveX;

  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText('컨텍스트 A (긴 작업)', x0, aY - 14);
  ctx.fillText('컨텍스트 B (고우선)', x0, bY - 14);

  // A 작업 + 경계 격자
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(x0, aY, aLen, barH);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  for (let k = 1; k < n; k++) {
    const x = x0 + k * seg;
    ctx.beginPath();
    ctx.moveTo(x, aY);
    ctx.lineTo(x, aY + barH);
    ctx.stroke();
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0, aY, aLen, barH);

  // B 도착 표시
  ctx.strokeStyle = text;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(arriveX, aY - 6);
  ctx.lineTo(arriveX, bY + barH + 6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = text;
  ctx.textAlign = 'center';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('B 도착', arriveX, bY + barH + 16);

  // B 대기(red) → 경계에서 끼어듦(green)
  ctx.fillStyle = '#e0564b';
  ctx.globalAlpha = 0.5;
  ctx.fillRect(arriveX, bY, Math.max(1, latency), barH);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2e9e5b';
  ctx.fillRect(nextBoundary, bY, 64, barH);
  ctx.fillStyle = '#fff';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('B 실행', nextBoundary + 32, bY + barH / 2);

  // 통계
  ctx.fillStyle = text;
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  const latPct = ((latency / aLen) * 100).toFixed(0);
  ctx.fillText(`픽셀 경계 — 프리엠션 지연 ≈ 작업의 ${latPct}%`, x0, H - 14);
}

export default function PreemptionTimeline() {
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
        고우선 컨텍스트 B가 도착해도, GPU는 A를 <em>다음 경계</em>에서만 멈출 수 있어 그때까지
        기다립니다(빨강). 여기 그린 <strong>픽셀 경계</strong> granularity에서는 경계가 촘촘해 B가 거의
        바로 끼어듭니다(초록). granularity가 거칠수록 — "프리미티브 경계", 더 나아가 경계가 하나뿐인{' '}
        <strong>DMA 버퍼 경계</strong>(가장 거침) — B가 A가 거의 끝날 때까지 기다리고, "명령 경계"(가장
        세밀)면 거의 즉시 끼어듭니다. VR 타임워프처럼 지연이 중요한 작업이 세밀한 프리엠션을 원하는
        이유입니다 — 단, 세밀할수록 컨텍스트 전환(레지스터·공유 메모리를 DRAM에 저장/복원)이 잦아
        오버헤드도 늡니다.
      </figcaption>
    </figure>
  );
}
