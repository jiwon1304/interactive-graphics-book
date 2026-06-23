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

// in-order vs OoO. 프로그램:
//   I1: ld r1, [mem]    (캐시 미스 → 결과가 늦게 옴)
//   I2: add r3, r1, r4  (I1에 의존 → I1 기다려야)
//   I3: mul r5, r6, r7  (독립!)
//   I4: sub r8, r9, r10 (독립!)
// in-order: I2가 막히면 그 뒤 I3·I4도 같이 멈춘다(낭비).
// OoO: I3·I4를 먼저 실행해 미스 지연을 메운다.

export default function InOrderVsOoO() {
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
      const cssH = 290;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.textBaseline = 'middle';

      const NCYCLE = 9;
      const labelW = 34;
      const x0 = labelW + 6;
      const gridW = cssW - x0 - 10;
      const cell = gridW / NCYCLE;
      const rowH = 22;
      const gap = 3;

      type Seg = { c: number; len: number; kind: 'busy' | 'stall' | 'load' };
      const KCOL = { busy: col.accent, stall: '#e0564b', load: '#e0a23b' };

      const block = (
        title: string,
        top: number,
        rows: { name: string; segs: Seg[] }[],
        finish: number,
      ) => {
        ctx.fillStyle = col.text;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(title, x0, top - 10);
        // cycle 눈금
        ctx.fillStyle = col.muted;
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let c = 0; c < NCYCLE; c++) ctx.fillText(`${c + 1}`, x0 + c * cell + cell / 2, top + 2);

        rows.forEach((r, i) => {
          const y = top + 12 + i * (rowH + gap);
          ctx.fillStyle = col.text;
          ctx.font = 'bold 10px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(r.name, 2, y + rowH / 2);
          r.segs.forEach((s) => {
            const x = x0 + s.c * cell;
            const w = s.len * cell;
            ctx.fillStyle = (KCOL as Record<string, string>)[s.kind];
            ctx.globalAlpha = s.kind === 'stall' ? 0.5 : 0.85;
            ctx.fillRect(x + 1, y, w - 2, rowH);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = col.border;
            ctx.lineWidth = 0.7;
            ctx.strokeRect(x + 1, y, w - 2, rowH);
          });
        });
        // 완료선
        const fx = x0 + finish * cell;
        ctx.strokeStyle = col.text;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(fx, top + 8);
        ctx.lineTo(fx, top + 12 + rows.length * (rowH + gap));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col.text;
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`완료 ${finish}c`, fx + 3, top + 4);
      };

      // in-order: I1 load(미스, cycle1~4), I2 add 의존(cycle5), I3 mul(I2 뒤, cycle6), I4 sub(cycle7)
      // 핵심: I3/I4가 독립인데도 I2 뒤에서 줄 서서 기다림 → stall로 표현
      block('in-order (독립 명령도 줄선다)', 28, [
        { name: 'I1 ld', segs: [{ c: 0, len: 4, kind: 'load' }] },
        { name: 'I2 add', segs: [{ c: 1, len: 3, kind: 'stall' }, { c: 4, len: 1, kind: 'busy' }] },
        { name: 'I3 mul', segs: [{ c: 1, len: 4, kind: 'stall' }, { c: 5, len: 1, kind: 'busy' }] },
        { name: 'I4 sub', segs: [{ c: 1, len: 5, kind: 'stall' }, { c: 6, len: 1, kind: 'busy' }] },
      ], 7);

      // OoO: I1 load(미스 1~4), I3/I4 독립이라 미스 동안 먼저 실행(cycle2,3), I2는 load 끝난 뒤(cycle5)
      block('out-of-order (미스를 메운다)', 168, [
        { name: 'I1 ld', segs: [{ c: 0, len: 4, kind: 'load' }] },
        { name: 'I2 add', segs: [{ c: 1, len: 3, kind: 'stall' }, { c: 4, len: 1, kind: 'busy' }] },
        { name: 'I3 mul', segs: [{ c: 1, len: 1, kind: 'busy' }] },
        { name: 'I4 sub', segs: [{ c: 2, len: 1, kind: 'busy' }] },
      ], 5);

      // 범례
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      const leg: [string, string][] = [
        ['busy', '실행'],
        ['stall', '대기'],
        ['load', 'load(미스)'],
      ];
      let lx = x0;
      leg.forEach(([k, t]) => {
        ctx.fillStyle = (KCOL as Record<string, string>)[k];
        ctx.fillRect(lx, cssH - 15, 11, 10);
        ctx.fillStyle = col.muted;
        ctx.fillText(t, lx + 15, cssH - 10);
        lx += 92;
      });
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
        같은 네 명령(I1 load는 캐시 미스로 지연, I2는 그 값에 의존, I3·I4는 <strong>독립</strong>)을 두 방식으로
        실행합니다. <strong>in-order</strong>는 I2가 load를 기다리느라 막히면, 프로그램 순서를 어길 수 없어
        정작 준비된 I3·I4도 그 뒤에서 함께 멈춥니다(빨강 대기). <strong>out-of-order</strong>는 load가 메모리에서 오는 동안 독립적인
        I3·I4를 <em>먼저</em> 실행해 그 지연을 메웁니다 — 더 일찍 끝납니다. 이것이 OoO의 본질입니다: 한 명령이
        막혀도 <strong>의존이 없는 다른 일을 찾아 실행</strong>해 빈 cycle을 메운다. (cycle 수는 도식용 예시.)
      </figcaption>
    </figure>
  );
}
