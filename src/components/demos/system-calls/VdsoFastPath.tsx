import { useEffect, useRef } from 'react';

// 정적 도식 — 같은 clock_gettime 호출의 두 경로.
// 위: 일반 syscall — ring 0 진입/복귀(+ KPTI면 페이지테이블 전환)로 비싸다.
// 아래: vDSO 빠른 경로 — 유저공간에서 공유 메모리 + rdtsc만 읽어 경계를 아예 안 넘는다.
// 막대 길이로 상대 비용(자릿수)을 보여준다.

const W = 380;
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
  const surface = cssVar('--surface', '#fff');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  const x0 = 14;
  const x1 = W - 14;
  const span = x1 - x0;
  const barH = 28;

  // 위: 일반 syscall — 단계별 누적 막대
  const sY = 48;
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('일반 syscall 경로', x0, sY - 16);

  // 세그먼트: [진입, 핸들러, 복귀, (KPTI TLB)]
  const segs = [
    { w: 0.22, label: '진입', c: accent, a: 0.85 },
    { w: 0.3, label: '핸들러', c: accent, a: 0.45 },
    { w: 0.22, label: '복귀', c: accent, a: 0.85 },
    { w: 0.26, label: 'KPTI 전환', c: muted, a: 0.5 },
  ];
  let cx = x0;
  for (const s of segs) {
    const w = span * s.w;
    ctx.fillStyle = s.c;
    ctx.globalAlpha = s.a;
    ctx.fillRect(cx, sY, w, barH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = surface;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx, sY, w, barH);
    if (w > 40) {
      ctx.fillStyle = surface;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.label, cx + w / 2, sY + barH / 2);
    }
    cx += w;
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x0, sY, span, barH);
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ring 0 왕복 — 수십~수백 cycle (KPTI면 더)', x0, sY + barH + 14);

  // 아래: vDSO — 아주 짧은 막대
  const vY = 150;
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('vDSO 빠른 경로', x0, vY - 16);

  const vW = span * 0.16;
  ctx.fillStyle = accent;
  ctx.fillRect(x0, vY, vW, barH);
  ctx.fillStyle = surface;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('rdtsc', x0 + vW / 2, vY + barH / 2);
  // 나머지 = 경계 안 넘음(빈 칸)
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(x0, vY, span, barH);
  ctx.setLineDash([]);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x0, vY, vW, barH);

  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('경계 안 넘음 — 공유 메모리 읽기 + rdtsc', x0, vY + barH + 14);

  // 결론
  ctx.fillStyle = text;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('같은 clock_gettime — vDSO는 ring 0 비용을 통째로 건너뜀', x0, H - 14);
}

export default function VdsoFastPath() {
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
        막대 길이는 상대 비용(자릿수)입니다. <code>clock_gettime</code> 같은 read-only 콜을 매번 진짜
        syscall로 처리하면, 작업 자체(현재 시각 읽기)는 사소한데 <strong>ring 0 진입과 복귀</strong>가 비용의
        대부분을 차지합니다 — Meltdown 완화(KPTI)가 켜져 모드 전환마다 페이지테이블을 갈아끼우면 더 무거워집니다.
        그래서 커널은 자주 쓰는 read-only 콜을 <strong>vDSO</strong>(커널이 모든 프로세스의 주소공간에
        매핑하는 작은 공유 라이브러리)에 구현해 둡니다. vDSO 코드는 커널이 비동기로 갱신하는 공유 메모리에서
        시각 기준값을 읽고 <code>rdtsc</code>로 보정해 답을 만들므로, <em>경계를 한 번도 넘지 않습니다</em>.
        그래서 빠릅니다. 단, 상태를 바꾸는 콜(write·open 등)은 반드시 커널이 처리해야 하므로 vDSO로 못
        만듭니다.
      </figcaption>
    </figure>
  );
}
