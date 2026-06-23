import { useEffect, useRef } from 'react';

// 정적 도식 — amplification(task) shader가 거르는 컬링 단계 파이프라인.
// 입력 meshlet들이 frustum → cluster backface(원뿔) → occlusion(Hi-Z) → LOD 선택을 거쳐
// 살아남은 것만 mesh shader 워크그룹으로 dispatch된다. 단계마다 통과 개수가 줄어든다.

const W = 380;
const H = 360;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

const STAGES = [
  { label: 'meshlet 후보', sub: '입력 클러스터', count: 64, color: '--muted' },
  { label: 'frustum 컬링', sub: '화면 밖 제거', count: 40, color: '--accent' },
  { label: 'cluster backface', sub: '법선 원뿔이 뒤로', count: 26, color: '--accent' },
  { label: 'occlusion (Hi-Z)', sub: '가려진 것 제거', count: 17, color: '--accent' },
  { label: 'LOD 선택', sub: '거리별 해상도', count: 17, color: '--accent' },
  { label: 'mesh shader dispatch', sub: '살아남은 것만 래스터', count: 17, color: '#2e9e5b' },
];

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  const resolve = (c: string) => (c.startsWith('--') ? cssVar(c, accent) : c);

  ctx.fillStyle = text;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('GPU-driven 컬링 단계 (task/amp shader)', 12, 16);

  const top = 36;
  const rowH = 50;
  const gap = 4;
  const maxCount = STAGES[0].count;
  const cx = W / 2;
  const maxW = W - 40;

  STAGES.forEach((st, i) => {
    const y = top + i * rowH;
    const w = 70 + (maxW - 70) * (st.count / maxCount);
    const col = resolve(st.color);
    // 막대
    ctx.fillStyle = col;
    ctx.globalAlpha = st.color === '#2e9e5b' ? 0.85 : 0.3;
    ctx.beginPath();
    const x0 = cx - w / 2;
    const h = rowH - gap * 2;
    const r = 8;
    ctx.moveTo(x0 + r, y);
    ctx.arcTo(x0 + w, y, x0 + w, y + h, r);
    ctx.arcTo(x0 + w, y + h, x0, y + h, r);
    ctx.arcTo(x0, y + h, x0, y, r);
    ctx.arcTo(x0, y, x0 + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 라벨
    ctx.fillStyle = text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(st.label, cx, y + h / 2 - 8);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(st.sub, cx, y + h / 2 + 8);

    // 통과 개수 (오른쪽)
    ctx.fillStyle = text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${st.count}`, W - 6, y + h / 2);

    // 단계 사이 화살표
    if (i < STAGES.length - 1) {
      ctx.strokeStyle = muted;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, y + h);
      ctx.lineTo(cx, y + h + gap * 2);
      ctx.stroke();
    }
  });
}

export default function CullStages() {
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
        amplification(task) shader가 meshlet 후보를 여러 단계로 점진적으로 걸러내는 과정입니다(오른쪽 숫자는
        도식용 대표값). 화면 밖(frustum), 카메라를 등진 클러스터(meshlet의 normal cone), 이미 가려진
        부분(Hi-Z occlusion)을 차례로 버리고, 남은 meshlet의 LOD(거리에 맞는 해상도)를 고른 뒤
        <em> 살아남은 것만</em> mesh shader 워크그룹으로 dispatch합니다. 컬링 판단이 전부 GPU 안에서
        일어나므로 CPU는 "그려라" 한 번만 말합니다 — 이것이 GPU-driven rendering입니다. 전통
        파이프라인은 컬링 단위가 draw call(객체) 단위라 이렇게 잘게 버릴 수 없었습니다.
      </figcaption>
    </figure>
  );
}
