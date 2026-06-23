import { useEffect, useRef } from 'react';

// 정적 도식 — 소프트웨어 큐 → 하드웨어 큐(엔진) → 공유 연산 유닛(CU/SM).
// graphics 큐는 Graphics Command Processor, compute 큐는 ACE, copy 큐는 DMA 엔진으로 들어가고,
// graphics·compute는 같은 CU 풀을 공유한다(그래서 겹쳐 채울 수 있음). copy는 별도 DMA 경로.

const W = 380;
const H = 300;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, t1: string, t2: string, text: string) {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.18;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = text;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t1, x + w / 2, y + h / 2 - (t2 ? 7 : 0));
  if (t2) {
    ctx.fillStyle = cssVar('--muted', '#888');
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(t2, x + w / 2, y + h / 2 + 8);
  }
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 7 * Math.cos(a - 0.4), y2 - 7 * Math.sin(a - 0.4));
  ctx.lineTo(x2 - 7 * Math.cos(a + 0.4), y2 - 7 * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const C = '#8b5cf6';
  const CP = '#2e9e5b';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('소프트웨어 큐 → 하드웨어 엔진 → 유닛', 10, 14);

  const colW = 108;
  const x = [14, 136, 258];
  const yQ = 34;
  const qH = 40;
  // 소프트웨어 큐
  box(ctx, x[0], yQ, colW, qH, accent, 'graphics 큐', '명령 버퍼', text);
  box(ctx, x[1], yQ, colW, qH, C, 'compute 큐', '명령 버퍼', text);
  box(ctx, x[2], yQ, colW, qH, CP, 'copy 큐', '명령 버퍼', text);

  // 하드웨어 엔진
  const yE = 124;
  const eH = 44;
  box(ctx, x[0], yE, colW, eH, accent, 'Graphics CP', '커맨드 프로세서', text);
  box(ctx, x[1], yE, colW, eH, C, 'ACE / 큐', 'compute 엔진', text);
  box(ctx, x[2], yE, colW, eH, CP, 'DMA 엔진', 'copy 전용', text);

  for (let i = 0; i < 3; i++) {
    const col = [accent, C, CP][i];
    arrow(ctx, x[i] + colW / 2, yQ + qH, x[i] + colW / 2, yE, col);
  }

  // 공유 CU 풀 (graphics + compute가 공유)
  const yCU = 218;
  const cuH = 46;
  const cuX = x[0];
  const cuW = colW * 2 + (x[1] - x[0] - colW);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.1;
  ctx.fillRect(cuX, yCU, cuW, cuH);
  ctx.globalAlpha = 1;
  ctx.setLineDash([5, 3]);
  ctx.strokeStyle = muted;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(cuX, yCU, cuW, cuH);
  ctx.setLineDash([]);
  ctx.fillStyle = text;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('공유 연산 유닛 (CU / SM)', cuX + cuW / 2, yCU + cuH / 2 - 7);
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('graphics·compute가 같은 ALU를 채움', cuX + cuW / 2, yCU + cuH / 2 + 9);

  // graphics CP, ACE → CU
  arrow(ctx, x[0] + colW / 2, yE + eH, cuX + cuW * 0.32, yCU, accent);
  arrow(ctx, x[1] + colW / 2, yE + eH, cuX + cuW * 0.68, yCU, C);

  // copy → 별도 경로 (메모리)
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  arrow(ctx, x[2] + colW / 2, yE + eH, x[2] + colW / 2, yCU + cuH / 2, CP);
  ctx.fillStyle = text;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('VRAM / PCIe', x[2] + colW / 2, yCU + cuH + 8);
}

export default function HardwareQueues() {
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
        API가 노출하는 세 큐(graphics·compute·copy)는 각각 다른 하드웨어 엔진으로 들어갑니다 —
        graphics는 Graphics Command Processor, compute는 AMD의 <strong>ACE</strong>(Asynchronous
        Compute Engine, GCN/RDNA는 보통 여러 개) 같은 compute 큐, copy는 전용 DMA 엔진입니다. 결정적인
        점은 graphics와 compute가 <em>같은 연산 유닛(CU/SM) 풀</em>을 공유한다는 것 — 그래서 한쪽이
        비운 ALU를 다른 쪽이 채울 수 있습니다. copy는 별도 DMA 경로라 메모리 전송을 연산과 겹쳐
        진행합니다. (엔진 개수·동작은 아키텍처마다 다릅니다.)
      </figcaption>
    </figure>
  );
}
