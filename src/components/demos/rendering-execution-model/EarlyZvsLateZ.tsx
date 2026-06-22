import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, roundRect, monoFont } from './re2d';

// Early-Z vs Late-Z (정적): 두 겹친 사각형. 대표 상태는 뒤→앞 그리기 + late-Z —
// B(먼 면)를 먼저 다 셰이딩한 뒤 A(가까운 면)가 겹침을 덮어써, B의 겹침 셰이딩이 통째로 낭비된다.
// front-to-back + early-Z가 호출 최소인 이유는 figcaption.
//
// 모델: 화면을 A만 / 겹침 / B만 세 영역으로 나누고 각 드로우의 PS 호출 수를 센다.

const AREA_A_ONLY = 6;
const AREA_OVERLAP = 6;
const AREA_B_ONLY = 6;

// 대표: 뒤→앞(backToFront) + late-Z. 겹침에서 B와 A를 모두 셰이딩 → B 겹침이 낭비.
const inv = {
  aOnly: AREA_A_ONLY,
  overlapA: AREA_OVERLAP,
  overlapB: AREA_OVERLAP,
  bOnly: AREA_B_ONLY,
  total: AREA_A_ONLY + AREA_OVERLAP + AREA_OVERLAP + AREA_B_ONLY,
};
const WASTED = AREA_OVERLAP; // B의 겹침 셰이딩

export default function EarlyZvsLateZ() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;

    // --- 위쪽: 장면 도식(두 겹친 사각형) ---
    const sceneH = h * 0.52;
    const cx = w / 2;
    const boxW = Math.min(w * 0.34, 150);
    const boxH = sceneH * 0.5;
    const cy = sceneH * 0.5;
    const bx = cx - boxW * 0.55;
    const by = cy - boxH * 0.4;
    const ax = cx - boxW * 0.05;
    const ay = cy - boxH * 0.1;

    roundRect(ctx, bx, by, boxW, boxH, 8);
    ctx.fillStyle = withAlpha(COLORS.back, 0.85);
    ctx.fill();
    roundRect(ctx, ax, ay, boxW, boxH, 8);
    ctx.fillStyle = withAlpha(COLORS.front, 0.92);
    ctx.fill();

    ctx.font = monoFont(13, 'bold');
    ctx.fillStyle = theme.bg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B (먼)', bx + boxW * 0.28, by + boxH * 0.28);
    ctx.fillText('A (가까움)', ax + boxW * 0.55, ay + boxH * 0.72);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'start';

    // --- 아래쪽: PS 호출 막대 ---
    const barTop = sceneH + 14;
    const barH = 26;
    const labelW = 70;
    const maxTotal = AREA_A_ONLY + AREA_OVERLAP + AREA_B_ONLY + AREA_OVERLAP;
    const barAreaW = w - labelW - 16;
    const unit = barAreaW / maxTotal;

    const rows: Array<{ name: string; segs: Array<{ n: number; col: string; waste?: boolean }> }> = [
      {
        name: 'A 드로우',
        segs: [
          { n: inv.aOnly, col: COLORS.front },
          { n: inv.overlapA, col: COLORS.front },
        ],
      },
      {
        name: 'B 드로우',
        segs: [
          { n: inv.bOnly, col: COLORS.back },
          { n: inv.overlapB, col: COLORS.back, waste: true },
        ],
      },
    ];

    let y = barTop;
    for (const row of rows) {
      ctx.font = monoFont(12, 'bold');
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.name, 8, y + barH / 2);
      let x = labelW;
      for (const seg of row.segs) {
        if (seg.n <= 0) continue;
        const segW = seg.n * unit;
        roundRect(ctx, x, y, segW - 2, barH, 4);
        if (seg.waste) {
          ctx.fillStyle = withAlpha(COLORS.helper, 0.22);
          ctx.fill();
          ctx.save();
          roundRect(ctx, x, y, segW - 2, barH, 4);
          ctx.clip();
          ctx.strokeStyle = withAlpha(COLORS.reject, 0.9);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let dd = -barH; dd < segW; dd += 6) {
            ctx.moveTo(x + dd, y);
            ctx.lineTo(x + dd + barH, y + barH);
          }
          ctx.stroke();
          ctx.restore();
          roundRect(ctx, x, y, segW - 2, barH, 4);
          ctx.strokeStyle = COLORS.reject;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        } else {
          ctx.fillStyle = withAlpha(seg.col, 0.8);
          ctx.fill();
        }
        x += segW;
      }
      ctx.textBaseline = 'alphabetic';
      y += barH + 12;
    }

    // 총합 카운터
    ctx.font = monoFont(13, 'bold');
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.fillText(`뒤→앞 · late-Z — PS 호출 ${inv.total}회 (낭비 ${WASTED}회)`, 8, y + 6);
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 320, display: 'block' }} />
      </div>
      <figcaption>
        두 사각형이 겹쳐 있습니다 — <span style={{ color: COLORS.front }}>A</span>가 카메라에 더
        가깝고 <span style={{ color: COLORS.back }}>B</span>는 뒤입니다. 겹친 영역은 결국 A만 보이므로,
        그 자리에서 B를 셰이딩한 일은 <strong style={{ color: COLORS.reject }}>낭비</strong>입니다.
        막대는 각 드로우가 픽셀 셰이더를 부른 횟수이고, 빨강 빗금이 버려진 호출입니다. 여기 그린{' '}
        <em>뒤→앞 + late-Z</em> 상태는 총 <strong>{inv.total}회</strong> 중{' '}
        <strong>{WASTED}회</strong>가 낭비입니다 — B를 먼저 다 셰이딩한 뒤 A가 덮어쓰므로, early-Z를
        켜도 B의 겹침 셰이딩은 이미 끝나 버려 못 막습니다. 반대로 <em>앞→뒤</em>로 그리고 early-Z를
        켜면 A가 먼저 깊이를 채워 두므로 B의 겹침 픽셀은 셰이더가 <em>돌기도 전에</em> 기각됩니다 —
        낭비 0. 이 조합(front-to-back + early-Z)이 호출 수 최소라, 불투명 지오메트리는 대략 가까운
        순으로 정렬해 그립니다.
      </figcaption>
    </figure>
  );
}
