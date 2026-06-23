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

// load-use 해저드: forwarding이 있어도 단 한 번의 bubble은 못 피한다.
//   I1: lw  r1, 0(r2)   ← r1을 MEM 끝에서야 얻음
//   I2: add r3, r1, r4  ← r1이 EX 시작에 필요한데 아직 안 왔다 → 1 cycle stall
// 화면: 윗줄에 forwarding 화살표(MEM→EX는 "시간을 거슬러" 못 감), 아래에 stall된 그림.
const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
const NCYCLE = 8;

export default function HazardBubble() {
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
      const cssH = 210;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.textBaseline = 'middle';

      const labelW = 92;
      const topPad = 34;
      const x0 = labelW + 4;
      const gridW = cssW - x0 - 8;
      const cellW = gridW / NCYCLE;
      const rowH = 30;
      const gap = 6;

      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let c = 0; c < NCYCLE; c++) {
        ctx.fillText(`${c + 1}`, x0 + c * cellW + cellW / 2, topPad - 14);
      }
      ctx.textAlign = 'left';
      ctx.fillText('cycle →', 2, topPad - 14);

      type Cell = { stage: string; bubble?: boolean };
      // I1: lw  — IF ID EX MEM WB  (start cycle 0)
      // I2: add — IF ID **stall** EX MEM WB  (한 칸 bubble 삽입)
      const rows: { name: string; start: number; cells: Cell[] }[] = [
        {
          name: 'lw r1,0(r2)',
          start: 0,
          cells: STAGES.map((s) => ({ stage: s })),
        },
        {
          name: 'add r3,r1,r4',
          start: 1,
          cells: [
            { stage: 'IF' },
            { stage: 'ID' },
            { stage: '—', bubble: true },
            { stage: 'EX' },
            { stage: 'MEM' },
            { stage: 'WB' },
          ],
        },
      ];

      rows.forEach((row, ri) => {
        const y = topPad + ri * (rowH + gap);
        ctx.fillStyle = col.text;
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(row.name, 4, y + rowH / 2);
        row.cells.forEach((cell, ci) => {
          const c = row.start + ci;
          const x = x0 + c * cellW;
          const isExec = cell.stage === 'EX';
          if (cell.bubble) {
            ctx.fillStyle = '#e0564b';
            ctx.globalAlpha = 0.5;
            ctx.fillRect(x + 1, y, cellW - 2, rowH);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#e0564b';
          } else {
            ctx.fillStyle = isExec ? col.accent : col.surface;
            ctx.strokeStyle = col.accent;
          }
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.rect(x + 1, y, cellW - 2, rowH);
          if (!cell.bubble) ctx.fill();
          ctx.stroke();
          ctx.fillStyle = cell.bubble ? '#fff' : isExec ? col.surface : col.text;
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(cell.bubble ? 'bubble' : cell.stage, x + cellW / 2, y + rowH / 2);
        });
      });

      // forwarding 화살표: lw의 MEM(cycle 4, idx3) 끝 → add의 EX(cycle 5, idx... start1+3=4)
      // lw MEM은 cycle index 3 (start0+3), add EX는 cycle index 4 (start1+3) → 한 칸 뒤. OK.
      const lwMemX = x0 + (0 + 3) * cellW + cellW / 2;
      const lwMemY = topPad + 0 * (rowH + gap) + rowH;
      const addExX = x0 + (1 + 3) * cellW + cellW / 2;
      const addExY = topPad + 1 * (rowH + gap);
      ctx.strokeStyle = '#2e9e5b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lwMemX, lwMemY);
      ctx.lineTo(addExX, addExY);
      ctx.stroke();
      // 화살촉
      ctx.fillStyle = '#2e9e5b';
      ctx.beginPath();
      ctx.moveTo(addExX, addExY);
      ctx.lineTo(addExX - 5, addExY - 7);
      ctx.lineTo(addExX + 5, addExY - 7);
      ctx.fill();
      ctx.fillStyle = '#2e9e5b';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('forward', (lwMemX + addExX) / 2, (lwMemY + addExY) / 2 + 2);

      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('load 값은 MEM이 끝나야 나온다 → add의 EX를 한 칸 미뤄야 닿는다', cssW / 2, cssH - 12);
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
        <strong>load-use 해저드</strong> — forwarding으로도 못 피하는 딱 한 번의 bubble. <code>lw</code>가 읽은
        값 <code>r1</code>은 <strong>MEM 단계가 끝나야</strong> 나오는데, 바로 뒤 <code>add</code>는 그 값을
        EX 시작에 써야 합니다. forwarding은 값을 옆 칸으로 건네줄 뿐 <em>시간을 거슬러</em> 보내지는 못하므로,{' '}
        <code>add</code>의 EX를 한 cycle 미뤄(빨강 bubble) MEM 출력과 EX 입력의 cycle을 맞춥니다. 그제서야
        초록 forward 화살표가 같은 cycle 안에서 값을 건넵니다.
      </figcaption>
    </figure>
  );
}
