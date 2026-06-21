import { useEffect, useRef } from 'react';
import { usePointerDrag } from '../raymarching-sdf/usePointerDrag';

const W = 480;
const H = 320;
const O: [number, number] = [40, H - 40];
const BOX = { min: [200, 90] as [number, number], max: [340, 220] as [number, number] };

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

export default function RayAABBSlab() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const target = useRef<[number, number]>([W - 40, 60]);

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
    const dir = [target.current[0] - O[0], target.current[1] - O[1]];
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    const d = [dir[0] / dl, dir[1] / dl];

    // 슬랩별 t 구간
    const slab = (a: number) => {
      const inv = 1 / d[a];
      let t1 = (BOX.min[a] - O[a]) * inv;
      let t2 = (BOX.max[a] - O[a]) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      return [t1, t2];
    };
    const [tx1, tx2] = slab(0);
    const [ty1, ty2] = slab(1);
    const tmin = Math.max(tx1, ty1);
    const tmax = Math.min(tx2, ty2);
    const hit = tmin <= tmax && tmax >= 0;

    const text = cssVar('--text', '#222');
    const muted = cssVar('--muted', '#888');
    const accent = cssVar('--accent', '#3b82f6');
    ctx.clearRect(0, 0, W, H);

    // 슬랩 밴드(x=세로 띠, y=가로 띠)
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.08;
    ctx.fillRect(BOX.min[0], 0, BOX.max[0] - BOX.min[0], H); // x-slab
    ctx.fillRect(0, BOX.min[1], W, BOX.max[1] - BOX.min[1]); // y-slab
    ctx.globalAlpha = 1;

    // 박스
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(BOX.min[0], BOX.min[1], BOX.max[0] - BOX.min[0], BOX.max[1] - BOX.min[1]);

    // 광선(길게)
    const far = 600;
    ctx.strokeStyle = muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(O[0], O[1]);
    ctx.lineTo(O[0] + d[0] * far, O[1] + d[1] * far);
    ctx.stroke();

    // 교차 구간 [tmin,tmax] 강조
    if (hit) {
      ctx.strokeStyle = '#2e9e5b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(O[0] + d[0] * Math.max(0, tmin), O[1] + d[1] * Math.max(0, tmin));
      ctx.lineTo(O[0] + d[0] * tmax, O[1] + d[1] * tmax);
      ctx.stroke();
    }
    const dot = (t: number, col: string) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(O[0] + d[0] * t, O[1] + d[1] * t, 4, 0, 7);
      ctx.fill();
    };
    if (tmin >= 0) dot(tmin, '#2e9e5b');
    if (tmax >= 0) dot(tmax, '#e0564b');

    // 원점·타깃
    ctx.fillStyle = '#f0a500';
    ctx.beginPath();
    ctx.arc(O[0], O[1], 5, 0, 7);
    ctx.fill();
    ctx.strokeStyle = text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(target.current[0], target.current[1], 7, 0, 7);
    ctx.stroke();

    // 텍스트
    ctx.fillStyle = text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    const f = (v: number) => (isFinite(v) ? v.toFixed(0) : '∞');
    ctx.fillText(`x-slab [${f(tx1)}, ${f(tx2)}]   y-slab [${f(ty1)}, ${f(ty2)}]`, 8, 8);
    ctx.fillStyle = hit ? '#2e9e5b' : '#e0564b';
    ctx.fillText(`tmin=max=${f(tmin)}  tmax=min=${f(tmax)}  →  ${hit ? 'tmin ≤ tmax : HIT' : 'tmin > tmax : miss'}`, 8, 26);
  }

  useEffect(render, []);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{ width: '100%', maxWidth: 480, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', touchAction: 'none' }}
        />
      </div>
      <figcaption>
        <strong>직접 해보세요:</strong> 흰 핸들을 드래그해 광선 방향을 바꾸세요. 박스는 두 축의
        <em>슬랩</em>(평행한 평면 쌍)의 교집합입니다. 각 축마다 광선이 슬랩에 들어가고 나가는 파라미터
        구간 [t1, t2]를 구하고, <strong>tmin = 각 축 진입의 최댓값</strong>, <strong>tmax = 각 축 이탈의
        최솟값</strong>을 취합니다. <strong>tmin ≤ tmax</strong>이면 교차(초록 구간)입니다. 곱셈·min/max
        몇 번뿐이라 분기 없이 매우 싸고, 그래서 BVH가 이 검사를 수없이 돌립니다.
      </figcaption>
    </figure>
  );
}
