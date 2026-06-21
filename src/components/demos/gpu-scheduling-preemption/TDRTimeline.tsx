import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';

const W = 540;
const H = 180;
const TDR_MS = 2000; // Windows 기본 TdrDelay = 2초
const MAXVIEW = 3200; // 타임라인 가로 = 3.2초

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D, workMs: number, chunked: boolean) {
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  ctx.clearRect(0, 0, W, H);
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  const x0 = 16;
  const sx = (W - 32) / MAXVIEW;
  const y = 56;
  const barH = 34;

  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText('GPU 작업 타임라인', x0, y - 16);

  const tdrHit = !chunked && workMs > TDR_MS;

  if (chunked) {
    // 200ms 청크로 분할 → 매 경계에서 프리엠션 가능 → 2초 초과 안 함
    const chunk = 200;
    let drawn = 0;
    let i = 0;
    while (drawn < workMs) {
      const len = Math.min(chunk, workMs - drawn);
      const x = x0 + drawn * sx;
      ctx.fillStyle = accent;
      ctx.globalAlpha = i % 2 ? 0.55 : 0.8;
      ctx.fillRect(x, y, Math.max(1, len * sx - 1), barH);
      drawn += len;
      i++;
    }
    ctx.globalAlpha = 1;
  } else {
    const x = x0;
    const w = Math.min(workMs, MAXVIEW) * sx;
    ctx.fillStyle = tdrHit ? '#e0564b' : accent;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(x, y, Math.max(1, w), barH);
    ctx.globalAlpha = 1;
  }

  // 2초 TDR 데드라인
  const tx = x0 + TDR_MS * sx;
  ctx.strokeStyle = '#e0564b';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(tx, y - 8);
  ctx.lineTo(tx, y + barH + 8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#e0564b';
  ctx.textAlign = 'center';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('2초 (TdrDelay)', tx, y + barH + 18);

  // 상태
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  if (tdrHit) {
    ctx.fillStyle = '#e0564b';
    ctx.fillText('⚠ TDR! GPU 리셋 → DXGI_ERROR_DEVICE_HUNG (디바이스 제거)', x0, H - 16);
  } else {
    ctx.fillStyle = '#2e9e5b';
    ctx.fillText(chunked ? '청크 분할 → 매 경계에서 프리엠션 가능 → TDR 회피' : '작업이 2초 안에 끝남 → 정상', x0, H - 16);
  }
}

/**
 * 위젯 — TDR(Timeout Detection and Recovery).
 * 하나의 거대한 작업이 2초(기본 TdrDelay)를 넘기면 OS가 GPU가 멈췄다고 판단해 리셋하고, 앱은
 * 디바이스 제거 에러를 받는다. 작업을 청크로 쪼개면 매 경계에서 프리엠션이 가능해 TDR을 피한다.
 */
export default function TDRTimeline() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [workMs, setWorkMs] = useState(1400);
  const [chunked, setChunked] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (ctx) draw(ctx, workMs, chunked);
  }, [workMs, chunked]);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas ref={ref} width={W} height={H} style={{ width: '100%', maxWidth: 540, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }} />
      </div>
      <ControlPanel>
        <Slider label="단일 작업(dispatch) 길이" value={workMs} min={200} max={3000} step={50} onChange={setWorkMs} unit=" ms" />
        <ToggleControl label="청크로 분할" checked={chunked} onChange={setChunked} />
      </ControlPanel>
      <figcaption>
        <strong>직접 해보세요:</strong> 단일 작업 길이를 2초(빨간 점선, Windows 기본 <code>TdrDelay</code>)
        너머로 키우면 <strong>TDR</strong>이 터집니다 — OS가 GPU를 멈춘 것으로 보고 리셋하며 앱은
        <code>DXGI_ERROR_DEVICE_HUNG</code>으로 디바이스를 잃습니다. "청크로 분할"을 켜면 같은 총량이
        작은 조각들로 나뉘어 매 경계에서 프리엠션이 가능해져, 화면이 멈추지도 TDR이 나지도 않습니다.
        긴 컴퓨트 커널을 타일로 쪼개는 이유입니다.
      </figcaption>
    </figure>
  );
}
