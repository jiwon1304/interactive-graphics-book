import { useEffect, useRef } from 'react';

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return {
    text: cs.getPropertyValue('--text').trim() || '#222',
    muted: cs.getPropertyValue('--muted').trim() || '#888',
    border: cs.getPropertyValue('--border').trim() || '#ccc',
    accent: cs.getPropertyValue('--accent').trim() || '#4f9dde',
    surface: cs.getPropertyValue('--surface').trim() || '#fff',
  };
}

// 5단계(IF·ID·EX·MEM·WB) 파이프라인의 space-time(공간-시간) 다이어그램.
// 5개 명령이 한 cycle씩 어긋나 겹쳐 흐르는 정적 1컷. cycle 5에 5단계가 모두 차면
// 매 cycle 명령 하나가 "완성"되어 나온다 = throughput 1/cycle.
const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
const NINSTR = 5;
const NCYCLE = 9; // 5 + 5 - 1

export default function PipelineSpaceTime() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 380;
      const cssH = 250;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.textBaseline = 'middle';

      const labelW = 36;
      const topPad = 36;
      const x0 = labelW + 6;
      const gridW = cssW - x0 - 8;
      const cellW = gridW / NCYCLE;
      const rowH = 30;
      const gap = 4;

      // cycle 눈금(상단)
      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let c = 0; c < NCYCLE; c++) {
        ctx.fillText(`${c + 1}`, x0 + c * cellW + cellW / 2, topPad - 14);
      }
      ctx.textAlign = 'left';
      ctx.fillText('cycle →', 2, topPad - 14);

      // 각 명령 = 한 행, stage가 cycle마다 한 칸씩 이동
      for (let i = 0; i < NINSTR; i++) {
        const y = topPad + i * (rowH + gap);
        ctx.fillStyle = col.text;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`I${i + 1}`, 4, y + rowH / 2);
        for (let s = 0; s < STAGES.length; s++) {
          const c = i + s; // 명령 i는 cycle i부터 시작
          const x = x0 + c * cellW;
          const isExec = s === 2;
          ctx.fillStyle = isExec ? col.accent : col.surface;
          ctx.strokeStyle = col.accent;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.rect(x + 1, y, cellW - 2, rowH);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = isExec ? col.surface : col.text;
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(STAGES[s], x + cellW / 2, y + rowH / 2);
        }
      }

      // "정상 상태" 표시: cycle 5에 5단계가 모두 가동
      const fullX = x0 + 4 * cellW;
      ctx.strokeStyle = col.text;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(fullX, topPad - 4);
      ctx.lineTo(fullX, topPad + NINSTR * (rowH + gap) + 2);
      ctx.lineTo(fullX + cellW, topPad + NINSTR * (rowH + gap) + 2);
      ctx.lineTo(fullX + cellW, topPad - 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('5단계 모두 가동', fullX + cellW / 2, cssH - 12);
    };

    draw();
    const ro = new ResizeObserver(draw);
    if (ref.current) ro.observe(ref.current);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <figure className="demo">
      <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block', maxWidth: 400, margin: '0 auto' }} />
      <figcaption>
        5단계 파이프라인의 <strong>space-time 다이어그램</strong>입니다. 가로는 cycle, 세로는 명령(I1~I5).
        한 명령이 다섯 단계(IF·ID·EX·MEM·WB)를 차례로 지나는데, 다음 명령은 한 cycle 늦게 출발해 단계가{' '}
        <strong>겹칩니다</strong>. cycle 5부터는 다섯 단계가 동시에 가동되어, 그 뒤로 매 cycle 명령 하나가
        완성됩니다 — 명령 하나의 latency는 여전히 5 cycle이지만, throughput은 1개/cycle로 올라갑니다.
      </figcaption>
    </figure>
  );
}
