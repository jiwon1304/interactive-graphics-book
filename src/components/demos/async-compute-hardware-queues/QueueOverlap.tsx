import { useEffect, useRef } from 'react';

// 정적 도식 — 세 큐(graphics/compute/copy) 작업이 시간축에서 겹치는 모습.
// 위: 직렬(겹침 없음) — 총 시간이 길다. 아래: async 오버랩 — compute가 graphics의 빈 유닛을 메워 총 시간 단축.
// 핵심: 같은 하드웨어를 시간이 아니라 "유닛 점유"로 겹쳐 채운다.

const W = 380;
const H = 320;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

const C = '#8b5cf6'; // compute
const CP = '#2e9e5b'; // copy

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, label: string, alpha = 0.85) {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  if (w > 34) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2);
  }
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  const x0 = 64;
  const x1 = W - 14;
  const span = x1 - x0;
  const u = span / 14; // 시간 단위
  const rowH = 22;

  function laneLabel(t: string, y: number, color: string) {
    ctx.fillStyle = color;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(t, x0 - 6, y + rowH / 2);
  }

  // ── 위: 직렬 ──
  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('직렬 — 큐를 순서대로', 10, 16);

  let y = 30;
  laneLabel('graphics', y, accent);
  bar(ctx, x0, y, u * 6, rowH, accent, '그림자');
  y += rowH + 6;
  laneLabel('compute', y, C);
  bar(ctx, x0 + u * 6, y, u * 5, rowH, C, 'SSAO');
  y += rowH + 6;
  laneLabel('copy', y, CP);
  bar(ctx, x0 + u * 11, y, u * 3, rowH, CP, '업로드');

  // 직렬 총 시간 표시
  const serialEnd = x0 + u * 14;
  ctx.strokeStyle = muted;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(serialEnd, 30);
  ctx.lineTo(serialEnd, y + rowH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('총 14', serialEnd, y + rowH + 12);

  // ── 아래: async 오버랩 ──
  ctx.fillStyle = text;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('async — 빈 유닛을 겹쳐 채움', 10, 178);

  y = 192;
  laneLabel('graphics', y, accent);
  bar(ctx, x0, y, u * 6, rowH, accent, '그림자');
  y += rowH + 6;
  laneLabel('compute', y, C);
  // compute가 graphics와 동시에 시작 (그림자 패스 중 ROP/래스터가 한가한 틈)
  bar(ctx, x0 + u * 1, y, u * 5, rowH, C, 'SSAO');
  y += rowH + 6;
  laneLabel('copy', y, CP);
  bar(ctx, x0, y, u * 3, rowH, CP, '업로드');

  const asyncEnd = x0 + u * 7;
  ctx.strokeStyle = '#2e9e5b';
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(asyncEnd, 192);
  ctx.lineTo(asyncEnd, y + rowH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = text;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('총 7', asyncEnd, y + rowH + 12);

  // 절약 표시
  ctx.fillStyle = '#2e9e5b';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('← 겹친 만큼 단축', asyncEnd + 8, y + rowH + 12);

  // 시간축 화살표
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, H - 8);
  ctx.lineTo(x1, H - 8);
  ctx.stroke();
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('시간 →', x0, H - 8);
}

export default function QueueOverlap() {
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
        같은 작업(그림자 그래픽스 패스 · SSAO compute · 텍스처 copy)을 직렬로 흘리면 시간이 그냥
        더해집니다(위). async compute는 이들을 별도 큐로 제출해, 그림자 패스가 래스터·ROP에 묶여
        연산 유닛(ALU)을 다 못 쓰는 동안 SSAO compute가 그 빈 유닛을 채웁니다(아래). copy도 DMA 엔진이
        따로 있어 동시에 굴러갑니다. 막대 길이의 합은 같아도 <em>벽시계 시간</em>이 줄어듭니다 — 핵심은
        시간이 아니라 <strong>유닛 점유</strong>를 겹쳐 메우는 것입니다(숫자는 도식용 대표값).
      </figcaption>
    </figure>
  );
}
