import { useEffect, useRef } from 'react';

// 정적 도식 — 고정기능 비디오 엔진(NVENC/NVDEC)은 셰이더 코어와 분리된 별도 블록.
// 같은 GPU 다이 안에서 SM(셰이더) 코어가 렌더를 도는 동안, NVENC가 그 결과를 동시에 인코딩한다.
// 둘은 공유하는 VRAM을 통해 데이터를 주고받는다.

const W = 360;
const H = 300;

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
  const surface = cssVar('--surface', '#fff');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  // GPU 다이 외곽
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  roundRect(ctx, 8, 8, W - 16, H - 56, 12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = muted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('GPU 다이 (한 칩)', 18, 24);

  // 셰이더 코어 블록 (왼쪽 위)
  const scX = 22, scY = 40, scW = 150, scH = 78;
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.16;
  roundRect(ctx, scX, scY, scW, scH, 8);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  roundRect(ctx, scX, scY, scW, scH, 8);
  ctx.stroke();
  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('셰이더 코어', scX + scW / 2, scY + 20);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = muted;
  ctx.fillText('SM / CUDA — 렌더', scX + scW / 2, scY + 38);
  ctx.fillText('범용·프로그래머블', scX + scW / 2, scY + 54);

  // NVENC/NVDEC 고정기능 블록 (오른쪽 위)
  const veX = 188, veY = 40, veW = 150, veH = 78;
  ctx.fillStyle = '#2e9e5b';
  ctx.globalAlpha = 0.16;
  roundRect(ctx, veX, veY, veW, veH, 8);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#2e9e5b';
  ctx.lineWidth = 1.5;
  roundRect(ctx, veX, veY, veW, veH, 8);
  ctx.stroke();
  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('NVENC / NVDEC', veX + veW / 2, veY + 20);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = muted;
  ctx.fillText('고정기능 (ASIC)', veX + veW / 2, veY + 38);
  ctx.fillText('인코드 / 디코드', veX + veW / 2, veY + 54);

  // 공유 VRAM 막대
  const vrX = 22, vrY = 138, vrW = W - 44, vrH = 34;
  ctx.fillStyle = surface;
  roundRect(ctx, vrX, vrY, vrW, vrH, 8);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, vrX, vrY, vrW, vrH, 8);
  ctx.stroke();
  ctx.fillStyle = text;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('공유 VRAM (프레임버퍼)', vrX + vrW / 2, vrY + vrH / 2);

  // 화살표: 셰이더→VRAM, VRAM→NVENC
  ctx.strokeStyle = text;
  ctx.fillStyle = text;
  ctx.lineWidth = 1.5;
  const arrow = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 7 * Math.cos(a - 0.4), y2 - 7 * Math.sin(a - 0.4));
    ctx.lineTo(x2 - 7 * Math.cos(a + 0.4), y2 - 7 * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fill();
  };
  arrow(scX + scW / 2, scY + scH + 2, scX + scW / 2, vrY - 2); // 렌더 → VRAM
  arrow(vrX + vrW - 60, vrY - 2, veX + veW / 2, veY + veH + 2); // VRAM → NVENC

  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText('렌더 결과', scX + scW / 2 + 4, (scY + scH + vrY) / 2);
  ctx.textAlign = 'right';
  ctx.fillText('프레임 읽어 인코딩', veX + veW / 2 - 4, (veY + veH + vrY) / 2);

  // 출력: 비트스트림
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2e9e5b';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('→ 압축 비트스트림 (H.264 / HEVC / AV1)', W / 2, H - 30);
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('두 블록은 동시에 돈다 — 렌더하며 인코드', W / 2, H - 12);
}

export default function BlockDataflow() {
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
        비디오 엔진(<strong>NVENC</strong> 인코드 · <strong>NVDEC</strong> 디코드)은 셰이더 코어와
        같은 칩에 있지만 <em>완전히 분리된 고정기능 블록</em>입니다. 셰이더 코어가 다음 프레임을 렌더하는
        동안, NVENC는 공유 VRAM에서 이미 그려진 프레임을 읽어 압축합니다 — 두 일이 <strong>동시에</strong>
        진행되어, 게임을 돌리면서 같은 GPU로 방송 화면을 인코딩할 수 있습니다.
      </figcaption>
    </figure>
  );
}
