import { useRef, useState } from 'react';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import { COLORS, withAlpha, monoFont, pointerToCanvas } from './re2d';

// 화면 위에 매핑된 UV가 선형으로 변한다고 두고, 한 쿼드(2×2)를 골라
// 우−좌 = ddx, 하−상 = ddy 를 보인다. (텍스처 LOD를 굴리는 바로 그 유한차분)
//
// 캔버스 안 글자는 짧게: 네 레인의 u값 + ddx/ddy 라벨만. 설명은 캡션.

const GRID = 12; // 12×12 픽셀 = 6×6 쿼드
type QuadIdx = { qx: number; qy: number };

// 화면 위치(픽셀 격자 0..GRID) → UV. 비선형(원근 비슷) 워프를 살짝 넣어
// ddx/ddy가 위치마다 달라지는 걸 보이게.
function uvAt(px: number, py: number): { u: number; v: number } {
  const nx = px / GRID;
  const ny = py / GRID;
  // 가까운 쪽(아래)일수록 텍셀이 촘촘 → ddx 작음. 멀수록(위) ddx 큼.
  const scale = 1 + 2.2 * (1 - ny); // 위(ny=0)에서 3.2배, 아래(ny=1)에서 1배
  return { u: nx * scale, v: ny * scale };
}

export default function QuadDerivatives() {
  const [q, setQ] = useState<QuadIdx>({ qx: 1, qy: 1 });
  const dragRef = useRef(false);

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const side = Math.min(w, h) - 8;
    const ox = (w - side) / 2;
    const oy = (h - side) / 2;
    const cell = side / GRID;
    const toPx = (gx: number, gy: number) => ({ x: ox + gx * cell, y: oy + gy * cell });

    // 배경: u 채널을 옅은 그라데이션으로 칠해 "텍스처가 깔린 면"임을 암시.
    for (let py = 0; py < GRID; py++) {
      for (let px = 0; px < GRID; px++) {
        const { u } = uvAt(px + 0.5, py + 0.5);
        const t = (u % 1 + 1) % 1; // 0..1 반복
        ctx.fillStyle = withAlpha(theme.accent, 0.06 + 0.16 * t);
        const p = toPx(px, py);
        ctx.fillRect(p.x, p.y, cell, cell);
      }
    }

    // 쿼드 격자선
    ctx.strokeStyle = withAlpha(theme.text, 0.35);
    ctx.lineWidth = 1.2;
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

    // 선택된 쿼드: 네 픽셀 중심의 UV로 차분.
    const baseX = q.qx * 2;
    const baseY = q.qy * 2;
    const c00 = uvAt(baseX + 0.5, baseY + 0.5); // 좌상 (me)
    const c10 = uvAt(baseX + 1.5, baseY + 0.5); // 우상 (right)
    const c01 = uvAt(baseX + 0.5, baseY + 1.5); // 좌하 (below)
    const ddxU = c10.u - c00.u;
    const ddyU = c01.u - c00.u;

    // 선택 쿼드 강조 박스
    const qp = toPx(baseX, baseY);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(qp.x, qp.y, cell * 2, cell * 2);

    // 네 레인에 u값 라벨(짧게)
    const drawLane = (gx: number, gy: number, val: number, tag: string, col: string) => {
      const p = toPx(gx, gy);
      ctx.fillStyle = withAlpha(col, 0.85);
      ctx.fillRect(p.x + 1, p.y + 1, cell - 2, cell - 2);
      ctx.font = monoFont(Math.max(9, cell * 0.26), 'bold');
      ctx.fillStyle = theme.bg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`u=${val.toFixed(2)}`, p.x + cell / 2, p.y + cell / 2 - cell * 0.16);
      ctx.font = monoFont(Math.max(8, cell * 0.22));
      ctx.fillText(tag, p.x + cell / 2, p.y + cell / 2 + cell * 0.2);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'start';
    };
    drawLane(baseX, baseY, c00.u, 'me', theme.muted);
    drawLane(baseX + 1, baseY, c10.u, 'right', COLORS.covered);
    drawLane(baseX, baseY + 1, c01.u, 'below', COLORS.front);

    // ddx 화살표(me→right, 가로) + ddy 화살표(me→below, 세로)
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });
    const pMe = toPx(baseX + 0.5, baseY + 0.5);
    const pR = toPx(baseX + 1.5, baseY + 0.5);
    const pB = toPx(baseX + 0.5, baseY + 1.5);

    const arrow = (from: { x: number; y: number }, to: { x: number; y: number }, col: string) => {
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      const ang = Math.atan2(to.y - from.y, to.x - from.x);
      const hl = 7;
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - hl * Math.cos(ang - 0.4), to.y - hl * Math.sin(ang - 0.4));
      ctx.lineTo(to.x - hl * Math.cos(ang + 0.4), to.y - hl * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();
    };
    arrow(pMe, pR, COLORS.covered);
    arrow(pMe, pB, COLORS.front);

    // ddx/ddy 라벨(짧게, 화살표 옆)
    ctx.font = monoFont(11, 'bold');
    ctx.textAlign = 'center';
    const mx = mid(pMe, pR);
    ctx.fillStyle = COLORS.covered;
    ctx.fillText(`ddx=${ddxU >= 0 ? '+' : ''}${ddxU.toFixed(2)}`, mx.x, mx.y - 8);
    const my = mid(pMe, pB);
    ctx.fillStyle = COLORS.front;
    ctx.textAlign = 'left';
    ctx.fillText(`ddy=${ddyU >= 0 ? '+' : ''}${ddyU.toFixed(2)}`, my.x + 8, my.y + 4);
    ctx.textAlign = 'start';
  };

  const { ref } = useCanvas2d(draw, [q]);

  const pickQuad = (e: PointerEvent, canvas: HTMLCanvasElement): QuadIdx | null => {
    const rect = canvas.getBoundingClientRect();
    const side = Math.min(rect.width, rect.height) - 8;
    const ox = (rect.width - side) / 2;
    const oy = (rect.height - side) / 2;
    const cell = side / GRID;
    const pt = pointerToCanvas(e, canvas);
    const gx = Math.floor((pt.x - ox) / cell);
    const gy = Math.floor((pt.y - oy) / cell);
    const qx = Math.floor(gx / 2);
    const qy = Math.floor(gy / 2);
    const qN = GRID / 2;
    if (qx < 0 || qy < 0 || qx >= qN || qy >= qN) return null;
    return { qx, qy };
  };

  usePointerDrag(ref, {
    onDown: (e, canvas) => {
      const picked = pickQuad(e, canvas);
      if (!picked) return false;
      dragRef.current = true;
      setQ(picked);
    },
    onMove: (e, canvas) => {
      if (!dragRef.current) return;
      const picked = pickQuad(e, canvas);
      if (picked) setQ(picked);
    },
    onUp: () => {
      dragRef.current = false;
    },
    onHover: (e, canvas) => {
      // 데스크톱: 호버로도 쿼드를 따라가게(과정을 더 잘 느끼도록).
      const picked = pickQuad(e, canvas);
      if (picked) setQ(picked);
    },
  });

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 380, touchAction: 'none', display: 'block', cursor: 'pointer' }}
      />
      <figcaption>
        한 픽셀(<span style={{ color: 'var(--muted)' }}>me</span>)이 자기 텍스처 좌표 u의{' '}
        <em>변화율</em>을 알려면 이웃이 필요합니다. 그 이웃이 바로 같은 쿼드의{' '}
        <span style={{ color: COLORS.covered }}>오른쪽(right)</span>·
        <span style={{ color: COLORS.front }}>아래(below)</span> 픽셀입니다. 하드웨어는 단순한
        유한차분으로 화면공간 미분을 구합니다: <strong>ddx = right − me</strong>,{' '}
        <strong>ddy = below − me</strong>. 이것이 쿼드가 <em>꼭 2×2여야 하는</em> 진짜 이유입니다 —
        가로·세로 이웃이 한 묶음에 다 있어야 한 번에 두 미분을 뽑으니까요.{' '}
        <strong>직접 해보세요:</strong> 쿼드를 위쪽(먼 쪽)으로 옮겨 보세요. 같은 면인데도 텍셀이
        화면에서 더 빨리 흐르므로 ddx·ddy가 커집니다. 이 커진 미분이 다음 절에서 더 흐린 밉 레벨을
        고르게 만듭니다.
      </figcaption>
    </figure>
  );
}
