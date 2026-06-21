import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';

const W = 540;
const H = 170;
const CLASSIC_BAR_MB = 256;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D, vramMB: number, rebar: boolean) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  ctx.clearRect(0, 0, W, H);
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  const barX = 20;
  const barY = 54;
  const barW = W - 40;
  const barH = 40;

  // VRAM 전체
  ctx.fillStyle = cssVar('--bg', '#fff');
  ctx.fillRect(barX, barY, barW, barH);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText(`VRAM ${vramMB} MB (DEVICE_LOCAL, GPU 전용)`, barX, barY - 14);

  // CPU-visible 창
  const visibleMB = rebar ? vramMB : Math.min(CLASSIC_BAR_MB, vramMB);
  const visW = (visibleMB / vramMB) * barW;
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(barX, barY, visW, barH);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, Math.max(2, visW), barH);

  ctx.fillStyle = text;
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`CPU가 직접 보는 VRAM(BAR 창): ${visibleMB} MB / ${vramMB} MB`, barX, barY + barH + 22);

  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = rebar ? '#2e9e5b' : '#e0564b';
  ctx.fillText(
    rebar
      ? 'GPU_UPLOAD / DEVICE_LOCAL|HOST_VISIBLE 힙: 사용 가능 → CPU가 VRAM에 직접 쓰기(스테이징 복사 제거)'
      : 'GPU_UPLOAD 힙: 불가 · CPU-visible VRAM은 256 MB 창으로 제한 → 스테이징 복사 필요',
    barX,
    barY + barH + 42,
  );
}

/**
 * 위젯 — BAR 창과 Resizable BAR.
 * BAR는 CPU가 VRAM을 들여다보는 창. 전통적으로 256 MB로 제한돼, 큰 VRAM이라도 CPU는 일부만 직접
 * 접근했다. Resizable BAR(SAM)는 창을 VRAM 전체로 키워 CPU가 VRAM에 직접 쓸 수 있게 한다.
 */
export default function BARWindow() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [vramMB, setVramMB] = useState(8192);
  const [rebar, setRebar] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (ctx) draw(ctx, vramMB, rebar);
  }, [vramMB, rebar]);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas ref={ref} width={W} height={H} style={{ width: '100%', maxWidth: 540, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }} />
      </div>
      <ControlPanel>
        <Slider label="VRAM" value={vramMB} min={2048} max={24576} step={1024} onChange={setVramMB} unit=" MB" />
        <ToggleControl label="Resizable BAR (SAM)" checked={rebar} onChange={setRebar} />
      </ControlPanel>
      <figcaption>
        <strong>직접 해보세요:</strong> ReBAR가 꺼져 있으면 CPU는 VRAM의 <em>256 MB</em>만 직접 볼 수
        있어(파란 창), 나머지에 쓰려면 창을 옮겨가며 여러 번 전송하거나 스테이징 버퍼를 거쳐야 합니다.
        <strong>Resizable BAR</strong>를 켜면 창이 VRAM 전체로 커져, CPU가 VRAM에 직접 쓰는
        힙(D3D12 <code>GPU_UPLOAD</code>, Vulkan <code>DEVICE_LOCAL|HOST_VISIBLE</code>)이 열리고 중간
        복사가 사라집니다. 게임 FPS 이득은 작고 가변적이지만, 그래픽스 프로그래밍에서의 진짜 가치는
        이 <em>스테이징 제거</em>입니다. (단, 이 메모리는 write-combined라 CPU read는 금물.)
      </figcaption>
    </figure>
  );
}
