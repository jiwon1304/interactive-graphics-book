import { useEffect, useRef } from 'react';

// 정적 도식 — PCIe SR-IOV: 한 물리 장치(PF) 아래 여러 VF, 각 VF가 한 VM에 직접 할당(passthrough).
// 트리: GPU(PF) → VF0/VF1/VF2 → VM A/B/C. PF는 관리, VF는 경량 PCIe 기능.

const W = 360;
const H = 280;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  const box = (x: number, y: number, w: number, h: number, col: string, title: string, sub: string) => {
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.16;
    roundRect(ctx, x, y, w, h, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 7);
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(title, x + w / 2, y + (sub ? 15 : h / 2));
    if (sub) {
      ctx.fillStyle = muted;
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(sub, x + w / 2, y + 29);
    }
  };

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  // PF (GPU 물리 기능)
  const pfX = 100, pfY = 14, pfW = 160, pfH = 40;
  box(pfX, pfY, pfW, pfH, accent, 'GPU — PF (Physical Function)', '전체 기능 · 장치 관리');

  // VF 3개
  const vfY = 110;
  const vfW = 96, vfH = 40;
  const vfXs = [14, 132, 250];
  vfXs.forEach((vx) => {
    line(pfX + pfW / 2, pfY + pfH, vx + vfW / 2, vfY);
  });
  vfXs.forEach((vx, i) => {
    box(vx, vfY, vfW, vfH, '#2e9e5b', `VF${i}`, '경량 PCIe 기능');
  });

  // VM 3개
  const vmY = 210;
  const vmW = 96, vmH = 40;
  vfXs.forEach((vx, i) => {
    line(vx + vfW / 2, vfY + vfH, vx + vmW / 2, vmY);
    box(vx, vmY, vmW, vmH, '#a855c7', `VM ${String.fromCharCode(65 + i)}`, '직접 할당');
  });

  // 라벨
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SR-IOV가 PF에서 VF들을 만든다', 14, 78);
  ctx.textAlign = 'center';
  ctx.fillText('각 VF는 자체 PCI config space → VM이 passthrough로 직접 접근', W / 2, 188);
}

export default function PfVfTree() {
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
        PCIe <strong>SR-IOV</strong>는 한 물리 GPU를 버스 위에서 여러 장치처럼 보이게 합니다.{' '}
        <strong>PF</strong>(Physical Function)는 전체 기능과 관리를 맡고, 거기서 여러{' '}
        <strong>VF</strong>(Virtual Function — 설정 리소스 일부가 빠진 경량 PCIe 기능)를 만듭니다.
        각 VF는 자기 PCI config space를 가져 한 VM에 직접(passthrough) 붙으므로, VM은 하이퍼바이저를
        매번 거치지 않고 GPU에 접근합니다. NVIDIA vGPU는 최근 데이터센터 GPU에서 이 VF 위에 MIG
        인스턴스를 얹기도 합니다(세대·구성에 따라 다름).
      </figcaption>
    </figure>
  );
}
