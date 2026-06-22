import { useEffect, useRef } from 'react';

// 정적 도식 — CPU↔GPU 전송 시간 계산기.
// 전송 시간 = 데이터 크기 ÷ 유효 대역폭. 대표로 256 MB · x16 · pinned에서 PCIe 3/4/5의 전송 시간을
// 한 프레임 예산(16.6ms)과 막대로 비교. 레인 폭·pageable의 영향은 figcaption.

// PCIe x16 방향당 유효 대역폭(GB/s, 128b/130b 인코딩 후). 1 GB/s ≈ 1 MB/ms.
const GEN_X16: Record<string, number> = { '3.0': 15.75, '4.0': 31.5, '5.0': 63 };
const SIZE_MB = 256;
const BUDGET_MS = 16.6; // 60fps 한 프레임

const W = 380;
const H = 190;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  ctx.clearRect(0, 0, W, H);
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  const gens = ['3.0', '4.0', '5.0'];
  const times = gens.map((g) => SIZE_MB / GEN_X16[g]);
  const maxT = Math.max(BUDGET_MS * 1.4, ...times);
  const sx = (W - 110) / maxT;
  const budgetX = 64 + BUDGET_MS * sx;

  gens.forEach((g, i) => {
    const y = 28 + i * 42;
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    ctx.fillText('PCIe ' + g, 58, y + 11);
    const w = times[i] * sx;
    const over = times[i] > BUDGET_MS;
    ctx.fillStyle = over ? '#e0564b' : accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(64, y, Math.max(2, w), 22);
    ctx.globalAlpha = 1;
    ctx.fillStyle = text;
    ctx.textAlign = 'left';
    ctx.fillText(times[i].toFixed(1) + ' ms', 64 + Math.max(2, w) + 6, y + 11);
  });

  // 60fps 예산선
  ctx.strokeStyle = '#e0564b';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(budgetX, 16);
  ctx.lineTo(budgetX, H - 26);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#e0564b';
  ctx.textAlign = 'left';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('16.6ms (60fps)', budgetX + 4, H - 30);

  ctx.fillStyle = muted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`${SIZE_MB} MB · x16 · pinned`, 8, H - 12);
}

export default function TransferCalculator() {
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
        전송 시간 = 크기 ÷ 대역폭입니다. 256 MB를 x16 · pinned로 보낼 때, PCIe 세대가 올라갈수록 대략
        2배씩 빨라집니다(gen3/4/5 x16 ≈ 15.75 / 31.5 / 63 GB/s, 방향당). 레인 폭이 좁아지면(x8·x4)
        대역폭이 비례해 줄어 막대가 길어집니다. <strong>pinned(page-locked)</strong> 대신 pageable
        메모리를 쓰면 드라이버가 임시 pinned 버퍼로 한 번 더 복사하므로 유효 대역폭이 크게 떨어집니다
        (절대값은 환경 의존). 막대가 빨간 점선(16.6ms)을 넘으면 그 데이터를 <em>매 프레임</em> 보내는
        설계는 60fps를 못 지킵니다 — 큰 정적 자원은 한 번만 올리고 GPU에 상주시켜야 합니다.
      </figcaption>
    </figure>
  );
}
