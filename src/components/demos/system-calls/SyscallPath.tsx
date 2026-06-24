import { useEffect, useRef } from 'react';

// 정적 도식 — syscall 한 건의 user/kernel 경계 왕복.
// 두 레인(ring 3 유저 | ring 0 커널)을 좌우로 나누고, 시간은 위→아래.
// libc 래퍼 → syscall 명령(경계 넘음) → 커널 진입(swapgs·스택 전환) → 핸들러 → sysret(복귀).

const W = 360;
const H = 420;

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

  const midX = W / 2;
  const topY = 44;
  const botY = H - 30;

  // 레인 배경
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.06;
  ctx.fillRect(0, topY - 24, midX, botY - topY + 24);
  ctx.globalAlpha = 0.12;
  ctx.fillRect(midX, topY - 24, midX, botY - topY + 24);
  ctx.globalAlpha = 1;

  // 경계선
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(midX, topY - 24);
  ctx.lineTo(midX, botY);
  ctx.stroke();
  ctx.setLineDash([]);

  // 레인 제목
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = muted;
  ctx.fillText('ring 3 (유저)', midX / 2, topY - 34);
  ctx.fillStyle = text;
  ctx.fillText('ring 0 (커널)', midX + midX / 2, topY - 34);

  // 단계: {label, lane: 'u'|'k', sub}
  const ux = midX / 2;
  const kx = midX + midX / 2;
  const steps: Array<{ y: number; x: number; label: string; sub: string; cross?: 'in' | 'out'; hi?: boolean }> = [
    { y: topY, x: ux, label: 'libc 래퍼', sub: 'rax=번호, rdi/rsi/rdx…=인자' },
    { y: topY + 70, x: ux, label: 'syscall 명령', sub: 'rcx←rip, r11←rflags', cross: 'in', hi: true },
    { y: topY + 150, x: kx, label: '커널 진입(LSTAR)', sub: 'swapgs · 커널 스택 전환' },
    { y: topY + 220, x: kx, label: 'sys_xxx 핸들러', sub: '인자 검증 → 작업 수행' },
    { y: topY + 290, x: kx, label: 'sysret', sub: 'rip←rcx, rflags←r11', cross: 'out', hi: true },
    { y: topY + 350, x: ux, label: '반환값 rax 확인', sub: '음수면 errno 설정·-1' },
  ];

  const bw = 150;
  const bh = 40;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const bx = s.x - bw / 2;
    const by = s.y - bh / 2;
    ctx.fillStyle = surface;
    ctx.strokeStyle = s.hi ? accent : border;
    ctx.lineWidth = s.hi ? 2 : 1.2;
    roundRect(ctx, bx, by, bw, bh, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.label, s.x, s.y - 7);
    ctx.fillStyle = muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(s.sub, s.x, s.y + 8);
  }

  // 화살표 연결 (순서대로)
  ctx.strokeStyle = muted;
  ctx.fillStyle = muted;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < steps.length - 1; i++) {
    const a = steps[i];
    const b = steps[i + 1];
    const ay = a.y + bh / 2;
    const by = b.y - bh / 2;
    ctx.beginPath();
    if (a.x === b.x) {
      ctx.moveTo(a.x, ay);
      ctx.lineTo(b.x, by);
    } else {
      // 경계를 건너는 대각선
      ctx.moveTo(a.x, ay);
      ctx.lineTo(b.x, by);
    }
    ctx.stroke();
    // 화살촉
    const ang = Math.atan2(by - ay, b.x - a.x);
    ctx.beginPath();
    ctx.moveTo(b.x, by);
    ctx.lineTo(b.x - 6 * Math.cos(ang - 0.4), by - 6 * Math.sin(ang - 0.4));
    ctx.lineTo(b.x - 6 * Math.cos(ang + 0.4), by - 6 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
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

export default function SyscallPath() {
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
        시스템 콜 한 건이 user/kernel 경계를 왕복하는 길입니다. libc 래퍼가 번호를 <code>rax</code>에, 인자를
        <code>rdi·rsi·rdx·r10·r8·r9</code>에 넣고 <code>syscall</code> 명령을 실행하면, 하드웨어가 복귀 주소를
        <code>rcx</code>에·플래그를 <code>r11</code>에 저장하고 즉시 ring 0으로 올라가 <code>LSTAR</code> MSR이
        가리키는 커널 진입점으로 점프합니다. 인터럽트와 달리 <strong>스택은 자동 전환되지 않으므로</strong>,
        진입 코드가 <code>swapgs</code>로 per-CPU 영역을 잡고 커널 스택으로 직접 바꿉니다. 핸들러는 인자를
        검증한 뒤(유저가 넘긴 포인터는 신뢰 불가) 작업을 수행하고, <code>sysret</code>가 <code>rcx/r11</code>에서
        <code>rip/rflags</code>를 복원해 ring 3로 돌아옵니다. 반환값은 <code>rax</code>에 있고, 음수면 libc가
        <code>errno</code>를 채우고 -1을 돌려줍니다.
      </figcaption>
    </figure>
  );
}
