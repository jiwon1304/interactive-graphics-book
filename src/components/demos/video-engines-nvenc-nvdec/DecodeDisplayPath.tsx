import { useEffect, useRef } from 'react';

// 정적 도식 — 디코드 → VRAM → 디스플레이 엔진 스캔아웃/합성 경로.
// 셰이더 코어와 별개의 두 고정기능 블록(NVDEC, 디스플레이 엔진)이 프레임을 화면에 올린다.
// 디스플레이 엔진은 여러 평면(오버레이)을 고정기능으로 합성(MPO)한다.

const W = 360;
const H = 290;

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

  const box = (x: number, y: number, w: number, h: number, col: string, title: string, sub: string, alpha = 0.15) => {
    ctx.fillStyle = col;
    ctx.globalAlpha = alpha;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 8);
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(title, x + w / 2, y + (sub ? 17 : h / 2));
    if (sub) {
      ctx.fillStyle = muted;
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(sub, x + w / 2, y + 33);
    }
  };

  const varrow = (x: number, y1: number, y2: number, label?: string) => {
    ctx.strokeStyle = text;
    ctx.fillStyle = text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y2 + 1);
    ctx.lineTo(x - 5, y2 - 5);
    ctx.lineTo(x + 5, y2 - 5);
    ctx.closePath();
    ctx.fill();
    if (label) {
      ctx.fillStyle = muted;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 8, (y1 + y2) / 2);
    }
  };

  // NVDEC
  box(90, 12, 180, 44, '#2e9e5b', 'NVDEC (고정기능 디코더)', '비트스트림 → 프레임', 0.16);
  varrow(W / 2, 58, 78, 'VRAM에 디코드');
  // VRAM
  box(70, 82, 220, 40, accent, '공유 VRAM', '여러 평면(레이어)', 0.13);
  varrow(W / 2, 124, 150, '평면들 읽기');
  // 디스플레이 엔진
  box(50, 154, 260, 56, '#a855c7', '디스플레이 엔진 (스캔아웃)', '오버레이 평면 합성 (MPO) · 색공간·스케일', 0.16);
  varrow(W / 2, 212, 244, '스캔아웃');
  // 모니터
  box(120, 248, 120, 32, border, '모니터', '', 0.25);
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
}

export default function DecodeDisplayPath() {
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
        디코드한 프레임이 화면에 닿는 길. <strong>NVDEC</strong>가 비트스트림을 풀어 VRAM에 프레임을
        쓰고, 셰이더 코어와는 또 다른 고정기능 블록인 <strong>디스플레이 엔진</strong>이 그 프레임(과
        UI·커서 같은 다른 평면)을 읽어 합성·스캔아웃합니다. 평면 합성을 고정기능으로 처리하면(Multiplane
        Overlay) 셰이더로 합성할 필요가 없어 전력이 절약됩니다. 스캔아웃 이후의 세계는{' '}
        <a href="./display-pipeline">디스플레이 출력</a> 챕터에서 이어집니다.
      </figcaption>
    </figure>
  );
}
