import { useEffect, useRef } from 'react';

// 정적 도식 — x86-64 syscall ABI 레지스터 맵.
// 호출 전: rax=번호, rdi..r9=인자(순서). 명령이 덮어쓰는 것: rcx, r11.
// 복귀 후: rax=반환값(음수=에러). 함수 호출 규약과 다른 점(4번째 인자 rcx→r10)을 강조.

const W = 360;
const H = 360;

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

  const x0 = 16;
  const rowH = 30;
  const regW = 56;
  const gap = 8;

  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = muted;
  ctx.fillText('호출 전 (유저가 채움)', x0, 24);

  const rows: Array<{ reg: string; role: string; tag?: string }> = [
    { reg: 'rax', role: 'syscall 번호', tag: 'num' },
    { reg: 'rdi', role: '인자 1' },
    { reg: 'rsi', role: '인자 2' },
    { reg: 'rdx', role: '인자 3' },
    { reg: 'r10', role: '인자 4  (함수 호출은 rcx)', tag: 'diff' },
    { reg: 'r8', role: '인자 5' },
    { reg: 'r9', role: '인자 6' },
  ];

  let y = 40;
  for (const r of rows) {
    // 레지스터 칩
    const isNum = r.tag === 'num';
    const isDiff = r.tag === 'diff';
    ctx.fillStyle = isNum ? accent : surface;
    ctx.strokeStyle = isDiff ? '#e0894b' : isNum ? accent : border;
    ctx.lineWidth = isDiff ? 2 : 1.2;
    roundRect(ctx, x0, y, regW, rowH - 6, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isNum ? surface : text;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(r.reg, x0 + regW / 2, y + (rowH - 6) / 2);

    // 역할
    ctx.fillStyle = isDiff ? '#c06b2e' : text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(r.role, x0 + regW + gap + 6, y + (rowH - 6) / 2);
    y += rowH;
  }

  // 명령 박스
  y += 6;
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.15;
  roundRect(ctx, x0, y, W - 2 * x0, 30, 7);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x0, y, W - 2 * x0, 30, 7);
  ctx.stroke();
  ctx.fillStyle = text;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('syscall', x0 + (W - 2 * x0) / 2, y + 15);
  // 부작용 라벨
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('rcx·r11 덮어씀', W - x0 - 6, y + 15);

  // 복귀 후
  y += 46;
  ctx.fillStyle = muted;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('복귀 후 (커널이 채움)', x0, y);
  y += 16;
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.2;
  roundRect(ctx, x0, y, regW, rowH - 6, 6);
  ctx.fill();
  ctx.fillStyle = surface;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('rax', x0 + regW / 2, y + (rowH - 6) / 2);
  ctx.fillStyle = text;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('반환값 (음수면 에러)', x0 + regW + gap + 6, y + (rowH - 6) / 2);
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

export default function SyscallAbi() {
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
        x86-64 Linux의 syscall 규약입니다. 번호는 <code>rax</code>, 인자는 순서대로
        <code>rdi·rsi·rdx·r10·r8·r9</code>(최대 6개)에 들어갑니다. 주황으로 표시한 <code>r10</code>이 함정인데,
        일반 함수 호출 규약은 네 번째 인자에 <code>rcx</code>를 쓰지만 syscall 명령은 복귀 주소를
        <code>rcx</code>에 저장하면서 덮어쓰기 때문에, 네 번째 인자는 <code>r10</code>으로 옮겨 전달합니다
        (<code>r11</code>도 플래그 저장에 쓰여 망가집니다). 명령이 끝나면 반환값이 <code>rax</code>에 담기고,
        값이 음수면 에러 코드입니다 — libc 래퍼가 이를 양수 <code>errno</code>로 바꾸고 -1을 반환합니다.
        이 "번호 + 레지스터 + 반환" 약속이 곧 ABI이며, 한번 정해지면 바이너리 호환을 위해 거의 바뀌지
        않습니다.
      </figcaption>
    </figure>
  );
}
