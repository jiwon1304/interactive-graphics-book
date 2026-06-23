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

// BHT(방향) vs BTB(목적지) 역할 분담. PC가 두 표를 동시에 인덱싱:
//  - BHT/PHT: "taken? not-taken?" (2-bit counter)
//  - BTB: "taken이면 어디로?" (target 주소 + tag)
// 둘 다 IF 단계에서 즉시 답해야 다음 fetch를 멈추지 않는다.

export default function BhtBtb() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 360;
      const cssH = 250;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.textBaseline = 'middle';

      // 상단: PC 박스
      const pcW = Math.min(160, cssW - 60);
      const pcX = (cssW - pcW) / 2;
      const pcY = 14;
      const pcH = 30;
      ctx.fillStyle = col.accent;
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.rect(pcX, pcY, pcW, pcH);
      ctx.fill();
      ctx.fillStyle = col.surface;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('분기 PC', cssW / 2, pcY + pcH / 2);

      // 두 표
      const tableY = 96;
      const tableH = 96;
      const gap = 14;
      const tW = (cssW - 24 - gap) / 2;
      const leftX = 12;
      const rightX = 12 + tW + gap;

      const drawTable = (x: number, title: string, sub: string, rows: string[]) => {
        ctx.fillStyle = col.text;
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, x + tW / 2, tableY - 22);
        ctx.fillStyle = col.muted;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(sub, x + tW / 2, tableY - 7);

        ctx.fillStyle = col.surface;
        ctx.strokeStyle = col.border;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.rect(x, tableY, tW, tableH);
        ctx.fill();
        ctx.stroke();
        const rh = tableH / rows.length;
        rows.forEach((r, i) => {
          const ry = tableY + i * rh;
          if (i > 0) {
            ctx.strokeStyle = col.border;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(x, ry);
            ctx.lineTo(x + tW, ry);
            ctx.stroke();
          }
          ctx.fillStyle = i === 1 ? col.accent : col.text;
          ctx.font = i === 1 ? 'bold 12px system-ui, sans-serif' : '11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(r, x + tW / 2, ry + rh / 2);
        });
      };

      drawTable(leftX, 'BHT / PHT', '방향', ['…', '10 (약하게 T)', '…']);
      drawTable(rightX, 'BTB', '목적지', ['tag …', '→ 0x4A2C', 'tag …']);

      // PC → 두 표 화살표
      const drawArrow = (x2: number) => {
        ctx.strokeStyle = col.muted;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cssW / 2, pcY + pcH);
        ctx.lineTo(x2, tableY - 4);
        ctx.stroke();
        ctx.fillStyle = col.muted;
        const ang = Math.atan2(tableY - 4 - (pcY + pcH), x2 - cssW / 2);
        ctx.beginPath();
        ctx.moveTo(x2, tableY - 4);
        ctx.lineTo(x2 - 7 * Math.cos(ang - 0.4), tableY - 4 - 7 * Math.sin(ang - 0.4));
        ctx.lineTo(x2 - 7 * Math.cos(ang + 0.4), tableY - 4 - 7 * Math.sin(ang + 0.4));
        ctx.fill();
      };
      drawArrow(leftX + tW / 2);
      drawArrow(rightX + tW / 2);

      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('“taken?” + “taken이면 어디로?” 둘 다 IF에서 즉시 답해야 한다', cssW / 2, cssH - 14);
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
      <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block', maxWidth: 380, margin: '0 auto' }} />
      <figcaption>
        분기 예측은 두 가지를 따로 답합니다. <strong>BHT/PHT</strong>(방향 표)는 "taken인가
        not-taken인가"를 2-bit counter로 답하고, <strong>BTB</strong>(branch target buffer)는 "taken이면
        어느 주소로 가는가"를 tag와 함께 저장한 target으로 답합니다. 목적지가 따로 필요한 이유는, fetch
        단계에서는 아직 명령을 해독조차 안 해 분기 목적지를 모르기 때문입니다. 두 답 모두 <strong>IF
        단계에서 즉시</strong> 나와야 다음 fetch가 한 cycle도 멈추지 않습니다.
      </figcaption>
    </figure>
  );
}
