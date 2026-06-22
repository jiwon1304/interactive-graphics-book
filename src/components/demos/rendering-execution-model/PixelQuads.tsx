import { useRef, useState } from 'react';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import { COLORS, withAlpha, hatch, monoFont, pointerToCanvas } from './re2d';

// 도식 격자: GRID×GRID 픽셀, 2×2가 한 쿼드.
const GRID = 16; // 16×16 픽셀 = 8×8 쿼드
type Pt = { x: number; y: number };

// 픽셀 중심이 삼각형 안인가 (에지 함수 부호 일치).
function edge(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}
function inside(tri: [Pt, Pt, Pt], px: number, py: number): boolean {
  const e0 = edge(tri[0].x, tri[0].y, tri[1].x, tri[1].y, px, py);
  const e1 = edge(tri[1].x, tri[1].y, tri[2].x, tri[2].y, px, py);
  const e2 = edge(tri[2].x, tri[2].y, tri[0].x, tri[0].y, px, py);
  return (e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0);
}

/**
 * 픽셀 쿼드 위젯 (과정: 래스터화가 2×2 단위로 셰이딩한다).
 * 삼각형 세 꼭짓점을 격자 위로 드래그한다. 삼각형이 *닿은* 쿼드 전체가 켜지고,
 * 그 안에서 실제로 덮인 픽셀은 채워지고(covered), 덮이지 않았는데 같은 쿼드라
 * 강제로 셰이딩되는 픽셀은 빗금(helper)으로 표시된다. 헬퍼 비율이 카운터로 오른다.
 */
export default function PixelQuads() {
  // 픽셀 격자 좌표(0..GRID)로 꼭짓점을 둔다.
  const [tri, setTri] = useState<[Pt, Pt, Pt]>([
    { x: 3.4, y: 2.6 },
    { x: 12.6, y: 5.4 },
    { x: 5.5, y: 12.8 },
  ]);
  const dragRef = useRef<number | null>(null);
  // 카운터(캔버스 밖 캡션에 표시) — draw에서 계산해 채운다.
  const [stats, setStats] = useState({ covered: 0, helper: 0 });

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const side = Math.min(w, h) - 8;
    const ox = (w - side) / 2;
    const oy = (h - side) / 2;
    const cell = side / GRID;
    const toPx = (gx: number, gy: number): Pt => ({ x: ox + gx * cell, y: oy + gy * cell });

    // 1) 픽셀 커버리지: 각 픽셀 중심이 삼각형 안인가.
    const covered: boolean[] = new Array(GRID * GRID).fill(false);
    for (let py = 0; py < GRID; py++) {
      for (let px = 0; px < GRID; px++) {
        if (inside(tri, px + 0.5, py + 0.5)) covered[py * GRID + px] = true;
      }
    }
    // 2) 쿼드 활성: 2×2 안에 덮인 픽셀이 하나라도 있으면 그 쿼드 전체가 켜짐.
    const qN = GRID / 2;
    const quadActive: boolean[] = new Array(qN * qN).fill(false);
    for (let qy = 0; qy < qN; qy++) {
      for (let qx = 0; qx < qN; qx++) {
        let any = false;
        for (let sy = 0; sy < 2; sy++)
          for (let sx = 0; sx < 2; sx++)
            if (covered[(qy * 2 + sy) * GRID + (qx * 2 + sx)]) any = true;
        quadActive[qy * qN + qx] = any;
      }
    }

    // 3) 그리기 + 카운트
    let nCovered = 0;
    let nHelper = 0;
    for (let qy = 0; qy < qN; qy++) {
      for (let qx = 0; qx < qN; qx++) {
        const active = quadActive[qy * qN + qx];
        for (let sy = 0; sy < 2; sy++) {
          for (let sx = 0; sx < 2; sx++) {
            const px = qx * 2 + sx;
            const py = qy * 2 + sy;
            const isCov = covered[py * GRID + px];
            const p = toPx(px, py);
            if (active && isCov) {
              ctx.fillStyle = withAlpha(COLORS.covered, 0.85);
              ctx.fillRect(p.x, p.y, cell, cell);
              nCovered++;
            } else if (active) {
              // 헬퍼 레인: 셰이딩되지만 버려짐 → 주황 빗금.
              ctx.fillStyle = withAlpha(COLORS.helper, 0.16);
              ctx.fillRect(p.x, p.y, cell, cell);
              hatch(ctx, p.x, p.y, cell, cell, withAlpha(COLORS.helper, 0.9), 5);
              nHelper++;
            }
          }
        }
      }
    }

    // 픽셀 격자선(얇게)
    ctx.strokeStyle = withAlpha(theme.border, 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= GRID; i++) {
      const a = toPx(i, 0);
      const b = toPx(i, GRID);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      const c = toPx(0, i);
      const e = toPx(GRID, i);
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(e.x, e.y);
    }
    ctx.stroke();
    // 쿼드 경계선(굵게) — 2픽셀마다.
    ctx.strokeStyle = withAlpha(theme.text, 0.45);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= GRID; i += 2) {
      const a = toPx(i, 0);
      const b = toPx(i, GRID);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      const c = toPx(0, i);
      const e = toPx(GRID, i);
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(e.x, e.y);
    }
    ctx.stroke();

    // 삼각형 외곽선
    const a = toPx(tri[0].x, tri[0].y);
    const b = toPx(tri[1].x, tri[1].y);
    const c = toPx(tri[2].x, tri[2].y);
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.stroke();

    // 꼭짓점 핸들
    for (const v of [a, b, c]) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = theme.accent;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = theme.bg;
      ctx.stroke();
    }

    // 캔버스 안 라벨은 짧게: 좌상단 카운터 한 줄.
    const total = nCovered + nHelper;
    const pct = total > 0 ? Math.round((nHelper / total) * 100) : 0;
    ctx.font = monoFont(12, 'bold');
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`헬퍼 ${pct}%`, 6, 6);
    ctx.textBaseline = 'alphabetic';

    // 카운터 상태를 캡션으로도 노출(렌더 중 setState는 동일 값이면 무시되도록 가드)
    if (stats.covered !== nCovered || stats.helper !== nHelper) {
      setStats({ covered: nCovered, helper: nHelper });
    }
  };

  const { ref } = useCanvas2d(draw, [tri, stats]);

  // 드래그: 가장 가까운 꼭짓점을 집는다.
  const pick = (e: PointerEvent, canvas: HTMLCanvasElement): number | null => {
    const rect = canvas.getBoundingClientRect();
    const side = Math.min(rect.width, rect.height) - 8;
    const ox = (rect.width - side) / 2;
    const oy = (rect.height - side) / 2;
    const cell = side / GRID;
    const pt = pointerToCanvas(e, canvas);
    let best = -1;
    let bestD = 22; // 픽셀 반경 안에서만
    for (let i = 0; i < 3; i++) {
      const vx = ox + tri[i].x * cell;
      const vy = oy + tri[i].y * cell;
      const dd = Math.hypot(vx - pt.x, vy - pt.y);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
    return best >= 0 ? best : null;
  };

  usePointerDrag(ref, {
    onDown: (e, canvas) => {
      const i = pick(e, canvas);
      if (i === null) return false;
      dragRef.current = i;
    },
    onMove: (e, canvas) => {
      const i = dragRef.current;
      if (i === null) return;
      const rect = canvas.getBoundingClientRect();
      const side = Math.min(rect.width, rect.height) - 8;
      const ox = (rect.width - side) / 2;
      const oy = (rect.height - side) / 2;
      const cell = side / GRID;
      const pt = pointerToCanvas(e, canvas);
      const gx = Math.max(0, Math.min(GRID, (pt.x - ox) / cell));
      const gy = Math.max(0, Math.min(GRID, (pt.y - oy) / cell));
      setTri((prev) => {
        const next = [...prev] as [Pt, Pt, Pt];
        next[i] = { x: gx, y: gy };
        return next;
      });
    },
    onUp: () => {
      dragRef.current = null;
    },
  });

  const total = stats.covered + stats.helper;
  const pct = total > 0 ? Math.round((stats.helper / total) * 100) : 0;

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
        <canvas
          ref={ref}
          style={{ width: '100%', height: 340, touchAction: 'none', display: 'block', cursor: 'grab' }}
        />
      </div>
      <figcaption>
        삼각형 세 꼭짓점(<span style={{ color: 'var(--accent)' }}>●</span>)을 드래그하세요. 격자의
        가는 칸은 픽셀, 굵은 칸은 <strong>2×2 쿼드</strong>입니다. 래스터라이저는 픽셀을 하나씩이 아니라{' '}
        <em>쿼드 단위로</em> 셰이딩합니다 — 그래서 삼각형이 한 픽셀만 건드려도 그 픽셀이 속한 쿼드의
        나머지 세 픽셀까지 함께 깨어납니다. 파란 칸(
        <span style={{ color: COLORS.covered }}>covered</span>)은 실제로 삼각형이 덮은 픽셀,
        주황 빗금(<span style={{ color: COLORS.helper }}>helper</span>)은 같은 쿼드라는 이유만으로
        픽셀 셰이더가 돌지만 결과는 버려지는 <strong>헬퍼 레인</strong>입니다. 지금 헬퍼 비율은{' '}
        <strong>{pct}%</strong>(셰이딩 {total}회 중 버려진 {stats.helper}회)입니다.{' '}
        <strong>직접 해보세요:</strong> 삼각형을 잘게 줄여 보세요. 가장자리 길이에 비례하는 헬퍼가 점점
        지배적이 되어, 얇은 삼각형(잔디·머리카락·먼 메시)에서 헬퍼 %가 50%를 훌쩍 넘기는 걸 볼 수 있습니다.
      </figcaption>
    </figure>
  );
}
