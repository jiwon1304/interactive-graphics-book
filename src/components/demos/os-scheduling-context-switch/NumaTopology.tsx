import { useEffect, useRef } from 'react';

// 정적 도식 — 2-노드 NUMA. 각 노드 = CPU + 로컬 DRAM. 노드 간 인터커넥트.
// 로컬 접근(짧은 화살표, 1×) vs 원격 접근(인터커넥트 건너, 대략 3–6×).

const W = 360;
const H = 250;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');

  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('NUMA — 메모리가 노드마다 따로', 14, 16);

  const nodeW = 150;
  const nodeH = 130;
  const ny = 36;
  const lx = 16;
  const rx = W - 16 - nodeW;

  function node(x: number, label: string) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.05;
    ctx.fillRect(x, ny, nodeW, nodeH);
    ctx.globalAlpha = 1;
    ctx.strokeRect(x, ny, nodeW, nodeH);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 8, ny + 14);

    // CPU box
    const cpuY = ny + 28;
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x + 14, cpuY, nodeW - 28, 34);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = accent;
    ctx.strokeRect(x + 14, cpuY, nodeW - 28, 34);
    ctx.fillStyle = text;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CPU', x + nodeW / 2, cpuY + 17);

    // DRAM box
    const memY = cpuY + 48;
    ctx.fillStyle = '#e0a23b';
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x + 14, memY, nodeW - 28, 30);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#e0a23b';
    ctx.strokeRect(x + 14, memY, nodeW - 28, 30);
    ctx.fillStyle = text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('로컬 DRAM', x + nodeW / 2, memY + 15);

    return { cpuY: cpuY + 17, memY: memY + 15 };
  }

  const L = node(lx, '노드 0');
  node(rx, '노드 1');

  // 로컬 접근 화살표 (노드 0 내부, 1×)
  ctx.strokeStyle = '#2e9e5b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lx + nodeW / 2 - 30, L.cpuY + 10);
  ctx.lineTo(lx + nodeW / 2 - 30, L.memY - 6);
  ctx.stroke();
  ctx.fillStyle = '#2e9e5b';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('로컬 1×', lx + nodeW / 2 - 22, (L.cpuY + L.memY) / 2 + 2);

  // 인터커넥트 (두 노드 사이)
  const midY = ny + 28 + 17; // CPU 높이
  ctx.strokeStyle = '#e0564b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lx + nodeW, midY);
  ctx.lineTo(rx, midY);
  ctx.stroke();
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('인터커넥트', (lx + nodeW + rx) / 2, midY - 8);
  // 원격 배수 라벨
  ctx.fillStyle = '#e0564b';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('원격 ≈ 3–6×', (lx + nodeW + rx) / 2, midY + 12);

  // 캡션 라인
  ctx.fillStyle = text;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('스레드는 자기 노드 메모리에 두는 게 빠름', 14, H - 26);
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('→ NUMA-aware 스케줄링 + first-touch 할당', 14, H - 10);
}

export default function NumaTopology() {
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
        큰 서버는 메모리가 한 덩어리가 아니라 노드(소켓)마다 따로 붙어 있습니다. CPU가 자기 노드의
        DRAM에 접근하는 <strong>로컬</strong> 접근은 빠르지만, 인터커넥트를 건너 다른 노드의 메모리를
        읽는 <strong>원격</strong> 접근은 대략 3–6배 느립니다(토폴로지·세대 의존). 그래서 스케줄러는
        스레드를 그 데이터가 있는 노드 위에 두려 하고(NUMA-aware), 흔히 메모리를 "처음 만진" CPU의
        노드에 할당합니다(first-touch). 스레드가 노드를 옮겨 다니면 원격 접근이 늘어 느려집니다.
      </figcaption>
    </figure>
  );
}
