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

// gshare(McFarling 1993): PHT index = (branch PC 하위 비트) XOR (global history GHR).
// 8-bit 예시. 같은 PC라도 최근 전역 분기 패턴(GHR)이 다르면 다른 PHT 칸을 보게 되어
// "이 분기는 보통 그 앞 분기 결과에 따라 다르게 행동한다"를 구분할 수 있다.

const PC =  [1, 0, 1, 1, 0, 1, 0, 0];
const GHR = [0, 1, 1, 0, 1, 1, 0, 1];
const XOR = PC.map((b, i) => b ^ GHR[i]);

export default function GshareIndex() {
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

      const labelW = 96;
      const x0 = labelW;
      const bitsW = cssW - x0 - 12;
      const n = 8;
      const cell = bitsW / n;
      const bh = 30;

      const rows = [
        { label: 'PC 하위비트', bits: PC, y: 30, fill: col.accent },
        { label: 'GHR (전역사)', bits: GHR, y: 84, fill: col.muted },
        { label: 'XOR → index', bits: XOR, y: 158, fill: '#2e9e5b' },
      ];

      // XOR 기호
      ctx.fillStyle = col.text;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⊕', x0 + bitsW / 2, 124);

      rows.forEach((row) => {
        ctx.fillStyle = col.text;
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(row.label, 4, row.y + bh / 2);
        row.bits.forEach((b, i) => {
          const x = x0 + i * cell;
          const on = b === 1;
          ctx.fillStyle = on ? row.fill : col.surface;
          ctx.globalAlpha = on ? 0.85 : 1;
          ctx.strokeStyle = on ? row.fill : col.border;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.rect(x + 1, row.y, cell - 2, bh);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.stroke();
          ctx.fillStyle = on ? col.surface : col.muted;
          ctx.font = 'bold 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${b}`, x + cell / 2, row.y + bh / 2);
        });
      });

      // 화살표 → PHT
      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('이 index의 PHT 칸 → 2-bit counter로 예측', cssW / 2, cssH - 14);
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
        <strong>gshare</strong>(McFarling 1993)의 인덱싱입니다. 분기 주소(PC) 하위 비트와 최근 전역 분기
        결과를 담은 <strong>global history register(GHR)</strong> 를 <strong>XOR(⊕)</strong> 해서 pattern
        history table(PHT)의 칸을 고릅니다. 덕분에 <em>같은 분기라도</em> 그 앞에서 어떤 분기들이 어떻게
        풀렸느냐(전역 문맥)에 따라 다른 counter를 보게 됩니다 — "A가 taken이면 B도 taken" 같은 분기 사이
        상관관계를 학습할 수 있죠. XOR로 섞는 건 PC만·GHR만 쓸 때보다 같은 표 크기에서 충돌(aliasing)을
        줄이기 위함입니다.
      </figcaption>
    </figure>
  );
}
