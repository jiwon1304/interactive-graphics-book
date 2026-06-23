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

// register renaming이 WAW/WAR(가짜 의존)를 없애는 모습.
// 원본(architectural r1 재사용):
//   I1: r1 = A + B
//   I2: C  = r1 * 2     (RAW on r1 — 진짜 의존, 못 없앰)
//   I3: r1 = D + E      (WAW with I1, WAR with I2 — 가짜)
// rename 후(물리 레지스터 p..):
//   I1: p10 = A + B
//   I2: C   = p10 * 2
//   I3: p11 = D + E      ← 다른 물리 레지스터 → I1/I2와 독립, 병렬 가능

export default function RegisterRenaming() {
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
      const cssH = 280;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.textBaseline = 'middle';

      const colW = (cssW - 24) / 2;
      const leftX = 12;
      const rightX = 12 + colW;
      const rowH = 40;
      const top = 48;

      const drawCol = (
        x: number,
        title: string,
        lines: { txt: string; note?: string; noteColor?: string }[],
      ) => {
        ctx.fillStyle = col.text;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, x + colW / 2, 22);
        lines.forEach((ln, i) => {
          const y = top + i * rowH;
          ctx.fillStyle = col.surface;
          ctx.strokeStyle = col.border;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.rect(x + 4, y, colW - 8, rowH - 8);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = col.text;
          ctx.font = 'bold 12px ui-monospace, monospace';
          ctx.textAlign = 'left';
          ctx.fillText(ln.txt, x + 12, y + (rowH - 8) / 2 - 7);
          if (ln.note) {
            ctx.fillStyle = ln.noteColor || col.muted;
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillText(ln.note, x + 12, y + (rowH - 8) / 2 + 8);
          }
        });
      };

      drawCol(leftX, '원본 (r1 재사용)', [
        { txt: 'I1: r1 = A+B', note: '' },
        { txt: 'I2: C = r1*2', note: 'RAW on r1 (진짜)', noteColor: '#2e9e5b' },
        { txt: 'I3: r1 = D+E', note: 'WAW/WAR (가짜)', noteColor: '#c0392b' },
      ]);

      drawCol(rightX, 'rename 후', [
        { txt: 'I1: p10 = A+B', note: '' },
        { txt: 'I2: C = p10*2', note: 'RAW 유지 (p10)', noteColor: '#2e9e5b' },
        { txt: 'I3: p11 = D+E', note: '독립! I1과 병렬', noteColor: '#2e9e5b' },
      ]);

      // 화살표 (원본 → rename)
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 1.6;
      const ay = top + rowH;
      ctx.beginPath();
      ctx.moveTo(leftX + colW - 2, ay);
      ctx.lineTo(rightX + 4, ay);
      ctx.stroke();
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.moveTo(rightX + 4, ay);
      ctx.lineTo(rightX - 4, ay - 5);
      ctx.lineTo(rightX - 4, ay + 5);
      ctx.fill();

      // 하단 설명
      ctx.fillStyle = col.text;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('I3가 r1을 또 쓰는 건 "이름 충돌"일 뿐 데이터 의존이 아니다.', cssW / 2, cssH - 30);
      ctx.fillStyle = col.muted;
      ctx.fillText('다른 물리 레지스터(p11)를 주면 WAW/WAR가 사라진다.', cssW / 2, cssH - 14);
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
        <strong>register renaming</strong>이 가짜 의존을 없애는 모습입니다. 왼쪽 원본에서 I3가 <code>r1</code>을
        다시 쓰는 건 I1과 <strong>WAW</strong>(둘 다 r1에 씀), I2와 <strong>WAR</strong>(I2가 r1을 읽기 전에
        I3가 덮어쓰면 안 됨) 충돌입니다. 하지만 이건 <em>데이터</em> 의존이 아니라 같은 이름(r1)을 재활용해서
        생긴 <em>이름</em> 충돌일 뿐입니다. 오른쪽처럼 I3에게 <strong>다른 물리 레지스터</strong>(p11)를 주면
        I1·I2와 완전히 독립이 되어 병렬·비순차로 실행할 수 있습니다. 단, I2가 I1 결과를 쓰는{' '}
        <strong>RAW</strong>(초록)는 진짜 의존이라 renaming으로도 못 없앱니다.
      </figcaption>
    </figure>
  );
}
