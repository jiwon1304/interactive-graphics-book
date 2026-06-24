import { useEffect, useRef } from 'react';

// 정적 도식 — copy-on-write 전/후.
// 위: fork 직후. 부모·자식 PTE가 같은 물리 프레임을 read-only로 공유.
// 아래: 자식이 쓰기 시도 → 그 페이지만 복제, 자식 PTE가 새 프레임을 가리키고 둘 다 writable 복원.
// 세로 스택(위 before / 아래 after).

const W = 360;
const H = 430;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
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

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  const surface = cssVar('--surface', '#fff');
  const green = '#2e9e5b';
  const red = '#e0564b';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1.5;

  const pte = (x: number, y: number, label: string, ro: boolean, stroke: string) => {
    const w = 110;
    const h = 30;
    roundRect(ctx, x, y, w, h, 7);
    ctx.fillStyle = surface;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 8, y + h / 2);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = ro ? red : green;
    ctx.textAlign = 'right';
    ctx.fillText(ro ? 'RO' : 'RW', x + w - 7, y + h / 2);
    return { cx: x + w, cy: y + h / 2, lx: x, ly: y + h / 2 };
  };

  const frame = (x: number, y: number, label: string, stroke: string) => {
    const w = 96;
    const h = 34;
    roundRect(ctx, x, y, w, h, 7);
    ctx.fillStyle = 'rgba(59,130,246,0.1)';
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2);
    return { lx: x, ly: y + h / 2 };
  };

  const link = (x1: number, y1: number, x2: number, y2: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x2, y2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  };

  const heading = (y: number, t: string, color: string) => {
    ctx.fillStyle = color;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(t, 14, y);
  };

  // ── 위: fork 직후 (공유) ──
  heading(20, 'fork 직후 — 한 프레임을 read-only로 공유', accent);
  const pp1 = pte(14, 40, '부모 PTE', true, border);
  const cc1 = pte(14, 80, '자식 PTE', true, border);
  const f1 = frame(236, 56, '프레임 X', accent);
  link(pp1.cx, pp1.cy, f1.lx, f1.ly, muted);
  link(cc1.cx, cc1.cy, f1.lx, f1.ly, muted);
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('복사 안 함', (pp1.cx + f1.lx) / 2, 36);

  // 구분선
  ctx.strokeStyle = border;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(14, 140);
  ctx.lineTo(W - 14, 140);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 가운데: 쓰기 trap ──
  ctx.fillStyle = red;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('자식이 쓰기 시도 → RO 페이지라 page fault(trap)', W / 2, 162);

  // ── 아래: 복제 후 ──
  heading(196, '쓰기 후 — 그 페이지만 복제(COW)', green);
  const pp2 = pte(14, 222, '부모 PTE', false, border);
  const cc2 = pte(14, 300, '자식 PTE', false, green);
  const fX = frame(236, 214, '프레임 X', accent);
  const fY = frame(236, 300, '프레임 Y (복사본)', green);
  link(pp2.cx, pp2.cy, fX.lx, fX.ly, muted);
  link(cc2.cx, cc2.cy, fY.lx, fY.ly, green);
  ctx.fillStyle = green;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('내용 복사', (cc2.cx + fY.lx) / 2, 286);

  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('이제 둘 다 RW — 서로의 쓰기가 안 보임', 14, 350);
  ctx.fillText('건드리지 않은 나머지 페이지는 계속 공유', 14, 368);
}

export default function CowDiagram() {
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
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{ width: '100%', maxWidth: W, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}
        />
      </div>
      <figcaption>
        copy-on-write의 전/후입니다. fork는 자식의 주소 공간을 통째로 복사하지 않습니다 — 부모와 자식의
        PTE가 같은 물리 프레임을 가리키게 하고, 양쪽 모두 read-only(RO)로 표시만 합니다. 둘 중 하나가 그
        페이지에 <strong>쓰려는 순간</strong> RO 위반으로 page fault가 나고(이게 minor fault입니다),
        커널이 그 페이지 하나만 복제해 쓰는 쪽 PTE를 새 프레임으로 돌린 뒤 둘 다 RW로 복원합니다. 그래서
        fork 직후 거의 즉시 exec하는 흔한 패턴에서 실제 복사는 거의 일어나지 않고, 건드린 페이지에 대해서만
        비용을 냅니다. Linux의 익명 메모리 첫 읽기가 공용 zero page에 RO로 매핑됐다가 첫 쓰기 때 실제
        프레임을 받는 것도 같은 메커니즘입니다.
      </figcaption>
    </figure>
  );
}
