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

// 2-bit saturating counter FSM. 4상태를 세로로 쌓는다(모바일):
//   11 강하게 Taken  (예측 T)
//   10 약하게 Taken  (예측 T)
//   01 약하게 Not    (예측 N)
//   00 강하게 Not    (예측 N)
// T면 위로(포화), N이면 아래로. 한 번 빗나가도 강→약만 바뀌어 예측은 안 뒤집힌다(hysteresis).

const STATES = [
  { code: '11', name: '강하게 Taken', pred: 'T' },
  { code: '10', name: '약하게 Taken', pred: 'T' },
  { code: '01', name: '약하게 Not-taken', pred: 'N' },
  { code: '00', name: '강하게 Not-taken', pred: 'N' },
];

export default function TwoBitFSM() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 340;
      const cssH = 290;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.textBaseline = 'middle';

      const boxW = Math.min(220, cssW - 120);
      const boxH = 42;
      const boxX = (cssW - boxW) / 2 - 8;
      const gapY = 18;
      const topPad = 26;

      // 상단 라벨
      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('↑ T (taken)', 6, 14);
      ctx.textAlign = 'right';
      ctx.fillText('N (not-taken) ↓', cssW - 6, 14);

      const ys: number[] = [];
      STATES.forEach((st, i) => {
        const y = topPad + i * (boxH + gapY);
        ys.push(y);
        const taken = st.pred === 'T';
        ctx.fillStyle = taken ? col.accent : col.surface;
        ctx.globalAlpha = taken ? 0.85 : 1;
        ctx.strokeStyle = taken ? col.accent : col.border;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.rect(boxX, y, boxW, boxH);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
        ctx.fillStyle = taken ? col.surface : col.text;
        ctx.textAlign = 'left';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(st.code, boxX + 10, y + boxH / 2 - 7);
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(st.name, boxX + 10, y + boxH / 2 + 9);
        // 예측 배지
        ctx.textAlign = 'right';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillStyle = taken ? col.surface : col.muted;
        ctx.fillText(`예측 ${st.pred}`, boxX + boxW - 10, y + boxH / 2);
      });

      // 전이 화살표 (왼쪽: T는 위로, 오른쪽: N은 아래로)
      const drawArrow = (x: number, y1: number, y2: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.stroke();
        const dir = y2 > y1 ? 1 : -1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y2);
        ctx.lineTo(x - 4, y2 - dir * 7);
        ctx.lineTo(x + 4, y2 - dir * 7);
        ctx.fill();
      };

      const leftX = boxX - 14;
      const rightX = boxX + boxW + 14;
      // T: i -> i-1 (위로); 최상단은 self(포화)
      for (let i = 1; i < STATES.length; i++) {
        drawArrow(leftX, ys[i] + boxH / 2, ys[i - 1] + boxH / 2, '#2e9e5b');
      }
      // N: i -> i+1 (아래로); 최하단은 self(포화)
      for (let i = 0; i < STATES.length - 1; i++) {
        drawArrow(rightX, ys[i] + boxH / 2, ys[i + 1] + boxH / 2, '#c0392b');
      }
      // 포화 self-loop 표시(텍스트)
      ctx.fillStyle = '#2e9e5b';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('T↻', leftX, ys[0] + boxH / 2 - 4);
      ctx.fillStyle = '#c0392b';
      ctx.fillText('N↻', rightX, ys[3] + boxH / 2 + 4);

      // 범례
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#2e9e5b';
      ctx.fillText('초록=실제 Taken → 위로', cssW / 2 - 2, cssH - 26);
      ctx.fillStyle = '#c0392b';
      ctx.fillText('빨강=실제 Not-taken → 아래로', cssW / 2 - 2, cssH - 12);
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
      <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block', maxWidth: 360, margin: '0 auto' }} />
      <figcaption>
        <strong>2-bit saturating counter</strong>(bimodal 예측기, J. E. Smith 1981)의 상태기계입니다. 네
        상태를 위(Taken 쪽)부터 아래(Not-taken 쪽)로 쌓았습니다. 실제로 분기가 taken이면 위로(초록),
        not-taken이면 아래로(빨강) 한 칸 움직이고, 양 끝에서는 포화합니다. 핵심은 <strong>hysteresis</strong>:
        "강하게 Taken"에 있을 때 한 번 빗나가도 "약하게 Taken"으로만 내려가 <em>예측은 여전히 T</em>입니다.
        방향을 뒤집으려면 연속 두 번 빗나가야 하죠 — 루프의 마지막 한 번처럼 가끔 어긋나는 분기를 1-bit보다
        잘 견딥니다.
      </figcaption>
    </figure>
  );
}
