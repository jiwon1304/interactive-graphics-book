import { useEffect, useMemo, useRef, useState } from 'react';
import { ControlPanel, ToggleControl, Slider } from '../../controls';
import { usePointerDrag } from '../raymarching-sdf/usePointerDrag';

const W = 560;
const H = 360;

interface Tri {
  p: [number, number][]; // 3 정점
  min: [number, number];
  max: [number, number];
  c: [number, number]; // centroid
}
interface AABB {
  min: [number, number];
  max: [number, number];
}
interface Node {
  box: AABB;
  left?: Node;
  right?: Node;
  prims?: number[];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function makeScene(seed: number, n: number): Tri[] {
  const r = rng(seed);
  const tris: Tri[] = [];
  for (let i = 0; i < n; i++) {
    const cx = 80 + r() * (W - 160);
    const cy = 30 + r() * (H - 60);
    const s = 14 + r() * 16;
    const a = r() * Math.PI * 2;
    const p: [number, number][] = [0, 1, 2].map((k) => {
      const ang = a + (k * 2 * Math.PI) / 3;
      return [cx + Math.cos(ang) * s, cy + Math.sin(ang) * s] as [number, number];
    });
    const min: [number, number] = [Math.min(p[0][0], p[1][0], p[2][0]), Math.min(p[0][1], p[1][1], p[2][1])];
    const max: [number, number] = [Math.max(p[0][0], p[1][0], p[2][0]), Math.max(p[0][1], p[1][1], p[2][1])];
    tris.push({ p, min, max, c: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2] });
  }
  return tris;
}

function boundsOf(tris: Tri[], idx: number[]): AABB {
  const min: [number, number] = [Infinity, Infinity];
  const max: [number, number] = [-Infinity, -Infinity];
  for (const i of idx) {
    for (let a = 0; a < 2; a++) {
      min[a] = Math.min(min[a], tris[i].min[a]);
      max[a] = Math.max(max[a], tris[i].max[a]);
    }
  }
  return { min, max };
}
const area = (b: AABB) => Math.max(0, b.max[0] - b.min[0]) * Math.max(0, b.max[1] - b.min[1]);

function build(tris: Tri[], idx: number[], sah: boolean): Node {
  const box = boundsOf(tris, idx);
  if (idx.length <= 2) return { box, prims: idx };
  // 분할 축 = centroid 범위가 가장 긴 축
  const cmin = [Infinity, Infinity];
  const cmax = [-Infinity, -Infinity];
  for (const i of idx)
    for (let a = 0; a < 2; a++) {
      cmin[a] = Math.min(cmin[a], tris[i].c[a]);
      cmax[a] = Math.max(cmax[a], tris[i].c[a]);
    }
  const axis = cmax[0] - cmin[0] >= cmax[1] - cmin[1] ? 0 : 1;
  const sorted = [...idx].sort((a, b) => tris[a].c[axis] - tris[b].c[axis]);

  let splitAt = sorted.length >> 1; // median
  if (sah) {
    // SAH: 후보 분할들 중 area(L)*nL + area(R)*nR 최소
    let best = Infinity;
    for (let s = 1; s < sorted.length; s++) {
      const L = boundsOf(tris, sorted.slice(0, s));
      const R = boundsOf(tris, sorted.slice(s));
      const cost = area(L) * s + area(R) * (sorted.length - s);
      if (cost < best) {
        best = cost;
        splitAt = s;
      }
    }
  }
  return {
    box,
    left: build(tris, sorted.slice(0, splitAt), sah),
    right: build(tris, sorted.slice(splitAt), sah),
  };
}

// 2D ray-AABB 슬랩. ray = O + t*d, t>=0. 교차 시 진입 t, 아니면 null.
function rayBox(O: [number, number], d: [number, number], b: AABB): number | null {
  let tmin = 0;
  let tmax = Infinity;
  for (let a = 0; a < 2; a++) {
    const inv = 1 / d[a];
    let t1 = (b.min[a] - O[a]) * inv;
    let t2 = (b.max[a] - O[a]) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

// ray vs 선분(에지). 교차 t(>0) 또는 null.
function raySeg(O: [number, number], d: [number, number], a: [number, number], b: [number, number]): number | null {
  const e: [number, number] = [b[0] - a[0], b[1] - a[1]];
  const denom = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(denom) < 1e-9) return null;
  const ax = a[0] - O[0];
  const ay = a[1] - O[1];
  const t = (ax * e[1] - ay * e[0]) / denom;
  const u = (ax * d[1] - ay * d[0]) / denom;
  if (t > 1e-6 && u >= 0 && u <= 1) return t;
  return null;
}
function rayTri(O: [number, number], d: [number, number], tr: Tri): number | null {
  let best: number | null = null;
  for (let k = 0; k < 3; k++) {
    const t = raySeg(O, d, tr.p[k], tr.p[(k + 1) % 3]);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

interface Stats {
  boxTests: number;
  triTests: number;
  visited: Node[];
  hitT: number | null;
  hitTri: number;
}

function traverse(root: Node, tris: Tri[], O: [number, number], d: [number, number], ordered: boolean): Stats {
  const st: Stats = { boxTests: 0, triTests: 0, visited: [], hitT: null, hitTri: -1 };
  const stack: Node[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    st.boxTests++;
    const tb = rayBox(O, d, n.box);
    if (tb === null) continue;
    if (st.hitT !== null && tb > st.hitT) continue; // 이미 더 가까운 히트가 있으면 가지치기
    st.visited.push(n);
    if (n.prims) {
      for (const i of n.prims) {
        st.triTests++;
        const t = rayTri(O, d, tris[i]);
        if (t !== null && (st.hitT === null || t < st.hitT)) {
          st.hitT = t;
          st.hitTri = i;
        }
      }
    } else if (n.left && n.right) {
      if (ordered) {
        const tl = rayBox(O, d, n.left.box) ?? Infinity;
        const tr = rayBox(O, d, n.right.box) ?? Infinity;
        // 가까운 자식을 먼저 처리하려면 스택엔 먼 것을 먼저 push
        if (tl <= tr) {
          stack.push(n.right, n.left);
        } else {
          stack.push(n.left, n.right);
        }
      } else {
        stack.push(n.right, n.left);
      }
    }
  }
  return st;
}

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

export default function BVHTraversal() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [seed, setSeed] = useState(7);
  const [count, setCount] = useState(24);
  const [ordered, setOrdered] = useState(true);
  const [sah, setSah] = useState(true);
  const target = useRef<[number, number]>([W - 60, H / 2 + 40]);
  const O: [number, number] = [24, H / 2];

  const tris = useMemo(() => makeScene(seed, count), [seed, count]);
  const root = useMemo(() => build(tris, tris.map((_, i) => i), sah), [tris, sah]);

  function toLocal(e: PointerEvent, canvas: HTMLCanvasElement): [number, number] {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  }
  usePointerDrag(ref, {
    onDown: (e, c) => {
      target.current = toLocal(e, c);
      render();
    },
    onMove: (e, c) => {
      target.current = toLocal(e, c);
      render();
    },
  });

  function render() {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dir: [number, number] = [target.current[0] - O[0], target.current[1] - O[1]];
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    const d: [number, number] = [dir[0] / dl, dir[1] / dl];
    const st = traverse(root, tris, O, d, ordered);
    const visited = new Set(st.visited);

    const muted = cssVar('--muted', '#888');
    const accent = cssVar('--accent', '#3b82f6');
    const text = cssVar('--text', '#222');
    ctx.clearRect(0, 0, W, H);

    // BVH 박스 (방문한 노드만 강조)
    const drawNode = (n: Node, depth: number) => {
      const vis = visited.has(n);
      ctx.strokeStyle = vis ? accent : cssVar('--border', '#ccc');
      ctx.globalAlpha = vis ? 0.9 : 0.25;
      ctx.lineWidth = vis ? 1.5 : 1;
      ctx.strokeRect(n.box.min[0], n.box.min[1], n.box.max[0] - n.box.min[0], n.box.max[1] - n.box.min[1]);
      ctx.globalAlpha = 1;
      if (n.left) drawNode(n.left, depth + 1);
      if (n.right) drawNode(n.right, depth + 1);
    };
    drawNode(root, 0);

    // 삼각형
    tris.forEach((tr, i) => {
      ctx.beginPath();
      ctx.moveTo(tr.p[0][0], tr.p[0][1]);
      ctx.lineTo(tr.p[1][0], tr.p[1][1]);
      ctx.lineTo(tr.p[2][0], tr.p[2][1]);
      ctx.closePath();
      ctx.fillStyle = i === st.hitTri ? '#e0564b' : muted;
      ctx.globalAlpha = i === st.hitTri ? 0.95 : 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // 광선
    const end = st.hitT !== null ? [O[0] + d[0] * st.hitT, O[1] + d[1] * st.hitT] : target.current;
    ctx.strokeStyle = '#f0a500';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(O[0], O[1]);
    ctx.lineTo(end[0], end[1]);
    ctx.stroke();
    ctx.fillStyle = '#f0a500';
    ctx.beginPath();
    ctx.arc(O[0], O[1], 5, 0, 7);
    ctx.fill();
    // 타깃 핸들
    ctx.strokeStyle = text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(target.current[0], target.current[1], 7, 0, 7);
    ctx.stroke();

    // 통계
    ctx.fillStyle = text;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`box 테스트 ${st.boxTests} · 삼각형 테스트 ${st.triTests} · ${st.hitTri >= 0 ? 'HIT' : 'miss'}`, 8, 8);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`전수검사라면 삼각형 테스트 ${tris.length}회 고정`, 8, 26);
  }

  useEffect(render, [tris, root, ordered]);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{ width: '100%', maxWidth: 560, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', touchAction: 'none' }}
        />
      </div>

      <ControlPanel>
        <Slider label="삼각형 수" value={count} min={6} max={60} step={1} onChange={setCount} />
        <ToggleControl label="정렬 순회(가까운 자식 먼저)" checked={ordered} onChange={setOrdered} />
        <ToggleControl label="SAH 빌드 (끄면 median)" checked={sah} onChange={setSah} />
        <Slider label="장면 시드" value={seed} min={1} max={30} step={1} onChange={setSeed} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 캔버스를 드래그해 광선(주황)의 방향을 바꿔 보세요. 파란 박스는
        광선이 실제로 들어간 BVH 노드입니다. 좌상단 카운터의 <em>box 테스트·삼각형 테스트</em> 수가
        전수검사(삼각형 수 고정)보다 훨씬 적은 것을 보세요 — 값싼 박스 검사로 큰 영역을 일찍 버리는
        것이 가속 구조의 핵심입니다. <strong>정렬 순회</strong>를 켜면 가까운 자식을 먼저 들어가 더 먼
        노드를 가지치기해 테스트가 줄고, <strong>SAH</strong> 빌드는 median 분할보다 대체로 더 좋은
        트리를 만듭니다.
      </figcaption>
    </figure>
  );
}
