import { useEffect, useRef } from 'react';

// 정적 차트 — 부하 시작 후 시간에 따른 클럭·온도.
// 초반: boost로 클럭이 base 위로 치솟음. 온도가 한계에 닿으면 thermal throttling으로 클럭이 떨어져
// 정상상태(sustained) 클럭으로 수렴. 핵심: 부스트는 "초반 단거리", sustained가 진짜 성능.

const W = 380;
const H = 280;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

// 시간 0..1 → 클럭(상대), 온도(℃). 도식용 대표 곡선.
function clockAt(t: number) {
  // 부스트 피크 후 throttle로 하강해 sustained로 수렴
  const boost = 1.0;
  const sustained = 0.86;
  if (t < 0.12) return boost; // 초반 부스트 유지
  // 0.12~0.45 사이에 온도 상승으로 하강
  if (t < 0.5) {
    const k = (t - 0.12) / (0.5 - 0.12);
    return boost - (boost - sustained) * (1 - Math.pow(1 - k, 2));
  }
  return sustained + Math.sin(t * 40) * 0.004; // 약간의 출렁임
}

function tempAt(t: number) {
  const tj = 88; // throttle 온도
  return 40 + (tj - 40) * (1 - Math.exp(-t * 6));
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  const padL = 40;
  const padR = 40;
  const padT = 40;
  const padB = 34;
  const gw = W - padL - padR;
  const gh = H - padT - padB;
  const x = (t: number) => padL + t * gw;
  // 클럭: 0.7..1.05 → y
  const cyMin = 0.72, cyMax = 1.04;
  const yClock = (c: number) => padT + (1 - (c - cyMin) / (cyMax - cyMin)) * gh;
  // 온도: 30..95
  const tyMin = 30, tyMax = 95;
  const yTemp = (tp: number) => padT + (1 - (tp - tyMin) / (tyMax - tyMin)) * gh;

  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('부하 시작 후 클럭 · 온도', 10, 16);

  // 축
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + gh);
  ctx.lineTo(padL + gw, padT + gh);
  ctx.stroke();

  // base 클럭 기준선
  const baseClk = 0.78;
  ctx.strokeStyle = muted;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(padL, yClock(baseClk));
  ctx.lineTo(padL + gw, yClock(baseClk));
  ctx.stroke();
  // sustained 기준선
  const sus = 0.86;
  ctx.beginPath();
  ctx.moveTo(padL, yClock(sus));
  ctx.lineTo(padL + gw, yClock(sus));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('base', padL + 2, yClock(baseClk) - 8);
  ctx.fillText('sustained', padL + 2, yClock(sus) - 8);

  // 온도 곡선 (오른쪽 축)
  ctx.strokeStyle = '#e0564b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const px = x(t), py = yTemp(tempAt(t));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // throttle 온도 라인
  ctx.strokeStyle = '#e0564b';
  ctx.setLineDash([2, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, yTemp(88));
  ctx.lineTo(padL + gw, yTemp(88));
  ctx.stroke();
  ctx.setLineDash([]);

  // 클럭 곡선
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const px = x(t), py = yClock(clockAt(t));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // 부스트 피크 / throttle 영역 라벨
  ctx.fillStyle = accent;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('boost', x(0.06), yClock(1.0) - 12);
  ctx.fillStyle = '#e0564b';
  ctx.textAlign = 'left';
  ctx.fillText('throttle 시작', x(0.36), yClock(0.95) + 4);

  // 축 라벨
  ctx.fillStyle = accent;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('클럭', padL - 36, padT + 4);
  ctx.fillStyle = '#e0564b';
  ctx.textAlign = 'right';
  ctx.fillText('온도', padL + gw + 36, padT + 4);
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('시간 →', padL + gw / 2, padT + gh + 18);
}

export default function ThrottleCurve() {
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
        부하가 걸리면 GPU는 처음엔 <strong>boost</strong> 클럭으로 base 위로 치솟습니다(파란선). 하지만
        연산이 열을 내고 온도(빨간선)가 throttle 한계(보통 칩 ~83~90℃대)에 닿으면, GPU는 손상을 막으려
        클럭을 끌어내려 <strong>sustained</strong>(정상상태) 클럭으로 수렴합니다. 그래서 벤치마크 첫
        몇 초의 부스트 성능과, 오래 돌렸을 때의 실제 성능은 다릅니다 — 노트북·작은 케이스처럼 냉각이
        약할수록 sustained가 base 쪽으로 더 내려갑니다(곡선·온도는 도식용 대표값).
      </figcaption>
    </figure>
  );
}
