import { useEffect, useRef } from 'react';

// 정적 도식 — time-slicing(시분할) vs MIG(공간 분할) 비교.
// 위: time-slice — 한 자원을 시간으로 A/B/C가 교대(전체 GPU를 번갈아). 격리 없음.
// 아래: MIG — A/B/C가 각자 자기 슬라이스를 "동시에" 점유. 공간 격리.

const W = 360;
const H = 280;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const border = cssVar('--border', '#ccc');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  const colA = '#3b82f6', colB = '#2e9e5b', colC = '#e08a2b';

  const x0 = 14;
  const x1 = W - 14;
  const span = x1 - x0;

  // ── 위: time-slicing ──
  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Time-slicing — 시간으로 교대', x0, 18);
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('전체 GPU를 번갈아 점유 · 격리 없음', x0, 34);

  const tY = 46;
  const tH = 40;
  // y축 라벨
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('전체 GPU', x0, tY - 0);

  const slots = [colA, colB, colC, colA, colB, colC, colA, colB];
  const labels = ['A', 'B', 'C', 'A', 'B', 'C', 'A', 'B'];
  const sw = span / slots.length;
  slots.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x0 + i * sw, tY + 8, sw - 2, tH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x0 + i * sw + sw / 2, tY + 8 + tH / 2);
  });
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, tY + 8, span, tH);
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('시간 →', x1, tY + 8 + tH + 12);

  // 구분선
  ctx.strokeStyle = border;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x0, 152);
  ctx.lineTo(x1, 152);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 아래: MIG ──
  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MIG — 공간으로 분할', x0, 170);
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('각자 자기 슬라이스를 동시에 · HW 격리', x0, 186);

  const mY = 198;
  const mH = 58;
  const lanes = [colA, colB, colC];
  const laneLabels = ['A', 'B', 'C'];
  const lh = mH / 3;
  lanes.forEach((c, i) => {
    const y = mY + i * lh;
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x0, y + 1, span, lh - 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`인스턴스 ${laneLabels[i]} — 전 시간 점유`, x0 + 8, y + lh / 2);
  });
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, mY, span, mH);
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('시간 →', x1, mY + mH + 12);
}

export default function TimeSliceVsMig() {
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
        같은 "공유"라도 방식이 다릅니다. <strong>Time-slicing</strong>은 A·B·C가 전체 GPU를 시간으로
        번갈아 씁니다 — 유연하지만 한 작업이 길어지면 이웃이 그만큼 굶고, 성능 격리 보장이 없습니다.
        <strong> MIG</strong>는 각 인스턴스가 자기 슬라이스를 <em>전 시간 동안 동시에</em> 점유합니다 —
        메모리·캐시·메모리 컨트롤러까지 하드웨어로 갈라져 있어, 옆 인스턴스가 무슨 짓을 하든 내 성능이
        흔들리지 않습니다(QoS 보장).
      </figcaption>
    </figure>
  );
}
