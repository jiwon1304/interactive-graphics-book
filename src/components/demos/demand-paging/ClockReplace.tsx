import { useEffect, useRef } from 'react';

// 정적 도식 — clock(second-chance) 페이지 교체.
// 원형으로 배치된 프레임들, 각 프레임에 use bit(0/1). hand가 한 위치를 가리킴.
// 대표 상태: hand가 use=1 프레임들을 지나며 0으로 내리다(second chance), 처음 만난 use=0을 victim으로.
// 한 컷이므로 "hand가 막 victim을 찾은 순간"을 그린다.

const W = 340;
const H = 360;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

// 시계 방향 프레임. use=1이면 hand가 0으로 내리고 지나감(노랑), 첫 use=0이 victim(빨강).
// hand는 인덱스 5(victim 직전까지 돌아 victim을 가리킴)를 가리킨다고 표현.
const FRAMES = [
  { page: 'P3', use: 1 }, // 0 chance준 뒤 0
  { page: 'P7', use: 1 },
  { page: 'P1', use: 1 },
  { page: 'P9', use: 0, victim: true },
  { page: 'P2', use: 0 },
  { page: 'P5', use: 1 },
  { page: 'P8', use: 1 },
  { page: 'P4', use: 0 },
];

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  const surface = cssVar('--surface', '#fff');
  const red = '#e0564b';
  const amber = '#d98a26';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // 제목
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('clock (second-chance) — victim 찾기', W / 2, 18);

  const cx = W / 2;
  const cy = 188;
  const R = 118;
  const n = FRAMES.length;
  const victimIdx = FRAMES.findIndex((f) => f.victim);
  // hand가 victim을 가리키도록
  const handAngle = (-Math.PI / 2) + (victimIdx / n) * Math.PI * 2;

  // hand
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(handAngle) * (R - 34), cy + Math.sin(handAngle) * (R - 34));
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  // 프레임 노드
  FRAMES.forEach((f, i) => {
    const a = (-Math.PI / 2) + (i / n) * Math.PI * 2;
    const fx = cx + Math.cos(a) * R;
    const fy = cy + Math.sin(a) * R;
    const r = 26;
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    if (f.victim) {
      ctx.fillStyle = 'rgba(224,86,75,0.18)';
      ctx.strokeStyle = red;
      ctx.lineWidth = 2.5;
    } else if (f.use === 1) {
      ctx.fillStyle = 'rgba(217,138,38,0.14)';
      ctx.strokeStyle = amber;
      ctx.lineWidth = 1.5;
    } else {
      ctx.fillStyle = surface;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.5;
    }
    ctx.fill();
    ctx.stroke();
    // page 이름
    ctx.fillStyle = text;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(f.page, fx, fy - 6);
    // use bit
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = f.use === 1 ? amber : muted;
    ctx.fillText('use=' + f.use, fx, fy + 9);
  });

  // 범례
  const ly = H - 30;
  ctx.textAlign = 'left';
  ctx.font = '11px system-ui, sans-serif';
  const dot = (x: number, color: string, label: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, ly, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = text;
    ctx.fillText(label, x + 10, ly);
    return x + 12 + ctx.measureText(label).width + 14;
  };
  let lx = 14;
  lx = dot(lx, amber, 'use=1 → second chance(0으로)');
  dot(lx, red, 'use=0 → victim');
}

export default function ClockReplace() {
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
        clock(second-chance) 알고리즘이 victim을 고르는 순간입니다. 프레임들을 원형으로 두고 hand(바늘)가
        돈다고 생각합니다. 각 프레임의 <strong>use bit</strong>는 그 페이지를 접근할 때마다 hardware가 1로
        세웁니다. hand가 use=1 프레임을 만나면 쫓아내지 않고 use를 0으로 내린 뒤 지나갑니다(노랑, "한 번
        더 기회"). 처음 만나는 use=0 프레임(빨강)이 victim입니다. 이렇게 하면 "오래 안 쓰인 페이지"를
        대략 골라내 — 정확한 LRU를 흉내(approximation) 냅니다. 정확한 LRU는 접근마다 순서를 갱신해야 해
        비싸지만, clock은 비트 하나와 한 바퀴 스캔으로 끝나 실제 커널이 선호합니다(여기에 dirty bit를 더한
        변형, 2-handed clock 등 변종이 많습니다).
      </figcaption>
    </figure>
  );
}
