import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, roundRect, monoFont, drawArrow } from './tbr2d';

// TileBinning (정적 데이터플로): vertex/geometry → 화면 타일 격자에 삼각형을 비닝 →
// 타일별 픽셀 처리. 3박스 플로우 + 타일 격자에 삼각형 몇 개를 색칠해, 각 삼각형이
// 어떤 타일들에 걸치는지(그 타일의 primitive 리스트에 들어가는지) 보인다.
// 글자 최소 — 설명은 figcaption.

// 고정 삼각형 셋(시드 없는 결정값, SSR 안전).
interface Tri {
  pts: [number, number, number, number, number, number]; // x0,y0,x1,y1,x2,y2 (격자 단위 0..GX/GY)
  col: string;
}

const GX = 6; // 격자 타일 열
const GY = 4; // 격자 타일 행

const TRIS: ReadonlyArray<Tri> = [
  { pts: [0.4, 0.5, 3.2, 0.8, 1.4, 2.6], col: COLORS.geom },
  { pts: [3.0, 1.2, 5.6, 0.6, 5.2, 3.0], col: COLORS.warn },
  { pts: [1.0, 2.4, 2.6, 3.6, 0.3, 3.4], col: COLORS.power },
];

// 점이 타일(셀) 안인지: 삼각형이 셀 사각형과 겹치는지를 셀 중심 + 코너 샘플로 근사.
function triCoversTile(tri: Tri, tx: number, ty: number): boolean {
  const [x0, y0, x1, y1, x2, y2] = tri.pts;
  const sign = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
    (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  const inside = (px: number, py: number) => {
    const d1 = sign(px, py, x0, y0, x1, y1);
    const d2 = sign(px, py, x1, y1, x2, y2);
    const d3 = sign(px, py, x2, y2, x0, y0);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };
  // 셀 내부 4×4 샘플 그리드로 겹침 근사.
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      if (inside(tx + i / 4, ty + j / 4)) return true;
    }
  }
  return false;
}

export default function TileBinning() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;

    // --- 상단: 3박스 파이프라인 ---
    const boxH = 34;
    const boxY = 8;
    const gap = 10;
    const boxW = (w - gap * 2 - 16) / 3;
    const boxes = [
      { t: 'geometry', sub: 'vertex 처리', col: COLORS.geom },
      { t: 'binning', sub: '타일별 prim 리스트', col: COLORS.tile },
      { t: 'render', sub: '타일마다 픽셀', col: COLORS.gmem },
    ];
    boxes.forEach((b, i) => {
      const x = 8 + i * (boxW + gap);
      roundRect(ctx, x, boxY, boxW, boxH, 6);
      ctx.fillStyle = withAlpha(b.col, 0.14);
      ctx.fill();
      ctx.strokeStyle = withAlpha(b.col, 0.8);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.font = monoFont(12, 'bold');
      ctx.fillStyle = b.col;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.t, x + boxW / 2, boxY + 12);
      ctx.font = monoFont(9);
      ctx.fillStyle = theme.muted;
      ctx.fillText(b.sub, x + boxW / 2, boxY + 25);
      if (i < boxes.length - 1) {
        const ax = x + boxW + 1;
        drawArrow(ctx, ax, boxY + boxH / 2, ax + gap - 2, boxY + boxH / 2, theme.muted, 1.6, 6);
      }
    });
    ctx.textBaseline = 'alphabetic';

    // --- 하단: 타일 격자 + 삼각형 ---
    const gridTop = boxY + boxH + 22;
    const gridPad = 8;
    const gw = w - gridPad * 2;
    const gh = h - gridTop - 8;
    const cellW = gw / GX;
    const cellH = gh / GY;
    const gx = (tx: number) => gridPad + tx * cellW;
    const gy = (ty: number) => gridTop + ty * cellH;

    // 타일 채우기: 어떤 삼각형이라도 걸친 셀을 옅게 강조(그 삼각형 색으로).
    for (let ty = 0; ty < GY; ty++) {
      for (let tx = 0; tx < GX; tx++) {
        const hitting = TRIS.filter((t) => triCoversTile(t, tx, ty));
        if (hitting.length > 0) {
          // 여러 삼각형이 겹치면 가장 마지막 색을 옅게.
          ctx.fillStyle = withAlpha(hitting[hitting.length - 1].col, 0.1 + 0.06 * hitting.length);
          ctx.fillRect(gx(tx), gy(ty), cellW, cellH);
        }
      }
    }

    // 격자선
    ctx.strokeStyle = withAlpha(theme.text, 0.18);
    ctx.lineWidth = 1;
    for (let i = 0; i <= GX; i++) {
      ctx.beginPath();
      ctx.moveTo(gx(i), gridTop);
      ctx.lineTo(gx(i), gridTop + gh);
      ctx.stroke();
    }
    for (let j = 0; j <= GY; j++) {
      ctx.beginPath();
      ctx.moveTo(gridPad, gy(j));
      ctx.lineTo(gridPad + gw, gy(j));
      ctx.stroke();
    }

    // 삼각형 외곽
    for (const t of TRIS) {
      const [x0, y0, x1, y1, x2, y2] = t.pts;
      ctx.beginPath();
      ctx.moveTo(gx(x0), gy(y0));
      ctx.lineTo(gx(x1), gy(y1));
      ctx.lineTo(gx(x2), gy(y2));
      ctx.closePath();
      ctx.fillStyle = withAlpha(t.col, 0.32);
      ctx.fill();
      ctx.strokeStyle = t.col;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    // 타일 좌표 라벨(한 셀에만, 글자 최소)
    ctx.font = monoFont(8);
    ctx.fillStyle = withAlpha(theme.muted, 0.7);
    ctx.textAlign = 'left';
    ctx.fillText('tile', gx(GX - 1) + 3, gy(GY - 1) + 11);
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 300, display: 'block' }} />
      </div>
      <figcaption>
        TBR은 IMR과 달리 지오메트리를 <strong>한 번에 다 먼저</strong> 처리합니다(왼쪽 박스). 모든
        삼각형을 변환·클립한 뒤, 각 삼각형이 화면의 어느 <strong>타일</strong>에 걸치는지 가려내
        타일마다 "여기 들어오는 primitive 목록"을 만듭니다 — 이게{' '}
        <strong style={{ color: COLORS.tile }}>binning</strong>(가운데)이고, 그 목록은 DRAM의{' '}
        <em>parameter buffer</em>에 쌓입니다. 마지막으로 GPU는 타일을 하나씩 골라, 그 타일의 목록에
        있는 삼각형만 온칩에서 셰이딩합니다(오른쪽). 아래 격자가 화면이고, 색칠된 칸은 그 색
        삼각형이 걸친 타일 — 즉 그 타일의 목록에 그 삼각형이 들어갑니다. 한 삼각형이 여러 타일에,
        한 타일이 여러 삼각형에 속할 수 있습니다. binning이 끝나야 타일 단위 렌더가 시작되므로,
        TBR은 한 프레임의 모든 지오메트리를 미리 알아야 합니다 — 이 "먼저 다 모으는" 대가가 곧
        parameter buffer 트래픽입니다.
      </figcaption>
    </figure>
  );
}
