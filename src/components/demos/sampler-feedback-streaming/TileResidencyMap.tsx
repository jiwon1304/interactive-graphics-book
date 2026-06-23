import { useEffect, useRef } from 'react';

// 정적 도식 — tiled/sparse resource의 타일 residency.
// 전체 mip chain을 다 올리는 대신, 실제로 보이는 타일만 resident. VRAM 절약을 막대로 비교.

const W = 360;
const H = 290;
const COLS = 8;
const ROWS = 6;

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

  // resident 패턴: 대략 가운데~아래(보이는 영역) 타일만 올라옴
  const resident = (r: number, c: number) => {
    if (r >= 2 && r <= 4 && c >= 1 && c <= 5) return true;
    if (r === 5 && c >= 2 && c <= 4) return true;
    if (r === 1 && c >= 2 && c <= 4) return true;
    return false;
  };

  const gx = 14;
  const gy = 36;
  const gridW = W - 28;
  const cw = gridW / COLS;
  const ch = 26;
  const gridH = ROWS * ch;

  ctx.fillStyle = text;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('타일 residency (64KB 타일)', gx, 20);

  let residentCount = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = gx + c * cw;
      const y = gy + r * ch;
      const res = resident(r, c);
      if (res) {
        residentCount++;
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
        ctx.setLineDash([]);
      }
    }
  }
  const total = ROWS * COLS;

  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('■ resident (로드됨)', gx, gy + gridH + 16);
  ctx.fillText('▢ non-resident (안 올림)', gx + 130, gy + gridH + 16);

  // VRAM 절약 막대 비교
  const barY = gy + gridH + 40;
  const barX = gx;
  const barW = gridW;
  const barH = 22;
  // 전체 = total, sparse = residentCount
  ctx.fillStyle = text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('전체 mip chain 다 로드', barX, barY - 2);
  ctx.fillStyle = muted;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(barX, barY + 8, barW, barH);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY + 8, barW, barH);
  ctx.fillStyle = text;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('100%', barX + barW / 2, barY + 8 + barH / 2);

  const barY2 = barY + 44;
  ctx.fillStyle = text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('feedback로 필요한 타일만', barX, barY2 - 2);
  const frac = residentCount / total;
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(barX, barY2 + 8, barW * frac, barH);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = border;
  ctx.strokeRect(barX, barY2 + 8, barW, barH);
  ctx.fillStyle = text;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(frac * 100)}%`, barX + barW * frac + 6, barY2 + 8 + barH / 2);
}

export default function TileResidencyMap() {
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
        Tiled(sparse) resource는 텍스처를 <strong>64KB 타일</strong>로 쪼개 일부만 메모리에 올릴 수
        있습니다. feedback이 가리킨, 실제로 보이는 타일만 resident로 두면(파랑) 전체 mip chain을 다
        올리는 것보다 VRAM을 크게 아낍니다. Microsoft 샘플의 대표 수치는 약 <strong>1/10</strong>
        (524,288 KB → 51,584 KB)인데, 실제 절감은 콘텐츠·카메라·해상도에 따라 달라지는 대표값입니다.
      </figcaption>
    </figure>
  );
}
