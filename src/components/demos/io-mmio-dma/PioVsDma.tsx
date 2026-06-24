import { useEffect, useRef } from 'react';

// 정적 도식 — 같은 블록 전송을 programmed I/O(폴링) vs DMA로 비교한 타임라인.
// 위(PIO): CPU가 전송 내내 busy(데이터를 한 워드씩 옮김). 다른 일 못함.
// 아래(DMA): CPU는 짧게 설정만 → 자유(다른 일) → 완료 interrupt 한 번.
// 세로 스택. 시간 비율은 도식용 대표값.

const W = 360;
const H = 320;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const red = '#e0564b';
  const green = '#2e9e5b';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  const x0 = 16;
  const x1 = W - 16;
  const span = x1 - x0;
  const barH = 26;

  const seg = (x: number, w: number, y: number, color: string, alpha: number) => {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(x, y, w, barH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, w, barH);
  };
  const lab = (t: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center') => {
    ctx.fillStyle = color;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = align;
    ctx.fillText(t, x, y);
  };
  const irq = (x: number, yTop: number) => {
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, yTop - 12);
    ctx.lineTo(x, yTop);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x - 4, yTop - 6);
    ctx.lineTo(x + 4, yTop - 6);
    ctx.closePath();
    ctx.fill();
  };

  // ── PIO ──
  let y = 28;
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Programmed I/O (폴링)', x0, y);
  y += 22;
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('CPU 활동', x0, y);
  y += 16;
  // CPU가 전송 내내 busy: 작은 워드 전송 블록을 촘촘히
  const words = 12;
  const wSeg = span / words;
  for (let i = 0; i < words; i++) {
    seg(x0 + i * wSeg, wSeg - 2, y, red, 0.45);
  }
  ctx.strokeStyle = red;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0, y, span, barH);
  lab('CPU가 한 워드씩 직접 복사 — 전송 내내 점유', W / 2, y + barH + 14, red);

  // ── DMA ──
  y += barH + 40;
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('DMA', x0, y);
  y += 22;
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('CPU 활동', x0, y);
  y += 16;
  const cpuY = y;
  const setupW = span * 0.08;
  // 설정(짧게) + 자유(연함) + 완료시 짧은 ISR
  seg(x0, setupW, cpuY, accent, 0.5);
  // free 구간
  ctx.fillStyle = green;
  ctx.globalAlpha = 0.16;
  ctx.fillRect(x0 + setupW, cpuY, span - setupW - span * 0.06, barH);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = green;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 + setupW, cpuY, span - setupW - span * 0.06, barH);
  // 완료 ISR
  seg(x1 - span * 0.06, span * 0.06, cpuY, accent, 0.5);
  lab('설정', x0 + setupW / 2, cpuY - 6, accent, 'center');
  lab('CPU 자유 — 다른 일 실행', x0 + setupW + (span - setupW) / 2 - span * 0.03, cpuY + barH / 2, green);
  irq(x1 - span * 0.06, cpuY);
  lab('완료 IRQ', x1 - span * 0.06, cpuY - 14, accent, 'right');

  // DMA controller 활동
  const dmaY = cpuY + barH + 18;
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('DMA 컨트롤러', x0, dmaY - 4);
  seg(x0 + setupW, span - setupW - span * 0.06, dmaY + 6, accent, 0.35);
  lab('메모리 ↔ 장치 직접 전송 (CPU 우회)', x0 + setupW + (span - setupW) / 2 - span * 0.03, dmaY + 6 + barH / 2, accent);
}

export default function PioVsDma() {
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
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{ width: '100%', maxWidth: W, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}
        />
      </div>
      <figcaption>
        같은 데이터 블록을 옮기는 두 방식의 시간선입니다(시간 비율은 도식용). <strong>programmed I/O</strong>는
        CPU가 status 레지스터를 폴링하며 한 워드씩 직접 복사합니다 — 전송이 끝날 때까지 CPU가 통째로
        묶입니다(빨강). <strong>DMA</strong>는 CPU가 전송의 출발지·목적지·길이만 DMA 컨트롤러에 적어주고
        시작시킨 뒤(설정), 곧바로 풀려나 다른 일을 합니다(초록). 실제 바이트 이동은 DMA 컨트롤러가 메모리와
        장치 사이에서 직접 합니다. 다 끝나면 컨트롤러가 완료 interrupt를 한 번 올려 CPU가 짧은 ISR로
        마무리합니다. 큰 전송일수록 차이가 벌어집니다 — 디스크·네트워크·GPU 전송이 전부 DMA인 이유입니다.
      </figcaption>
    </figure>
  );
}
