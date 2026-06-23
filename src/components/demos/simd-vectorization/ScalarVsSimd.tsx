import { useEffect, useRef } from 'react';

// 정적 도식 — 스칼라 4회 vs SIMD 1회(4-wide).
// 같은 8개 원소 덧셈을, 스칼라는 한 번에 1개씩(4 lanes 비교를 위해 4개만 표시),
// SIMD는 폭 4짜리 레지스터로 한 명령에 4개를 처리한다.
// 캔버스 안 글자는 최소(레인 번호·연산자만), 설명은 figcaption.

const W = 360;
const H = 300;

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
  ctx.textAlign = 'center';

  const cell = 34;
  const gap = 6;
  const lanes = 4;
  const rowW = lanes * cell + (lanes - 1) * gap;
  const x0 = (W - rowW) / 2;

  function laneRow(y: number, vals: string[], fill: string, alpha: number) {
    for (let i = 0; i < lanes; i++) {
      const x = x0 + i * (cell + gap);
      ctx.fillStyle = fill;
      ctx.globalAlpha = alpha;
      ctx.fillRect(x, y, cell, cell);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cell, cell);
      ctx.fillStyle = text;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(vals[i], x + cell / 2, y + cell / 2 + 1);
    }
  }

  // --- 위: 스칼라 (한 번에 1 lane, 4 스텝) ---
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('스칼라 — 명령 4회', x0, 18);

  const sy = 36;
  laneRow(sy, ['a', 'a', 'a', 'a'], accent, 0.18);
  ctx.fillStyle = muted;
  ctx.textAlign = 'center';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('+', W / 2, sy + cell + gap / 2 + 2);
  laneRow(sy + cell + gap, ['b', 'b', 'b', 'b'], accent, 0.18);

  // 스텝 표시: 첫 lane만 "활성"
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x0 - 2, sy - 2, cell + 4, cell + 4);
  ctx.strokeRect(x0 - 2, sy + cell + gap - 2, cell + 4, cell + 4);
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('1', x0 + cell / 2, sy - 9);
  ctx.fillText('→ 2 → 3 → 4 (순차)', x0 + rowW - 4, sy - 9);

  // --- 아래: SIMD (4 lanes 동시) ---
  const baseY = 168;
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SIMD (4-wide) — 명령 1회', x0, baseY - 6);

  const vy = baseY + 10;
  laneRow(vy, ['a', 'a', 'a', 'a'], accent, 0.32);
  ctx.fillStyle = muted;
  ctx.textAlign = 'center';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('+', W / 2, vy + cell + gap / 2 + 2);
  laneRow(vy + cell + gap, ['b', 'b', 'b', 'b'], accent, 0.32);

  // 한 레지스터로 4 lane을 감싸는 테두리
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x0 - 4, vy - 4, rowW + 8, cell + 8);
  ctx.strokeRect(x0 - 4, vy + cell + gap - 4, rowW + 8, cell + 8);

  // 결과
  const ry = vy + 2 * (cell + gap) + 6;
  laneRow(ry, ['c', 'c', 'c', 'c'], '#2e9e5b', 0.45);
  ctx.fillStyle = text;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('= 결과 (한 클럭에)', x0, ry + cell + 14);
}

export default function ScalarVsSimd() {
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
        같은 4개 원소 덧셈을 스칼라는 명령 4번으로 한 lane씩 순차 처리합니다(위). SIMD는 폭이 넓은
        벡터 레지스터 하나에 4개를 담아 <strong>한 명령</strong>으로 모든 lane을 동시에 더합니다(아래).
        이것이 "Single Instruction, Multiple Data" — 명령 흐름은 하나, 데이터는 여럿입니다. 폭이
        128/256/512-bit로 넓어질수록 한 명령에 처리하는 lane 수(여기선 4)가 비례해 늘어납니다.
      </figcaption>
    </figure>
  );
}
