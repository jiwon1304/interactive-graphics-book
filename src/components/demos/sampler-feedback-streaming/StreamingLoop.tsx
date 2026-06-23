import { useEffect, useRef } from 'react';

// 정적 도식 — sampler feedback streaming 루프(세로 사이클).
// 샘플 → feedback 기록 → resolve(decode) → 필요한 타일 스트리밍 → MinMip/타일 매핑 갱신 → 다시 샘플.

const W = 320;
const STEPS = [
  { t: '셰이딩 중 샘플', s: 'WriteSamplerFeedback (SM 6.5)' },
  { t: 'feedback 기록', s: 'region별 원하는 mip' },
  { t: 'Resolve / decode', s: 'ResolveSubresourceRegion' },
  { t: '필요한 타일 스트리밍', s: 'DirectStorage로 NVMe→VRAM' },
  { t: 'MinMip · 타일 매핑 갱신', s: 'UpdateTileMappings' },
];
const boxH = 46;
const gap = 20;
const top = 14;
const H = top + STEPS.length * boxH + STEPS.length * gap + 20;

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
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  const bx = 26;
  const bw = W - 52;

  STEPS.forEach((step, i) => {
    const y = top + i * (boxH + gap);
    const col = i === 3 ? '#2e9e5b' : accent;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.14;
    roundRect(ctx, bx, y, bw, boxH, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx, y, bw, boxH, 8);
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${i + 1}. ${step.t}`, bx + 12, y + 16);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(step.s, bx + 12, y + 33);

    if (i < STEPS.length - 1) {
      const ax = W / 2;
      const y1 = y + boxH + 2;
      const y2 = y + boxH + gap - 2;
      ctx.strokeStyle = text;
      ctx.fillStyle = text;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax, y1);
      ctx.lineTo(ax, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax, y2 + 1);
      ctx.lineTo(ax - 5, y2 - 5);
      ctx.lineTo(ax + 5, y2 - 5);
      ctx.closePath();
      ctx.fill();
    }
  });

  // 루프 백 화살표 (마지막 → 첫 박스), 오른쪽으로 우회
  const lastY = top + (STEPS.length - 1) * (boxH + gap) + boxH / 2;
  const firstY = top + boxH / 2;
  const rx = W - 12;
  ctx.strokeStyle = muted;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(bx + bw, lastY);
  ctx.lineTo(rx, lastY);
  ctx.lineTo(rx, firstY);
  ctx.lineTo(bx + bw, firstY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = muted;
  ctx.beginPath();
  ctx.moveTo(bx + bw, firstY);
  ctx.lineTo(bx + bw + 7, firstY - 4);
  ctx.lineTo(bx + bw + 7, firstY + 4);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.translate(rx + 4, (firstY + lastY) / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('다음 프레임', 0, 0);
  ctx.restore();
}

export default function StreamingLoop() {
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
        스트리밍 루프 한 바퀴. 셰이더가 샘플하며 feedback을 기록하고(<strong>WriteSamplerFeedback</strong>),
        CPU가 읽을 수 있게 resolve/decode한 뒤, 부족한 타일만 <a href="./cpu-gpu-transfer">디스크에서
        VRAM으로</a> 스트리밍합니다(DirectStorage). 타일이 올라오면 매핑과 MinMip을 갱신하고, 다음
        프레임에서 다시 샘플합니다. 매 프레임 "본 만큼만" 채우는 자기조정 루프입니다.
      </figcaption>
    </figure>
  );
}
