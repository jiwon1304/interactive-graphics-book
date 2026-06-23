import { useEffect, useRef } from 'react';

// 정적 도식 — feedback map(원하는 mip) vs MinMip map(가진 mip).
// 화면에서 카메라에 가까운 region일수록 고해상도 mip이 필요(feedback의 desired mip 작음=고해상도).
// MinMip은 실제 로드된 것. 둘이 일치하면 OK, feedback이 더 고해상도를 원하면 그 타일을 로드해야 함.

const W = 360;
const H = 250;
const COLS = 6;
const ROWS = 5;

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

  // desired mip(작을수록 고해상도). 화면 아래쪽(카메라에 가까움) = mip 0~1, 위쪽(멀리) = mip 3~4.
  const desired = (r: number) => Math.round((r / (ROWS - 1)) * 3); // 0(아래/가까움 아님)..
  // 실제로: r=0 위쪽(멀다)=mip3, r=ROWS-1 아래(가깝다)=mip0
  const desiredMip = (r: number) => 3 - Math.round((r / (ROWS - 1)) * 3);

  const gridW = 150;
  const gridH = 150;
  const cw = gridW / COLS;
  const ch = gridH / ROWS;
  const gx1 = 14;
  const gx2 = W - 14 - gridW;
  const gy = 50;

  const mipColor = (mip: number) => {
    // mip 0 = 진한 accent(고해상도), 높을수록 옅음
    const t = mip / 3;
    return { col: accent, alpha: 0.55 - t * 0.4 };
  };

  ctx.fillStyle = text;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('feedback map', gx1, 24);
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('원하는 mip (샘플 결과)', gx1, 40);

  ctx.fillStyle = text;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('MinMip map', gx2, 24);
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('실제 가진 mip', gx2, 40);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const want = desiredMip(r);
      // MinMip: 대부분 가지고 있지만, 가장 고해상도(mip0)가 필요한 아래 두 행 일부는 아직 mip2만 로드됨(부족).
      const have = want === 0 && c >= 2 && c <= 4 ? 2 : want;

      // feedback
      let { col, alpha } = mipColor(want);
      ctx.fillStyle = col;
      ctx.globalAlpha = alpha;
      ctx.fillRect(gx1 + c * cw, gy + r * ch, cw - 1, ch - 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = text;
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(want), gx1 + c * cw + cw / 2, gy + r * ch + ch / 2);

      // MinMip
      const m = mipColor(have);
      ctx.fillStyle = m.col;
      ctx.globalAlpha = m.alpha;
      ctx.fillRect(gx2 + c * cw, gy + r * ch, cw - 1, ch - 1);
      ctx.globalAlpha = 1;
      // 부족한 칸 표시(원하는 것 < 가진 것 → 더 고해상도 필요)
      if (have > want) {
        ctx.strokeStyle = '#e0564b';
        ctx.lineWidth = 2;
        ctx.strokeRect(gx2 + c * cw + 1, gy + r * ch + 1, cw - 3, ch - 3);
      }
      ctx.fillStyle = text;
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(String(have), gx2 + c * cw + cw / 2, gy + r * ch + ch / 2);
    }
  }

  // 외곽
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(gx1, gy, gridW, gridH);
  ctx.strokeRect(gx2, gy, gridW, gridH);

  // 화살표 표시
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('숫자 = mip (0=고해상도)', W / 2, gy + gridH + 18);
  ctx.fillStyle = '#e0564b';
  ctx.fillText('빨강 테두리 = 더 고해상도 타일을 로드해야 함', W / 2, gy + gridH + 34);
}

export default function FeedbackVsMinMip() {
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
        Sampler feedback이 만드는 두 작은 맵입니다. <strong>feedback map</strong>은 셰이더가 실제로
        샘플하며 "이 region엔 이 mip이 필요하다"고 기록한 <em>원하는 값</em>이고,{' '}
        <strong>MinMip map</strong>은 지금 메모리에 <em>실제로 로드된</em> 최소 mip입니다. 두 맵을 비교해
        feedback이 더 고해상도(작은 mip)를 원하는 칸(빨강)만 골라 그 타일을 스트리밍으로 채워 넣으면
        됩니다. region(타일) 단위로 양자화되므로 픽셀 단위가 아니라 영역 단위 정보라는 점에 주의하세요.
      </figcaption>
    </figure>
  );
}
