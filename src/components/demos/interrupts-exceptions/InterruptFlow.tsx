import { useEffect, useRef } from 'react';

// 정적 도식 — 하드웨어 인터럽트 한 건의 생애:
// 디바이스 IRQ → (I/O APIC/MSI) → LAPIC가 CPU에 벡터 전달 → CPU가 컨텍스트 저장 →
// IDT[vector]로 점프 → ISR 실행 → iret로 복원/복귀.
// 세로 스택(모바일). 각 단계는 짧은 박스, 설명은 figcaption.

const W = 360;
const H = 430;

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

  const cx = W / 2;
  const bw = 300;
  const bx = cx - bw / 2;
  const bh = 42;
  const gap = 16;
  let y = 22;

  const steps: Array<{ title: string; sub: string; hi?: boolean }> = [
    { title: '디바이스: IRQ 발생', sub: '레거시 라인 또는 MSI 메시지' },
    { title: 'I/O APIC / MSI → LAPIC', sub: '벡터 번호로 라우팅' },
    { title: 'CPU: 현재 명령 경계에서 가로챔', sub: 'RFLAGS·RIP·CS 등 자동 저장' },
    { title: 'IDT[vector] 조회', sub: '게이트 → ISR 주소·권한', hi: true },
    { title: 'ISR 실행 (top half)', sub: '짧게: 확인·하드웨어 정지·bottom half 예약' },
    { title: 'iret — 저장한 상태 복원', sub: '중단된 곳으로 복귀' },
  ];

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    // 박스
    ctx.fillStyle = surface;
    ctx.strokeStyle = s.hi ? accent : border;
    ctx.lineWidth = s.hi ? 2 : 1.2;
    roundRect(ctx, bx, y, bw, bh, 8);
    ctx.fill();
    ctx.stroke();

    // 단계 번호 원
    ctx.fillStyle = s.hi ? accent : muted;
    ctx.beginPath();
    ctx.arc(bx + 18, y + bh / 2, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = surface;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), bx + 18, y + bh / 2 + 0.5);

    // 텍스트
    ctx.textAlign = 'left';
    ctx.fillStyle = text;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(s.title, bx + 38, y + 15);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(s.sub, bx + 38, y + 31);

    // 화살표
    if (i < steps.length - 1) {
      const ay = y + bh;
      ctx.strokeStyle = muted;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, ay);
      ctx.lineTo(cx, ay + gap);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 4, ay + gap - 5);
      ctx.lineTo(cx, ay + gap);
      ctx.lineTo(cx + 4, ay + gap - 5);
      ctx.stroke();
    }
    y += bh + gap;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function InterruptFlow() {
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
        하드웨어 인터럽트 한 건의 경로입니다. 디바이스가 IRQ를 올리면(레거시 라인 또는 MSI 메시지 쓰기),
        I/O APIC나 MSI 경로가 그것을 <strong>벡터 번호</strong>로 바꿔 CPU의 LAPIC로 보냅니다. CPU는 현재
        명령을 끝낸 직후의 경계에서 흐름을 가로채고, 복귀에 필요한 RFLAGS·RIP·CS를 자동으로 스택에 저장한
        뒤 <strong>IDT[vector]</strong>의 게이트 디스크립터가 가리키는 ISR로 점프합니다 — 벡터 번호가
        곧 IDT의 인덱스입니다. ISR(top half)은 가능한 한 짧게: 인터럽트를 확인하고, 시간이 걸리는 후처리는
        bottom half로 미룹니다. 마지막으로 <code>iret</code>가 저장해 둔 상태를 복원해 중단됐던 명령으로
        정확히 되돌아갑니다. 인터럽트가 ISR을 시작하기까지의 시간이 <em>인터럽트 지연(latency)</em>입니다.
      </figcaption>
    </figure>
  );
}
