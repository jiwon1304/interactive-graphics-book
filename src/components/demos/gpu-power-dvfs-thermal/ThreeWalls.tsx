import { useEffect, useRef } from 'react';

// 정적 도식 — GPU 클럭을 막는 세 벽(power / thermal / voltage).
// 클럭을 올리려는 화살표가 가장 먼저 닿는 벽에서 멈춘다. 여기선 power 벽이 가장 낮아 그게 한계.
// 핵심: 셋 중 "가장 먼저 닿는 것"이 그 순간의 병목.

const W = 380;
const H = 250;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('클럭을 막는 세 벽 — 먼저 닿는 게 한계', 10, 16);

  const baseY = H - 30;
  const startX = 24;
  // 세 벽: 각자 다른 높이(=클럭 한계). 가장 낮은 벽이 실제 한계.
  const walls = [
    { name: 'power', sub: 'TDP/TGP', x: 150, color: '#e0564b', limit: true },
    { name: 'thermal', sub: '온도 한계', x: 250, color: '#e8943a' },
    { name: 'voltage', sub: 'V/f 안정', x: 330, color: '#8b5cf6' },
  ];

  // 클럭 화살표(아래에서 위로 올라가다 power 벽에서 멈춤)
  const stopX = walls[0].x;
  const topY = 56;
  // 진행 가능 구간(start→power) 채움
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.15;
  ctx.fillRect(startX, topY, stopX - startX, baseY - topY);
  ctx.globalAlpha = 1;

  // 벽들
  walls.forEach((w) => {
    ctx.strokeStyle = w.color;
    ctx.lineWidth = w.limit ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(w.x, topY - 6);
    ctx.lineTo(w.x, baseY);
    ctx.stroke();
    ctx.fillStyle = w.color;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(w.name, w.x, topY - 18);
    ctx.fillStyle = muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(w.sub, w.x, topY - 5);
  });

  // 클럭 화살표
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = 3;
  const arrY = baseY - (baseY - topY) * 0.5;
  ctx.beginPath();
  ctx.moveTo(startX, arrY);
  ctx.lineTo(stopX - 4, arrY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(stopX - 4, arrY);
  ctx.lineTo(stopX - 14, arrY - 7);
  ctx.lineTo(stopX - 14, arrY + 7);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('클럭 ↑', startX, arrY - 14);

  // "여기서 멈춤" 라벨
  ctx.fillStyle = '#e0564b';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('여기서 멈춤', stopX, baseY + 14);

  // base 라인
  ctx.strokeStyle = muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX, baseY);
  ctx.lineTo(W - 14, baseY);
  ctx.stroke();
}

export default function ThreeWalls() {
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
        GPU는 클럭을 올리려 하지만 세 개의 벽에 막힙니다 — <strong>power</strong>(TDP/TGP 전력 예산),
        <strong> thermal</strong>(온도 한계), <strong>voltage</strong>(그 클럭을 안정적으로 돌릴
        전압의 상한). 셋 중 <em>가장 먼저 닿는</em> 벽이 그 순간의 병목입니다. 데스크톱 고성능 카드는
        대개 power 벽(여기 그린 경우)이나 thermal 벽에 먼저 걸립니다. 어느 벽인지는 워크로드·냉각·
        실리콘 품질에 따라 매 순간 바뀌고, GPU의 전력 컨트롤러가 이 한계 안에서 클럭·전압을 끊임없이
        조정합니다.
      </figcaption>
    </figure>
  );
}
