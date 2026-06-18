import { useMemo, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { UE_COLORS, roundRect, withAlpha, drawArrow, monoFont } from './ue2d';

// ---------------------------------------------------------------------------
// 모델: Page Fault — 해제됐거나 아직 안 올라온 리소스에 접근
//
// 출처: Luke Thatcher (Epic) 발표.
// - Page Fault: 메모리에서 해제됐거나(evicted) 아직 레지던트가 아닌 리소스에
//   셰이더가 접근 → 존재하지 않는 주소 접근 → 크래시.
// - 예시 #3: "MIP3가 없는데 참조" → page fault (메모리 부족으로 해제됐는데 접근).
// - 페이지 폴트 주소/MIP 정보는 벤더 소프트웨어로 확인(NVIDIA = Aftermath).
//
// 이 위젯: 텍스처의 MIP 체인(MIP0..MIP4)을 박스로 보여준다. MIP0이 가장 크고
// 메모리를 많이 먹는다. "메모리 예산" 슬라이더가 작아지면 고해상도 MIP부터
// 해제(evict)되어 회색 빗금으로 바뀐다. "참조 MIP"로 셰이더가 샘플할 MIP을
// 고른다. 참조한 MIP이 레지던트면 ✅ 정상 샘플, 해제됐으면 PAGE FAULT.
// ---------------------------------------------------------------------------

const CANVAS_H = 320;
const N_MIPS = 5; // MIP0 .. MIP4

// 각 MIP의 메모리 비용(상대값). MIP0이 가장 큼, 4분의 1씩 줄어든다.
// 비용 = 4^(N-1-level): MIP0=256, MIP1=64, MIP2=16, MIP3=4, MIP4=1.
function mipCost(level: number): number {
  return Math.pow(4, N_MIPS - 1 - level);
}
const TOTAL_COST = Array.from({ length: N_MIPS }, (_, i) => mipCost(i)).reduce(
  (a, b) => a + b,
  0,
); // = 341

/**
 * 레지던시 계산: 예산 안에서 작은 MIP(높은 level)부터 채우고, 큰 MIP은
 * 예산이 부족하면 해제 상태로 남긴다.
 * budgetFrac: 0..1, 전체 비용 대비 사용 가능 메모리.
 * 반환: 각 level의 resident 여부.
 */
function residency(budgetFrac: number): boolean[] {
  const budget = budgetFrac * TOTAL_COST;
  // 작은 MIP(level N-1)부터 큰 MIP(level 0)으로 채운다.
  const resident = new Array<boolean>(N_MIPS).fill(false);
  let used = 0;
  for (let level = N_MIPS - 1; level >= 0; level--) {
    const c = mipCost(level);
    if (used + c <= budget) {
      resident[level] = true;
      used += c;
    } else {
      // 이 MIP을 넣을 예산이 없음 → 여기부터 위(더 큰 MIP)는 모두 해제.
      break;
    }
  }
  return resident;
}

/**
 * Page Fault 시각화 위젯.
 * MIP 체인의 레지던시를 메모리 예산으로 조절하고, 해제된 MIP을 참조하면
 * page fault가 나는 과정을 보여준다.
 */
export default function PageFaultViz() {
  // 예산: 전체의 35%면 MIP0(가장 큼)이 빠진다. 기본은 살짝 빠듯하게.
  const [budgetPct, setBudgetPct] = useState(40);
  const [refMip, setRefMip] = useState(0); // 참조 MIP level

  const resident = useMemo(() => residency(budgetPct / 100), [budgetPct]);
  const fault = !resident[refMip];

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 16;

    // 제목
    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('텍스처 MIP 체인 — 레지던시 & 페이지 폴트', padX, 20);

    // MIP 박스들을 가로로 배치. 크기는 균등(라벨 가독성 우선), 비용은 텍스트로.
    const boxTop = 44;
    const boxH = 64;
    const gap = 8;
    const totalGap = gap * (N_MIPS - 1);
    const boxW = (w - padX * 2 - totalGap) / N_MIPS;

    // 셰이더 표현(맨 아래) → 참조 MIP으로 화살표
    const shaderY = boxTop + boxH + 70;

    const boxX = (level: number): number => padX + level * (boxW + gap);

    for (let level = 0; level < N_MIPS; level++) {
      const x = boxX(level);
      const isRes = resident[level];
      const isRef = level === refMip;
      const isFault = isRef && fault;

      roundRect(ctx, x, boxTop, boxW, boxH, 6);
      if (isRes) {
        ctx.fillStyle = withAlpha(UE_COLORS.copy, 0.75);
        ctx.fill();
        ctx.strokeStyle = UE_COLORS.copy;
        ctx.lineWidth = isRef ? 2.5 : 1.2;
        ctx.stroke();
      } else {
        // 해제됨: 회색 + 빗금
        ctx.fillStyle = withAlpha(theme.muted, 0.12);
        ctx.fill();
        ctx.strokeStyle = isFault ? UE_COLORS.bad : withAlpha(theme.muted, 0.6);
        ctx.lineWidth = isFault ? 2.5 : 1.2;
        ctx.stroke();
        // 빗금
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, x, boxTop, boxW, boxH, 6);
        ctx.clip();
        ctx.strokeStyle = withAlpha(isFault ? UE_COLORS.bad : theme.muted, 0.45);
        ctx.lineWidth = 1;
        for (let hx = -boxH; hx < boxW; hx += 8) {
          ctx.beginPath();
          ctx.moveTo(x + hx, boxTop + boxH);
          ctx.lineTo(x + hx + boxH, boxTop);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 참조 MIP 강조 테두리(점선)
      if (isRef && !isFault) {
        ctx.strokeStyle = UE_COLORS.ok;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 2;
        roundRect(ctx, x - 2, boxTop - 2, boxW + 4, boxH + 4, 7);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 라벨
      ctx.font = monoFont(11);
      ctx.fillStyle = isRes ? '#fff' : theme.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`MIP${level}`, x + boxW / 2, boxTop + boxH / 2 - 7);
      ctx.font = monoFont(9);
      ctx.fillStyle = isRes ? withAlpha('#ffffff', 0.85) : theme.muted;
      ctx.fillText(isRes ? '올라옴' : '해제됨', x + boxW / 2, boxTop + boxH / 2 + 9);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';

      // 상대 해상도/비용 표시(위)
      ctx.font = monoFont(8);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'center';
      ctx.fillText(`${mipCost(level)}u`, x + boxW / 2, boxTop - 5);
      ctx.textAlign = 'left';
    }

    // 셰이더 박스
    const shaderW = Math.min(170, w - padX * 2);
    const shaderX = w / 2 - shaderW / 2;
    roundRect(ctx, shaderX, shaderY, shaderW, 30, 6);
    ctx.fillStyle = withAlpha(fault ? UE_COLORS.bad : UE_COLORS.graphics, 0.16);
    ctx.fill();
    ctx.strokeStyle = fault ? UE_COLORS.bad : UE_COLORS.graphics;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = monoFont(10);
    ctx.fillStyle = fault ? UE_COLORS.bad : UE_COLORS.graphics;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`셰이더: Sample(tex, MIP${refMip})`, shaderX + shaderW / 2, shaderY + 15);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 셰이더 → 참조 MIP 접근 화살표
    const rx = boxX(refMip) + boxW / 2;
    drawArrow(
      ctx,
      shaderX + shaderW / 2,
      shaderY,
      rx,
      boxTop + boxH + 4,
      fault ? UE_COLORS.bad : UE_COLORS.ok,
      { dashed: true, width: 1.8, head: 7 },
    );

    // 판정 바
    const vy = shaderY + 40;
    const vColor = fault ? UE_COLORS.bad : UE_COLORS.ok;
    roundRect(ctx, padX, vy, w - padX * 2, 30, 6);
    ctx.fillStyle = withAlpha(vColor, 0.14);
    ctx.fill();
    ctx.strokeStyle = vColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = monoFont(11);
    ctx.fillStyle = vColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const verdict = fault
      ? `⛔ page fault: MIP${refMip} 참조했지만 메모리 부족으로 해제됨 → 존재하지 않는 주소 접근`
      : `✅ valid sample: MIP${refMip}이 레지던트(올라옴) — 정상 접근`;
    ctx.fillText(verdict, padX + (w - padX * 2) / 2, vy + 15);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, [resident, refMip, fault, budgetPct]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block' }}
      />
      <ControlPanel>
        <Slider
          label="메모리 예산"
          value={budgetPct}
          min={5}
          max={100}
          step={1}
          onChange={setBudgetPct}
          format={(v) => `${v}%`}
        />
        <Slider
          label="참조 MIP"
          value={refMip}
          min={0}
          max={N_MIPS - 1}
          step={1}
          onChange={(v) => setRefMip(Math.round(v))}
          format={(v) => `MIP${Math.round(v)}`}
        />
      </ControlPanel>
      <div
        style={{
          marginTop: '0.6rem',
          fontSize: '0.85rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--muted)',
          lineHeight: 1.7,
        }}
      >
        레지던트:{' '}
        <span style={{ color: UE_COLORS.copy }}>
          {resident
            .map((r, i) => (r ? `MIP${i}` : null))
            .filter(Boolean)
            .join(' ') || '없음'}
        </span>
        {' · '}참조 MIP{refMip}:{' '}
        <span style={{ color: fault ? UE_COLORS.bad : UE_COLORS.ok }}>
          {fault ? 'PAGE FAULT' : 'valid'}
        </span>
      </div>
      <figcaption>
        텍스처는 여러 해상도의 <strong>MIP 체인</strong>(MIP0이 가장 크고 4배씩 작아짐)으로 들고 있고,
        각 MIP은 GPU 메모리에 <em>올라와 있거나(resident)</em> <em>해제된(evicted)</em> 상태입니다.
        메모리가 빠듯하면 가장 비싼 고해상도 MIP부터 밀려나 회색 빗금으로 바뀝니다. 셰이더가 어떤 MIP을
        샘플하려 할 때, 그 MIP이 해제됐거나 애초에 올라온 적이 없으면{' '}
        <strong>존재하지 않는 주소</strong>를 읽게 되고 — 이것이 <strong>page fault</strong>입니다.
        발표의 예시 #3이 정확히 이것: “MIP3가 없는데 참조”했고, 메모리 부족으로 해제됐던 겁니다. 폴트가
        난 주소나 어느 MIP였는지 같은 세부 정보는 <strong>벤더 소프트웨어</strong>로 확인합니다(NVIDIA =
        <strong> Aftermath</strong>). (출처: Luke Thatcher (Epic) 발표.)
        <br />
        <strong>직접 해보세요:</strong> “메모리 예산”을 줄여 보세요 — MIP0, MIP1처럼 비싼 MIP부터 차례로
        해제됩니다. 그 상태에서 “참조 MIP”을 해제된 MIP으로 옮기면, 셰이더 접근이 빨갛게 표시되며 page
        fault가 납니다.
      </figcaption>
    </figure>
  );
}
