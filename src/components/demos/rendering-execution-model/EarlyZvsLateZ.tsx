import { useState } from 'react';
import { ControlPanel, SelectControl, ToggleControl, type SelectOption } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, roundRect, monoFont } from './re2d';

// Early-Z vs Late-Z: 두 겹친 사각형을 그린다.
// - 그리기 순서(앞→뒤 / 뒤→앞)
// - 깊이 테스트 위치(픽셀 셰이더 *전* early-Z / *후* late-Z)
// 를 바꾸면 픽셀 셰이더 호출 수가 달라진다. (front-to-back + early-Z 가 최소)
//
// 모델: 화면을 세 영역으로 나눈다 — A만, 겹침, B만.
// 각 영역의 픽셀 수(가중치)를 두고, 각 드로우가 그 영역에서 PS를 몇 번 부르는지 센다.

type Order = 'frontToBack' | 'backToFront';

const ORDERS: ReadonlyArray<SelectOption<Order>> = [
  { value: 'frontToBack', label: '앞 → 뒤 (가까운 것 먼저)' },
  { value: 'backToFront', label: '뒤 → 앞 (먼 것 먼저)' },
];

// 영역별 픽셀 비중(도식이므로 작은 정수). 겹침이 가장 비싼 곳.
const AREA_A_ONLY = 6;
const AREA_OVERLAP = 6;
const AREA_B_ONLY = 6;

// A는 가까운 면(front, 청록), B는 먼 면(back, 분홍).
// PS 호출 수를 영역별로 계산.
function invocations(order: Order, earlyZ: boolean): {
  aOnly: number;
  overlapA: number;
  overlapB: number;
  bOnly: number;
  total: number;
} {
  // A-only, B-only 영역은 항상 한 번씩 셰이딩(가려지지 않음).
  const aOnly = AREA_A_ONLY;
  const bOnly = AREA_B_ONLY;
  let overlapA = 0;
  let overlapB = 0;

  if (order === 'frontToBack') {
    // A(가까움) 먼저: 겹침에서 A를 셰이딩하고 깊이를 A로 채움.
    overlapA = AREA_OVERLAP;
    // 그다음 B(멈): 겹침에선 B가 A보다 뒤라 깊이 테스트 실패.
    if (earlyZ) {
      overlapB = 0; // early-Z: 셰이더 *전* 기각 → 호출 0
    } else {
      overlapB = AREA_OVERLAP; // late-Z: 셰이딩 다 하고 *나중에* 버림 → 낭비
    }
  } else {
    // B(멈) 먼저: 겹침에서 B 셰이딩, 깊이를 B로.
    overlapB = AREA_OVERLAP;
    // 그다음 A(가까움): 겹침에서 A가 더 앞 → 테스트 통과 → 항상 셰이딩(덮어씀).
    overlapA = AREA_OVERLAP;
    // early-Z든 late-Z든 A는 통과하므로 호출 수 동일. (단 B 셰이딩은 이미 낭비됨)
  }
  return {
    aOnly,
    overlapA,
    overlapB,
    bOnly,
    total: aOnly + overlapA + overlapB + bOnly,
  };
}

export default function EarlyZvsLateZ() {
  const [order, setOrder] = useState<Order>('backToFront');
  const [earlyZ, setEarlyZ] = useState(false);

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const inv = invocations(order, earlyZ);

    // --- 위쪽: 장면 도식(두 겹친 사각형) ---
    const sceneH = h * 0.52;
    const cx = w / 2;
    const boxW = Math.min(w * 0.32, 150);
    const boxH = sceneH * 0.5;
    const cy = sceneH * 0.5;
    // B(먼, 분홍) 살짝 위/왼, A(가까운, 청록) 살짝 아래/오른 — 겹치게.
    const bx = cx - boxW * 0.55;
    const by = cy - boxH * 0.4;
    const ax = cx - boxW * 0.05;
    const ay = cy - boxH * 0.1;

    // B 먼저 그려 뒤에 깔리게(시각적으로). A는 위에.
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
    const labelW = 132;
    const maxTotal = AREA_A_ONLY + AREA_OVERLAP + AREA_B_ONLY + AREA_OVERLAP; // 최악
    const barAreaW = w - labelW - 24;
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
          {
            n: inv.overlapB,
            col: COLORS.back,
            // 뒤→앞 순서에서 B의 겹침 셰이딩은 나중에 A에 덮여 낭비.
            waste: order === 'backToFront',
          },
        ],
      },
    ];

    let y = barTop;
    for (const row of rows) {
      ctx.font = monoFont(11, 'bold');
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
          // 낭비는 빗금 + 빨강 외곽.
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

    // 총합 카운터(짧게)
    ctx.font = monoFont(13, 'bold');
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    const wasted = order === 'backToFront' ? inv.overlapB : earlyZ ? 0 : inv.overlapB;
    ctx.fillText(`PS 호출 ${inv.total}회 (낭비 ${wasted}회)`, 8, y + 6);
  };

  const { ref } = useCanvas2d(draw, [order, earlyZ]);

  const inv = invocations(order, earlyZ);
  const wasted = order === 'backToFront' ? inv.overlapB : earlyZ ? 0 : inv.overlapB;

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 320, display: 'block' }} />
      <ControlPanel>
        <SelectControl label="그리기 순서" value={order} options={ORDERS} onChange={setOrder} />
        <ToggleControl label="early-Z (셰이더 전 깊이 테스트)" checked={earlyZ} onChange={setEarlyZ} />
      </ControlPanel>
      <figcaption>
        두 사각형이 겹쳐 있습니다 — <span style={{ color: COLORS.front }}>A</span>가 카메라에 더
        가깝고 <span style={{ color: COLORS.back }}>B</span>는 뒤입니다. 겹친 영역은 결국 A만 보이므로,
        그 자리에서 B를 셰이딩한 일은 <strong style={{ color: COLORS.reject }}>낭비</strong>입니다.
        막대는 각 드로우가 픽셀 셰이더를 부른 횟수이고, 빨강 빗금이 버려진 호출입니다. 지금 총{' '}
        <strong>{inv.total}회</strong> 중 <strong>{wasted}회</strong>가 낭비입니다.{' '}
        <strong>직접 비교해 보세요:</strong> (1) <em>뒤→앞</em>으로 그리면 B를 먼저 다 셰이딩한 뒤
        A가 덮어써, early-Z를 켜도 B의 겹침 셰이딩은 이미 끝나 버려 못 막습니다. (2){' '}
        <em>앞→뒤</em>로 그리고 early-Z를 켜면, A가 먼저 깊이를 채워 두므로 B의 겹침 픽셀은 셰이더가{' '}
        <em>돌기도 전에</em> 기각됩니다 — 낭비 0. 이 조합(front-to-back + early-Z)이 호출 수 최소입니다.
        그래서 불투명 지오메트리는 대략 가까운 순으로 정렬해 그립니다.
      </figcaption>
    </figure>
  );
}
