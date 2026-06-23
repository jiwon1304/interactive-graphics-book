import { useEffect, useRef } from 'react';

// 정적 도식 — 마스킹과 gather.
// 위: mask register(k)가 lane별 on/off로 어떤 lane에만 연산/저장할지 고른다.
// 아래: gather가 인덱스 벡터로 흩어진 주소에서 lane을 끌어모은다.

const W = 360;
const H = 300;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

const MASK = [1, 0, 1, 1, 0, 1, 1, 0]; // 8 lanes
const IDX = [2, 5, 0, 6]; // gather 인덱스

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');

  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  // --- 마스킹 ---
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('마스킹 — k 레지스터가 lane을 켜고 끔', 12, 16);

  const n = MASK.length;
  const cell = 36;
  const gap = 3;
  const rowW = n * cell + (n - 1) * gap;
  const mx0 = (W - rowW) / 2;

  // mask bit row
  const mRowY = 32;
  for (let i = 0; i < n; i++) {
    const x = mx0 + i * (cell + gap);
    ctx.fillStyle = MASK[i] ? accent : 'transparent';
    ctx.globalAlpha = MASK[i] ? 0.25 : 1;
    ctx.fillRect(x, mRowY, cell, 18);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, mRowY, cell, 18);
    ctx.fillStyle = MASK[i] ? text : muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(MASK[i]), x + cell / 2, mRowY + 9);
  }
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('k = 10110110', mx0, mRowY - 6 + 0);

  // result row (only masked lanes written)
  const rRowY = mRowY + 30;
  for (let i = 0; i < n; i++) {
    const x = mx0 + i * (cell + gap);
    const on = MASK[i] === 1;
    ctx.fillStyle = on ? '#2e9e5b' : border;
    ctx.globalAlpha = on ? 0.45 : 0.12;
    ctx.fillRect(x, rRowY, cell, cell);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = on ? text : border;
    ctx.lineWidth = on ? 1.8 : 1;
    ctx.strokeRect(x, rRowY, cell, cell);
    ctx.fillStyle = on ? text : muted;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(on ? '✓' : '—', x + cell / 2, rRowY + cell / 2 + 1);
  }
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('1인 lane만 연산·저장, 0은 그대로 둠', mx0, rRowY + cell + 14);

  // --- gather ---
  const gTitle = rRowY + cell + 38;
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('gather — 인덱스로 흩어진 값을 끌어모음', 12, gTitle);

  // memory row (8 slots)
  const memY = gTitle + 14;
  const mcell = 36;
  const mgap = 3;
  const memW = 8 * mcell + 7 * mgap;
  const gx0 = (W - memW) / 2;
  for (let i = 0; i < 8; i++) {
    const x = gx0 + i * (mcell + mgap);
    const picked = IDX.includes(i);
    ctx.fillStyle = picked ? accent : border;
    ctx.globalAlpha = picked ? 0.3 : 0.1;
    ctx.fillRect(x, memY, mcell, mcell);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, memY, mcell, mcell);
    ctx.fillStyle = picked ? text : muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('m' + i, x + mcell / 2, memY + mcell / 2 + 1);
  }
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('메모리 (흩어진 주소)', gx0, memY - 6);

  // gathered register (4 lanes) + arrows
  const regY = memY + mcell + 30;
  const reg = IDX.length;
  const regW = reg * mcell + (reg - 1) * mgap;
  const rgx0 = (W - regW) / 2;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < reg; i++) {
    const dx = rgx0 + i * (mcell + mgap) + mcell / 2;
    const sx = gx0 + IDX[i] * (mcell + mgap) + mcell / 2;
    ctx.beginPath();
    ctx.moveTo(sx, memY + mcell);
    ctx.lineTo(dx, regY);
    ctx.stroke();
  }
  for (let i = 0; i < reg; i++) {
    const x = rgx0 + i * (mcell + mgap);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x, regY, mcell, mcell);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = text;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, regY, mcell, mcell);
    ctx.fillStyle = text;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('m' + IDX[i], x + mcell / 2, regY + mcell / 2 + 1);
  }
}

export default function MaskGather() {
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
        조건문을 벡터로 다루는 두 도구입니다. <strong>마스킹</strong>(위)은 lane마다 1/0인 mask
        레지스터(AVX-512의 <code>k1</code>–<code>k7</code>)로 어떤 lane에만 결과를 쓸지 고릅니다 —
        <code>if</code>를 분기 없이 처리하는 법입니다. <strong>gather</strong>(아래)는 인덱스 벡터가
        가리키는, 메모리에 흩어진 값들을 한 명령으로 레지스터에 끌어모읍니다(반대 방향 저장이
        scatter). 연속 load보다 느리지만, AoS나 불규칙 접근을 벡터화할 때 꼭 필요합니다.
      </figcaption>
    </figure>
  );
}
