import { useEffect, useRef } from 'react';

// 정적 도식 — store buffer가 만드는 store→load 재정렬(x86 TSO의 유일한 허용 재정렬).
// 코어 두 개, 각자 store buffer. 두 코어가 각자 store 뒤 상대 변수를 load → 둘 다 0을 볼 수 있다.
// (Dekker 류). 메모리에 도달 전 store가 버퍼에 머무는 동안 자기 load가 먼저 메모리를 친다.

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
  const border = cssVar('--border', '#ccc');
  const surface = cssVar('--surface', '#fff');
  const red = '#e0564b';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  function box(x: number, y: number, w: number, h: number, stroke: string, fill: string) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 7);
    ctx.fill();
    ctx.stroke();
  }

  // 두 코어
  const colW = 150;
  const c0x = 14;
  const c1x = W - 14 - colW;
  const coreY = 24;
  const coreH = 110;

  for (const [cx, name, varName, val] of [
    [c0x, '코어 0', 'x = 1', 'r1 = y'],
    [c1x, '코어 1', 'y = 1', 'r2 = x'],
  ] as [number, string, string, string][]) {
    box(cx, coreY, colW, coreH, accent, surface);
    ctx.fillStyle = accent;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(name, cx + 10, coreY + 16);
    ctx.fillStyle = text;
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('store ' + varName, cx + 10, coreY + 42);
    ctx.fillStyle = red;
    ctx.fillText('load  ' + val, cx + 10, coreY + 64);
    ctx.fillStyle = muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('load가 store를', cx + 10, coreY + 86);
    ctx.fillText('추월할 수 있음 ↓', cx + 10, coreY + 99);
  }

  // store buffer 두 개
  const sbY = coreY + coreH + 20;
  const sbH = 40;
  for (const [cx, label] of [
    [c0x, 'x=1 대기'],
    [c1x, 'y=1 대기'],
  ] as [number, string][]) {
    box(cx, sbY, colW, sbH, border, surface);
    ctx.fillStyle = muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('store buffer', cx + 8, sbY + 12);
    ctx.fillStyle = '#d98a2b';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText(label, cx + 8, sbY + 28);
  }

  // 공유 메모리
  const memY = sbY + sbH + 26;
  const memH = 44;
  box(14, memY, W - 28, memH, text, surface);
  ctx.fillStyle = text;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('공유 메모리 / 코히런시 도메인', W / 2, memY + 14);
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillStyle = red;
  ctx.fillText('x = 0      y = 0', W / 2, memY + 31);

  // store는 버퍼→메모리(점선, 나중), load는 메모리에서 바로(빨강 실선)
  ctx.strokeStyle = '#d98a2b';
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.6;
  for (const cx of [c0x + 30, c1x + colW - 30]) {
    ctx.beginPath();
    ctx.moveTo(cx, sbY + sbH);
    ctx.lineTo(cx, memY);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#d98a2b';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('(나중에 flush)', W / 2, (sbY + sbH + memY) / 2);

  // 결과
  ctx.fillStyle = red;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('가능한 결과:  r1 = 0  그리고  r2 = 0', W / 2, H - 16);
}

export default function StoreBufferReorder() {
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
        각 코어는 store를 곧장 메모리에 쓰지 않고 <strong>store buffer</strong>에 잠깐 넣고 다음 명령으로
        넘어갑니다(빠르니까). 그 사이 자기 <strong>load는 메모리를 먼저</strong> 칩니다. 그래서 두 코어가
        각자 <code>store</code> 직후 <em>상대</em> 변수를 <code>load</code>하면, 양쪽 store가 아직 버퍼에
        머무는 동안 양쪽 load가 옛 값 0을 읽어 <strong>r1 = r2 = 0</strong>이 됩니다 — 순차적으로는
        불가능한 결과입니다. 이것이 x86 <strong>TSO</strong>가 허용하는 <em>유일한</em> 재정렬
        (store→load)입니다. 막으려면 두 store와 load 사이에 <code>mfence</code>(전체 배리어)를 넣어
        store buffer를 비웁니다.
      </figcaption>
    </figure>
  );
}
