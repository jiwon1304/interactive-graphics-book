import { useEffect, useRef } from 'react';

// 정적 도식 — MESI 4상태 전이 다이어그램.
// 한 캐시라인이 한 코어의 캐시 안에서 가질 수 있는 4상태(M/E/S/I)와, 로컬 read/write 및
// 버스 이벤트(BusRd/BusRdX)에 의한 전이를 그린다. 라벨은 캔버스에 최소만, 설명은 figcaption.

const W = 360;
const H = 340;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

type Node = { id: string; x: number; y: number; label: string; sub: string };

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  const surface = cssVar('--surface', '#fff');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';

  const r = 34;
  const nodes: Node[] = [
    { id: 'M', x: 100, y: 70, label: 'M', sub: 'Modified' },
    { id: 'E', x: 260, y: 70, label: 'E', sub: 'Exclusive' },
    { id: 'S', x: 260, y: 250, label: 'S', sub: 'Shared' },
    { id: 'I', x: 100, y: 250, label: 'I', sub: 'Invalid' },
  ];
  const at = (id: string) => nodes.find((n) => n.id === id)!;

  // 화살표 헬퍼
  function arrow(ax: number, ay: number, bx: number, by: number, label: string, dashed: boolean, color: string) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    // 노드 경계에서 시작/끝
    const sx = ax + ux * r;
    const sy = ay + uy * r;
    const ex = bx - ux * r;
    const ey = by - uy * r;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.6;
    ctx.setLineDash(dashed ? [4, 3] : []);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    // arrowhead
    const ah = 7;
    const a1 = Math.atan2(uy, ux) + Math.PI - 0.4;
    const a2 = Math.atan2(uy, ux) + Math.PI + 0.4;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex + Math.cos(a1) * ah, ey + Math.sin(a1) * ah);
    ctx.lineTo(ex + Math.cos(a2) * ah, ey + Math.sin(a2) * ah);
    ctx.closePath();
    ctx.fill();
    // label (중간점, 약간 옆으로)
    const mx = (sx + ex) / 2 - uy * 11;
    const my = (sy + ey) / 2 + ux * 11;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(label, mx, my);
  }

  // 전이 (실선 = 로컬 read/write, 점선 = 버스 스누프로 인한 invalidate/강등)
  arrow(at('I').x, at('I').y, at('E').x, at('E').y, 'rd(유일)', false, accent); // I->E
  arrow(at('I').x + 16, at('I').y - 8, at('S').x - 16, at('S').y + 8, 'rd(공유)', false, accent); // I->S
  arrow(at('E').x, at('E').y, at('M').x, at('M').y, 'write', false, text); // E->M
  arrow(at('S').x - 8, at('S').y - 8, at('M').x + 8, at('M').y + 8, 'write/BusRdX', false, text); // S->M (대각)
  arrow(at('M').x, at('M').y, at('I').x, at('I').y, 'BusRdX', true, muted); // M->I
  arrow(at('S').x + 10, at('S').y, at('I').x + 10, at('I').y, 'BusRdX', true, muted); // S->I (아래쪽)
  arrow(at('M').x + 30, at('M').y + 8, at('S').x - 30, at('S').y - 8, 'BusRd', true, muted); // M->S (writeback)

  // 노드 그리기 (화살표 위에)
  const stateColor: Record<string, string> = {
    M: '#e0564b',
    E: accent,
    S: '#2e9e5b',
    I: muted,
  };
  for (const n of nodes) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = surface;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = stateColor[n.id];
    ctx.stroke();
    ctx.fillStyle = stateColor[n.id];
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(n.label, n.x, n.y - 6);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = text;
    ctx.fillText(n.sub, n.x, n.y + 13);
  }

  // 범례
  ctx.textAlign = 'left';
  ctx.font = '11px system-ui, sans-serif';
  ctx.strokeStyle = text;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(14, H - 30);
  ctx.lineTo(40, H - 30);
  ctx.stroke();
  ctx.fillStyle = muted;
  ctx.fillText('로컬 read/write', 46, H - 30);
  ctx.strokeStyle = muted;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(14, H - 12);
  ctx.lineTo(40, H - 12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = muted;
  ctx.fillText('버스 스누프(다른 코어)', 46, H - 12);
}

export default function MesiStateMachine() {
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
        한 캐시라인이 <strong>한 코어의 캐시 안에서</strong> 가질 수 있는 네 상태와 전이입니다.
        <strong>I(Invalid)</strong>에서 읽을 때 다른 코어에 사본이 없으면 <strong>E(Exclusive)</strong>로,
        있으면 <strong>S(Shared)</strong>로 들어옵니다. E에서 쓰면 버스 트래픽 없이 곧장
        <strong>M(Modified)</strong>이 됩니다(E의 존재 이유). S에서 쓰려면 다른 사본을 죽이는
        <strong>BusRdX</strong>를 먼저 쏘아 M으로 갑니다. 점선은 <em>다른 코어의</em> 버스 요청을 스누프해
        내 라인이 강등·무효화되는 전이입니다 — 다른 코어가 읽으려 하면(BusRd) M→S로 내려오며
        writeback하고, 쓰려 하면(BusRdX) 어떤 상태든 I로 떨어집니다. (MESI에는 M에서 S를 거치지 않고
        바로 다른 코어로 데이터를 넘기는 변형도 있으나, 대표 전이만 그렸습니다.)
      </figcaption>
    </figure>
  );
}
