import { useEffect, useRef } from 'react';

// 정적 차트 — 클럭(f) vs 전력(P). 고클럭을 안정시키려면 전압(V)을 올려야 하고 P ∝ V²f라
// 곡선이 위로 급격히 휜다(superlinear). 같은 성능 구간에서 약간 낮은 클럭이 전력을 크게 아낀다.

const W = 380;
const H = 270;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

// 클럭 f(0..1, 정규화) → 필요한 전압 V(클럭에 따라 증가) → 전력 P = V² f
function voltageAt(f: number) {
  // 저클럭에선 거의 평탄, 고클럭으로 갈수록 전압 급증 (대표 곡선)
  return 0.7 + 0.55 * Math.pow(f, 2.2);
}
function powerAt(f: number) {
  const v = voltageAt(f);
  return v * v * Math.max(f, 0.02);
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  const padL = 44, padR = 16, padT = 38, padB = 36;
  const gw = W - padL - padR;
  const gh = H - padT - padB;
  const x = (f: number) => padL + f * gw;
  const pMax = powerAt(1) * 1.05;
  const y = (p: number) => padT + (1 - p / pMax) * gh;

  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('클럭 vs 전력 — P ∝ V² f', 10, 16);

  // 축
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + gh);
  ctx.lineTo(padL + gw, padT + gh);
  ctx.stroke();

  // 곡선
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const f = i / 200;
    const px = x(f), py = y(powerAt(f));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // 두 동작점: efficient(f=0.78) vs boost(f=1.0)
  const pts = [
    { f: 0.78, label: 'efficient', color: '#2e9e5b' },
    { f: 1.0, label: 'max boost', color: '#e0564b' },
  ];
  pts.forEach((pt) => {
    const px = x(pt.f), py = y(powerAt(pt.f));
    // 드롭라인
    ctx.strokeStyle = pt.color;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, padT + gh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padL, py);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = pt.f > 0.9 ? 'right' : 'center';
    ctx.fillText(pt.label, pt.f > 0.9 ? px - 6 : px, py - 12);
  });

  // 설명 화살표: +22% 클럭 → 전력 급증
  const f1 = 0.78, f2 = 1.0;
  const dPow = ((powerAt(f2) - powerAt(f1)) / powerAt(f1)) * 100;
  ctx.fillStyle = text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`+${Math.round(((f2 - f1) / f1) * 100)}% 클럭 → +${Math.round(dPow)}% 전력`, padL + gw / 2, padT + 6);

  // 축 라벨
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('클럭 f →', padL + gw / 2, padT + gh + 18);
  ctx.save();
  ctx.translate(14, padT + gh / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('전력 P', 0, 0);
  ctx.restore();
}

export default function PowerClockCurve() {
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
        전력과 클럭은 선형이 아닙니다. 동적 전력은 대략 P ∝ V²·f인데, 높은 클럭을 안정적으로 돌리려면
        전압 V도 올려야 하므로(전압이 클럭과 함께 증가) 곡선이 위로 급격히 휩니다. 그래서 막판 몇 %의
        클럭(efficient → max boost)을 짜내는 데 전력은 훨씬 더 많이 듭니다 — 마지막 한 방울의 성능이
        제일 비쌉니다. 거꾸로, 살짝만 클럭을 낮춰도(언더볼트/파워리밋) 전력은 크게 떨어지면서 성능은
        조금만 잃습니다. 데이터센터·노트북이 약간 낮은 클럭에서 도는 이유입니다(곡선은 도식용 대표값).
      </figcaption>
    </figure>
  );
}
