import { useEffect, useRef } from 'react';

// 정적 도식 — 폴링 vs 인터럽트의 CPU 시간 사용 비교.
// 같은 디바이스 이벤트(★)를 두 방식으로 처리할 때 CPU가 무엇에 시간을 쓰는지.
// 위: 폴링 — CPU가 주기적으로 상태 레지스터를 읽으며(회색 점검) 대부분 헛돈다(낭비).
// 아래: 인터럽트 — CPU는 다른 일을 하다가 이벤트 시점에만 ISR을 돌린다(거의 낭비 없음).

const W = 380;
const H = 248;

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
  const barH = 26;
  const eventT = 0.62; // 이벤트가 도착하는 정규화 시점

  // 공통 시간축 변환
  const X = (t: number) => x0 + span * t;

  // ── 폴링 (위) ───────────────────────────────────────────
  const pY = 40;
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('폴링 (CPU가 계속 점검)', x0, pY - 16);

  // 바탕 = 헛돈 점검(낭비)
  ctx.fillStyle = muted;
  ctx.globalAlpha = 0.22;
  ctx.fillRect(x0, pY, span, barH);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, pY, span, barH);

  // 주기적 점검 틱 — 대부분 "아직 없음"(빈 점검)
  const polls = 11;
  for (let k = 0; k <= polls; k++) {
    const t = k / polls;
    const x = X(t);
    const hit = t >= eventT && (k - 1) / polls < eventT; // 이벤트 직후 첫 점검
    ctx.strokeStyle = hit ? accent : muted;
    ctx.lineWidth = hit ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, pY);
    ctx.lineTo(x, pY + barH);
    ctx.stroke();
  }
  // 이벤트 도착선
  ctx.strokeStyle = text;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(X(eventT), pY - 6);
  ctx.lineTo(X(eventT), pY + barH + 6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★', X(eventT), pY - 13);

  // 라벨: 낭비
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('빈 점검 = CPU 낭비', x0 + 2, pY + barH + 14);

  // ── 인터럽트 (아래) ─────────────────────────────────────
  const iY = 150;
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('인터럽트 (이벤트 때만)', x0, iY - 16);

  // 바탕 = 유용한 다른 작업
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.18;
  ctx.fillRect(x0, iY, span, barH);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, iY, span, barH);

  // ISR 구간 (이벤트 직후 짧게)
  const isrW = span * 0.1;
  ctx.fillStyle = accent;
  ctx.fillRect(X(eventT), iY, isrW, barH);
  ctx.fillStyle = surface;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ISR', X(eventT) + isrW / 2, iY + barH / 2);

  // 이벤트 → 인터럽트 화살표
  ctx.strokeStyle = text;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(X(eventT), iY - 6);
  ctx.lineTo(X(eventT), iY + barH + 6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('★', X(eventT), iY - 13);

  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('나머지 = 유용한 작업', x0 + 2, iY + barH + 14);

  // 하단 결론
  ctx.fillStyle = text;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('같은 이벤트 ★ — 폴링은 점검에, 인터럽트는 ISR에만 시간 사용', x0, H - 14);
}

export default function PollingVsInterrupt() {
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
        디바이스가 데이터를 준비하는 이벤트(★)는 언제 올지 모릅니다. <strong>폴링</strong>은 CPU가 상태
        레지스터를 주기적으로 읽어 확인하는데, 이벤트가 드물면 대부분의 점검이 "아직 없음"으로 끝나
        그 사이의 CPU 사이클이 통째로 낭비됩니다. 점검을 자주 할수록 지연은 줄지만 낭비는 늘고, 드물게
        할수록 낭비는 줄지만 응답이 느려집니다 — 양쪽을 동시에 좋게 할 수 없습니다. <strong>인터럽트</strong>는
        디바이스가 준비됐을 때 하드웨어 신호로 CPU의 현재 흐름을 가로채므로, CPU는 그 전까지 다른 유용한
        작업을 하다가 이벤트 시점에만 짧은 ISR을 돌립니다. 반대로 이벤트가 <em>아주 잦으면</em> 인터럽트
        진입/복귀 오버헤드가 누적돼, 고속 네트워크 카드는 일시적으로 폴링으로 전환(NAPI)하는 편이 낫습니다.
      </figcaption>
    </figure>
  );
}
