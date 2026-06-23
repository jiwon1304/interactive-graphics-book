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

// OoO 엔진의 한 순간(스냅샷). 위→아래 스택:
//  1) Front-end: fetch/decode/RENAME (in-order)
//  2) Reservation stations / scheduler: 피연산자 준비되면 깨어남 (OoO 실행)
//  3) ROB: 프로그램 순서대로 보관, 맨 앞부터 in-order retire
// 한 명령이 "대기→실행→완료(미retire)→retire"의 어디에 있는지 색으로.

type St = 'wait' | 'exec' | 'done';
const COLOR: Record<St, string> = { wait: '#e0a23b', exec: '#2e9e5b', done: '#4f9dde' };
const LABEL: Record<St, string> = { wait: '대기', exec: '실행', done: '완료' };

export default function OoODataflow() {
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
      const cssH = 320;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.textBaseline = 'middle';

      const x0 = 12;
      const W = cssW - 24;

      const sectionTitle = (txt: string, sub: string, y: number) => {
        ctx.fillStyle = col.text;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(txt, x0, y);
        ctx.fillStyle = col.muted;
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(sub, x0 + W, y);
      };

      // ---- 1) Front-end (in-order) ----
      sectionTitle('Front-end: fetch → decode → rename', 'in-order →', 18);
      const feY = 30;
      const feH = 30;
      const stages = ['fetch', 'decode', 'rename'];
      const sW = W / stages.length;
      stages.forEach((s, i) => {
        const x = x0 + i * sW;
        ctx.fillStyle = col.surface;
        ctx.strokeStyle = col.accent;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.rect(x + 2, feY, sW - 4, feH);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = col.text;
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s, x + sW / 2, feY + feH / 2);
      });

      // 화살표 아래로
      const downArrow = (y1: number, y2: number) => {
        ctx.strokeStyle = col.muted;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cssW / 2, y1);
        ctx.lineTo(cssW / 2, y2);
        ctx.stroke();
        ctx.fillStyle = col.muted;
        ctx.beginPath();
        ctx.moveTo(cssW / 2, y2);
        ctx.lineTo(cssW / 2 - 5, y2 - 7);
        ctx.lineTo(cssW / 2 + 5, y2 - 7);
        ctx.fill();
      };
      downArrow(feY + feH, feY + feH + 18);

      // ---- 2) Reservation stations (OoO) ----
      const rsTitleY = feY + feH + 30;
      sectionTitle('Reservation Stations / scheduler', '피연산자 오면 실행', rsTitleY);
      const rsY = rsTitleY + 12;
      const rsH = 34;
      // 각 항목: 명령 + 상태. 비순차로 실행됨을 강조.
      const rs: { name: string; st: St }[] = [
        { name: 'mul', st: 'exec' },
        { name: 'add', st: 'wait' },
        { name: 'ld', st: 'exec' },
        { name: 'sub', st: 'wait' },
      ];
      const rsW = W / rs.length;
      rs.forEach((it, i) => {
        const x = x0 + i * rsW;
        ctx.fillStyle = COLOR[it.st];
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = COLOR[it.st];
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.rect(x + 2, rsY, rsW - 4, rsH);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(it.name, x + rsW / 2, rsY + rsH / 2 - 6);
        ctx.font = '9px system-ui, sans-serif';
        ctx.fillText(LABEL[it.st], x + rsW / 2, rsY + rsH / 2 + 8);
      });

      downArrow(rsY + rsH, rsY + rsH + 18);

      // ---- 3) ROB (in-order retire) ----
      const robTitleY = rsY + rsH + 30;
      sectionTitle('Reorder Buffer (ROB)', 'in-order retire →', robTitleY);
      const robY = robTitleY + 12;
      const robH = 40;
      // 프로그램 순서: ld, mul, add, sub. 맨 앞(ld)은 done이지만 그 앞이 없으니 retire 대기.
      // 핵심: 실행은 뒤죽박죽이어도, 맨 앞부터 순서대로만 retire.
      const rob: { name: string; st: St }[] = [
        { name: 'ld', st: 'done' },
        { name: 'mul', st: 'exec' },
        { name: 'add', st: 'wait' },
        { name: 'sub', st: 'wait' },
      ];
      const robW = W / rob.length;
      rob.forEach((it, i) => {
        const x = x0 + i * robW;
        ctx.fillStyle = COLOR[it.st];
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = i === 0 ? col.text : COLOR[it.st];
        ctx.lineWidth = i === 0 ? 2.2 : 1.4;
        ctx.beginPath();
        ctx.rect(x + 2, robY, robW - 4, robH);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(it.name, x + robW / 2, robY + robH / 2 - 6);
        ctx.font = '9px system-ui, sans-serif';
        ctx.fillText(LABEL[it.st], x + robW / 2, robY + robH / 2 + 8);
      });
      // head 표시
      ctx.fillStyle = col.text;
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('↑ head: 여기부터 순서대로 retire', x0 + robW / 2 + 30, robY + robH + 12);

      // 범례
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      let lx = x0;
      (['wait', 'exec', 'done'] as St[]).forEach((s) => {
        ctx.fillStyle = COLOR[s];
        ctx.fillRect(lx, cssH - 16, 12, 10);
        ctx.fillStyle = col.muted;
        ctx.fillText(LABEL[s], lx + 16, cssH - 11);
        lx += 70;
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
        비순차 실행 엔진의 한 순간입니다. 위에서 아래로 — <strong>front-end</strong>는 명령을 프로그램
        순서대로 fetch·decode·rename하고, <strong>reservation station</strong>에 풀어 둡니다. 거기서는 순서와
        무관하게 <em>피연산자가 준비된 명령부터</em> 실행됩니다(<code>mul</code>·<code>ld</code>는 실행 중,
        <code>add</code>·<code>sub</code>는 입력 대기). 그래도 결과는 <strong>ROB</strong>에 프로그램 순서대로
        담겨, 맨 앞(head)부터 <strong>순서대로만 retire</strong>됩니다 — 여기 <code>ld</code>는 완료됐지만
        head라서 바로 retire되고, 그 뒤는 자기 차례를 기다립니다. "실행은 뒤죽박죽, 완료(commit)는 제 순서대로."
      </figcaption>
    </figure>
  );
}
