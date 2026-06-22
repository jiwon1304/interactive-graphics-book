import { useEffect, useRef } from 'react';

// 정적 도식 — BAR 창과 Resizable BAR.
// BAR는 CPU가 VRAM을 들여다보는 창. 전통적으로 256 MB로 제한돼, 큰 VRAM이라도 CPU는 일부만 직접
// 접근했다. 대표로 ReBAR가 꺼진 상태(8 GB VRAM 중 256 MB 창)를 그린다 — 제약이 가장 잘 드러나는 컷.
// ReBAR가 켜지면 창이 VRAM 전체로 커지는 것은 figcaption.

const W = 380;
const H = 160;
const CLASSIC_BAR_MB = 256;
const VRAM_MB = 8192;

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
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  const barX = 16;
  const barY = 50;
  const barW = W - 32;
  const barH = 38;

  // VRAM 전체
  ctx.fillStyle = cssVar('--bg', '#fff');
  ctx.fillRect(barX, barY, barW, barH);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText(`VRAM ${VRAM_MB} MB (GPU 전용)`, barX, barY - 14);

  // CPU-visible 창 (256 MB)
  const visibleMB = Math.min(CLASSIC_BAR_MB, VRAM_MB);
  const visW = (visibleMB / VRAM_MB) * barW;
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(barX, barY, visW, barH);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, Math.max(2, visW), barH);

  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`CPU가 직접 보는 창(BAR): ${visibleMB} MB / ${VRAM_MB} MB`, barX, barY + barH + 22);

  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#e0564b';
  ctx.fillText('GPU_UPLOAD 힙 불가 → 스테이징 복사 필요', barX, barY + barH + 42);
}

export default function BARWindow() {
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
        BAR는 CPU가 VRAM을 들여다보는 창입니다. ReBAR가 없던 시절엔 이 창이 <em>256 MB</em>로 고정돼
        있어(파란 칸), 8 GB VRAM이라도 CPU는 그 일부만 직접 볼 수 있었습니다 — 나머지에 쓰려면 창을
        옮겨가며 여러 번 전송하거나 스테이징 버퍼를 거쳐야 했습니다. <strong>Resizable BAR(SAM)</strong>를
        켜면 창이 VRAM 전체로 커져, CPU가 VRAM에 직접 쓰는 힙(D3D12 <code>GPU_UPLOAD</code>, Vulkan{' '}
        <code>DEVICE_LOCAL|HOST_VISIBLE</code>)이 열리고 중간 복사가 사라집니다. 게임 FPS 이득은 작고
        가변적이지만, 그래픽스 프로그래밍에서의 진짜 가치는 이 <em>스테이징 제거</em>입니다(단, 이 메모리는
        write-combined라 CPU read는 금물).
      </figcaption>
    </figure>
  );
}
