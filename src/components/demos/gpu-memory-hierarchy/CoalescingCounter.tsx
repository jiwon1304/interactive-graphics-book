import { useEffect, useRef } from 'react';

// 정적 도식 — 메모리 합치기(coalescing) 트랜잭션 카운터.
// 워프 32 스레드의 전역 메모리 접근이 몇 개의 128B 트랜잭션으로 묶이는지 센다.
// 대표 상태: 4B 워드 · 스트라이드 2 — 스레드가 한 칸 건너뛰며 접근해 2개 세그먼트로 흩어지고
// 이동한 바이트의 절반이 버려져 효율 50%. 연속(스트라이드 1=100%)·스트라이드 폭증은 figcaption.

const W = 380;
const H = 210;
const LANES = 32;
const SEG = 128; // 캐시 라인/트랜잭션 단위(byte)
const SECTOR = 32; // L2/DRAM 섹터(byte)
const WORD = 4; // 스레드당 워드(byte)
const STRIDE = 2; // 요소 스트라이드(대표값)
const OFFSET = 0;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const addrs: number[] = [];
  for (let i = 0; i < LANES; i++) addrs.push(OFFSET + i * STRIDE * WORD);
  const maxByte = OFFSET + (LANES - 1) * STRIDE * WORD + WORD;
  const spanSegs = Math.ceil(maxByte / SEG);
  const totalBytes = spanSegs * SEG;
  const sx = W / totalBytes;

  const touched = new Set<number>();
  for (const a of addrs) {
    for (let b = a; b < a + WORD; b++) touched.add(Math.floor(b / SEG));
  }
  const transactions = touched.size;
  const useful = LANES * WORD;
  const moved = transactions * SEG;
  const eff = useful / moved;

  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');

  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.font = '12px system-ui, sans-serif';

  const memY = 64;
  const memH = 44;

  for (let s = 0; s < spanSegs; s++) {
    const x = s * SEG * sx;
    const segW = SEG * sx;
    ctx.fillStyle = touched.has(s) ? accent : cssVar('--surface', '#eee');
    ctx.globalAlpha = touched.has(s) ? 0.35 : 1;
    ctx.fillRect(x, memY, segW - 1, memH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    for (let k = 1; k < SEG / SECTOR; k++) {
      const xx = x + k * SECTOR * sx;
      ctx.beginPath();
      ctx.moveTo(xx, memY);
      ctx.lineTo(xx, memY + memH);
      ctx.stroke();
    }
    ctx.strokeStyle = touched.has(s) ? accent : border;
    ctx.lineWidth = touched.has(s) ? 2 : 1;
    ctx.strokeRect(x, memY, segW - 1, memH);
  }
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText('전역 메모리 — 128B 트랜잭션(굵은 칸) · 32B 섹터', 2, memY - 14);

  for (let i = 0; i < LANES; i++) {
    const x = addrs[i] * sx;
    const wmark = Math.max(1.5, WORD * sx);
    ctx.fillStyle = text;
    ctx.fillRect(x, memY + memH + 6, wmark, 10);
  }
  ctx.fillStyle = muted;
  ctx.fillText('워프의 32 스레드 접근 ↑ (스트라이드 ' + STRIDE + ')', 2, memY + memH + 26);

  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = text;
  ctx.fillText(`트랜잭션 ${transactions}개 · 이동 ${moved}B · 유효 ${useful}B`, 2, H - 32);
  const pct = Math.round(eff * 100);
  ctx.fillStyle = eff > 0.6 ? '#2e9e5b' : eff > 0.25 ? '#d8922a' : '#e0564b';
  ctx.fillText(`대역폭 효율 ${pct}% (유효 ÷ 이동)`, 2, H - 14);
}

export default function CoalescingCounter() {
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
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{ width: '100%', maxWidth: W, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}
        />
      </div>

      <figcaption>
        워프의 32 스레드가 전역 메모리를 동시에 읽으면, 하드웨어는 그 접근들을 128B 단위{' '}
        <strong>트랜잭션</strong>으로 묶습니다(합치기, coalescing). 여기 그린 상태는 4B 워드를{' '}
        <strong>스트라이드 2</strong>로 읽는 경우 — 스레드가 한 칸씩 건너뛰며 접근해 두 개의 128B
        칸에 흩어지고, 이동한 256B 중 절반만 실제로 쓰여 <em>효율 50%</em>가 됩니다. 스트라이드 1·오프셋
        0이면 32 스레드가 연속 128B 한 칸에 딱 맞아 <strong>트랜잭션 1개, 효율 100%</strong>입니다.
        스트라이드를 더 키우면 스레드마다 다른 128B 칸을 건드려 트랜잭션이 늘고 효율이 1/스트라이드 쪽으로
        떨어집니다. 정렬되지 않은 오프셋은 한 칸을 더 요구합니다(미정렬 페널티). 합치기는 <em>유효</em>{' '}
        대역폭을 좌우합니다.
      </figcaption>
    </figure>
  );
}
