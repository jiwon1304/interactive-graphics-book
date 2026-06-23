import { useEffect, useRef } from 'react';

// 정적 도식 — 한 메시(삼각형 그물)를 meshlet(작은 삼각형 묶음)으로 분할.
// 같은 meshlet에 속한 삼각형을 같은 색으로 칠하고, 각 meshlet의 경계(클러스터)를 보여준다.
// 핵심 메시지: 큰 메시는 vertex/triangle 한도(~64 verts / ~126 tris)에 맞춘 작은 덩어리로 미리 쪼개진다.

const W = 380;
const H = 300;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

// 결정론적 색 팔레트 (테마 무관, 충분히 구분되는 hue)
const HUES = [12, 40, 90, 150, 200, 260, 320, 350];

// 시드형 정점 그리드 → 삼각형 → meshlet 그룹.
// 6x5 격자의 정점을 약간 흔들어 불규칙한 그물을 만든다.
function buildMesh() {
  const cols = 6;
  const rows = 5;
  const mx = 24;
  const my = 40;
  const gw = W - mx * 2;
  const gh = H - my * 2;
  // 간단 시드 PRNG
  let s = 1337;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const pts: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jx = (rnd() - 0.5) * (gw / cols) * 0.5;
      const jy = (rnd() - 0.5) * (gh / rows) * 0.5;
      pts.push({
        x: mx + (c / (cols - 1)) * gw + jx,
        y: my + (r / (rows - 1)) * gh + jy,
      });
    }
  }
  const idx = (r: number, c: number) => r * cols + c;
  // 각 셀을 두 삼각형으로. meshlet = 인접한 2x2 셀 묶음(대략).
  type Tri = [number, number, number];
  const meshlets: Tri[][] = [];
  for (let r = 0; r < rows - 1; r += 2) {
    for (let c = 0; c < cols - 1; c += 2) {
      const group: Tri[] = [];
      for (let dr = 0; dr < 2 && r + dr < rows - 1; dr++) {
        for (let dc = 0; dc < 2 && c + dc < cols - 1; dc++) {
          const a = idx(r + dr, c + dc);
          const b = idx(r + dr, c + dc + 1);
          const d = idx(r + dr + 1, c + dc);
          const e = idx(r + dr + 1, c + dc + 1);
          group.push([a, b, d]);
          group.push([b, e, d]);
        }
      }
      meshlets.push(group);
    }
  }
  return { pts, meshlets };
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  ctx.clearRect(0, 0, W, H);
  ctx.font = '13px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  const { pts, meshlets } = buildMesh();

  // meshlet마다 채움 + 경계
  meshlets.forEach((tris, i) => {
    const hue = HUES[i % HUES.length];
    const fill = `hsla(${hue}, 65%, ${isDark ? 45 : 62}%, 0.55)`;
    const edge = `hsla(${hue}, 70%, ${isDark ? 70 : 35}%, 1)`;
    ctx.fillStyle = fill;
    for (const t of tris) {
      ctx.beginPath();
      ctx.moveTo(pts[t[0]].x, pts[t[0]].y);
      ctx.lineTo(pts[t[1]].x, pts[t[1]].y);
      ctx.lineTo(pts[t[2]].x, pts[t[2]].y);
      ctx.closePath();
      ctx.fill();
    }
    // 내부 삼각형 에지(옅게)
    ctx.strokeStyle = edge;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 0.75;
    for (const t of tris) {
      ctx.beginPath();
      ctx.moveTo(pts[t[0]].x, pts[t[0]].y);
      ctx.lineTo(pts[t[1]].x, pts[t[1]].y);
      ctx.lineTo(pts[t[2]].x, pts[t[2]].y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // meshlet 라벨 (무게중심)
    let cx = 0, cy = 0, n = 0;
    for (const t of tris) for (const v of t) { cx += pts[v].x; cy += pts[v].y; n++; }
    cx /= n; cy /= n;
    ctx.fillStyle = isDark ? '#fff' : '#111';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`M${i}`, cx, cy);
  });

  // 정점 점
  ctx.fillStyle = text;
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 제목 + 범례
  ctx.fillStyle = text;
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText('한 메시 → meshlet들', 12, 18);
  ctx.fillStyle = muted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('각 색 = 한 meshlet (정점·삼각형 한도 안)', 12, H - 14);
}

export default function MeshletPartition() {
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
        한 메시를 작은 삼각형 묶음 <strong>meshlet</strong>으로 미리 쪼갠 모습입니다. 각 meshlet은 정점
        몇십 개·삼각형 백여 개 한도(NVIDIA 권장 64 verts / 126 tris) 안에 들도록 나뉘며, 인접한
        삼각형끼리 묶어 정점을 공유합니다(같은 meshlet 안의 삼각형이 변·정점을 재사용). mesh shader는
        이 meshlet 하나를 워크그룹 하나가 통째로 맡아 GPU에서 직접 정점·인덱스를 뱉습니다. 전통
        파이프라인의 Input Assembler가 인덱스 버퍼를 읽어 정점을 한 개씩 끌어오던 일을, meshlet
        단위 일괄 처리로 바꾼 것이 핵심입니다.
      </figcaption>
    </figure>
  );
}
