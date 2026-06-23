import { useEffect, useRef } from 'react';

// 정적 도식 — 컨텍스트 전환 비용의 두 부분: 직접(보이는) vs 간접(숨은).
// 직접: 레지스터 저장/복원 + TLB flush (~1µs 자릿수).
// 간접: 새 프로세스가 캐시/TLB를 다시 채우는 동안의 미스 비용 (보통 더 큼, 수천~수만 cycle).

const W = 360;
const H = 250;

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
  ctx.textBaseline = 'middle';

  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('컨텍스트 전환 비용 — 보이는 것보다 큼', 14, 18);

  const x0 = 14;
  const x1 = W - 14;
  const span = x1 - x0;
  const barY = 40;
  const barH = 40;

  // 직접(작음) + 간접(큼) 스택 막대 (폭 = 비용, 도식 비율)
  const directFrac = 0.22;
  const directW = span * directFrac;
  const indirectW = span - directW;

  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x0, barY, directW, barH);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0, barY, directW, barH);
  ctx.fillStyle = text;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('직접', x0 + directW / 2, barY + barH / 2);

  ctx.fillStyle = '#e0564b';
  ctx.globalAlpha = 0.4;
  ctx.fillRect(x0 + directW, barY, indirectW, barH);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#e0564b';
  ctx.strokeRect(x0 + directW, barY, indirectW, barH);
  ctx.fillStyle = text;
  ctx.fillText('간접 (캐시·TLB 다시 채우기)', x0 + directW + indirectW / 2, barY + barH / 2);

  // 설명 두 박스
  function box(y: number, title: string, lines: string[], col: string) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.08;
    ctx.fillRect(x0, y, span, 56);
    ctx.globalAlpha = 1;
    ctx.strokeRect(x0, y, span, 56);
    // 색 점
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x0 + 12, y + 14, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, x0 + 24, y + 14);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    lines.forEach((ln, i) => ctx.fillText(ln, x0 + 12, y + 32 + i * 15));
  }

  box(barY + barH + 14, '직접 ≈ 1µs 자릿수', [
    '레지스터 저장/복원 · 스케줄러 실행 · TLB flush.',
    '코어 고정 시 측정 ~1.2–1.5µs (대표값).',
  ], accent);

  box(barY + barH + 14 + 64, '간접 — 보통 더 큼', [
    '새 프로세스가 캐시·TLB를 다시 채우는 동안의',
    '미스. working set 클수록 ↑ (수천~수만 cycle).',
  ], '#e0564b');
}

export default function SwitchCostBreakdown() {
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
        컨텍스트 전환의 비용은 두 부분입니다. <strong>직접 비용</strong>은 레지스터를 저장/복원하고
        스케줄러를 돌리고 TLB를 비우는 것 — 코어에 고정해 측정하면 대략 <strong>1µs 자릿수</strong>
        (한 출처는 1.2–1.5µs)입니다. 하지만 더 큰 건 <strong>간접 비용</strong>: 새로 들어온 프로세스가
        캐시와 TLB를 다시 채우는 동안 겪는 미스입니다. working set이 클수록 이 "캐시 오염" 비용이
        커져, 전체 체감 비용은 수천~수만 cycle에 이를 수 있습니다(환경 의존, 자릿수로만).
      </figcaption>
    </figure>
  );
}
