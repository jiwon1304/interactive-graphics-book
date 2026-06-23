import { useEffect, useRef } from 'react';

// 정적 도식 — 큐 간 의존성과 동기화.
// graphics 패스가 G-buffer를 쓰고, compute 패스가 그것을 읽는다. 둘이 다른 큐라면
// semaphore/fence로 "쓰기 완료"를 기다려야 한다. 그렇지 않으면 read-before-write 해저드.
// 왼쪽: 올바른 동기화(초록 체크). 오른쪽: 동기화 누락(빨강 해저드).

const W = 380;
const H = 280;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function lane(ctx: CanvasRenderingContext2D, baseX: number, baseY: number, ok: boolean) {
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const C = '#8b5cf6';
  const u = 30;
  const barH = 20;
  // graphics: write G-buffer
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(baseX, baseY, u * 3, barH);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('G-buf 쓰기', baseX + u * 1.5, baseY + barH / 2);

  // compute: read G-buffer
  const cy = baseY + 40;
  const cStart = ok ? baseX + u * 3 : baseX + u * 1.5; // 동기화 누락 시 일찍 시작
  ctx.fillStyle = C;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(cStart, cy, u * 3, barH);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.fillText('lighting 읽기', cStart + u * 1.5, cy + barH / 2);

  // 라벨
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('graphics', baseX, baseY - 10);
  ctx.fillText('compute', baseX, cy - 10);

  if (ok) {
    // semaphore 화살표 (쓰기 끝 → 읽기 시작)
    ctx.strokeStyle = '#2e9e5b';
    ctx.fillStyle = '#2e9e5b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(baseX + u * 3, baseY + barH);
    ctx.lineTo(cStart, cy);
    ctx.stroke();
    // 화살촉
    const a = Math.atan2(cy - (baseY + barH), cStart - (baseX + u * 3));
    ctx.beginPath();
    ctx.moveTo(cStart, cy);
    ctx.lineTo(cStart - 7 * Math.cos(a - 0.4), cy - 7 * Math.sin(a - 0.4));
    ctx.lineTo(cStart - 7 * Math.cos(a + 0.4), cy - 7 * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('semaphore', baseX + u * 3 + 6, baseY + barH + 14);
  } else {
    // 겹친 위험 구간 표시
    ctx.strokeStyle = '#e0564b';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(cStart - 2, cy - 2, (baseX + u * 3) - cStart + 4, barH + 4);
    ctx.setLineDash([]);
    ctx.fillStyle = '#e0564b';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('미완성 데이터 읽음', cStart + u * 0.75, cy + barH + 14);
  }
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('큐 간 의존성 — 동기화가 필수', 10, 16);

  // 왼쪽: 올바름
  ctx.fillStyle = '#2e9e5b';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('올바른 동기화', 14, 42);
  lane(ctx, 14, 70, true);

  // 오른쪽: 해저드
  ctx.fillStyle = '#e0564b';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('동기화 누락 → 해저드', 14, 168);
  lane(ctx, 14, 196, false);
}

export default function BarrierHazard() {
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
        오버랩은 공짜가 아닙니다. graphics 패스가 G-buffer를 <em>쓰고</em> compute 패스가 그걸
        <em> 읽는다면</em>, 둘이 다른 큐일 때 GPU는 순서를 보장하지 않습니다. 위처럼 semaphore(또는
        fence)로 "쓰기 완료"를 기다려야 안전합니다. 아래처럼 동기화를 빠뜨리면 compute가 아직 안 끝난
        G-buffer를 읽어 깨진 결과가 나옵니다(read-before-write 해저드). 또 메모리 레이아웃이 바뀌면
        (예: render target → shader read) barrier로 transition도 해줘야 합니다. async의 이득은 의존성이
        <strong> 적은</strong> 작업을 겹칠 때만 나옵니다 — 매번 기다리면 직렬과 다를 게 없습니다.
      </figcaption>
    </figure>
  );
}
