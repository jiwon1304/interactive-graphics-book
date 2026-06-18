import { useMemo } from 'react';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { UE_COLORS, roundRect, withAlpha, drawArrow, monoFont } from './ue2d';

// ---------------------------------------------------------------------------
// 정적 도식: Page Fault — 해제됐거나 아직 안 올라온 리소스에 접근
//
// 출처: Luke Thatcher (Epic) 발표.
// - Page Fault: 메모리에서 해제됐거나(evicted) 아직 레지던트가 아닌 리소스에
//   셰이더가 접근 → 존재하지 않는 주소 접근 → 크래시.
// - 예시 #3: "MIP3가 없는데 참조" → page fault (메모리 부족으로 해제됐는데 접근).
// - 페이지 폴트 주소/MIP 정보는 벤더 소프트웨어로 확인(NVIDIA = Aftermath).
//
// 이 그림은 발표 예시 #3을 그대로 정지시킨다(인터랙티브 아님): 메모리가
// 빠듯해 비싼 고해상도 MIP(MIP0..MIP3)이 해제된 상태에서 셰이더가
// 해제된 MIP3을 샘플 → page fault.
// ---------------------------------------------------------------------------

const CANVAS_H = 320;
const N_MIPS = 5; // MIP0 .. MIP4

// 정적 대표값(발표 예시 #3): 메모리가 빠듯해 MIP3을 포함한 고해상도가 해제됨,
// 셰이더는 해제된 MIP3을 참조한다.
const BUDGET_FRAC = 0.01; // 전체 비용 대비 가용 메모리 (아주 빠듯)
const REF_MIP = 3; // 셰이더가 샘플하는 MIP — 해제됨 → fault

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
 */
function residency(budgetFrac: number): boolean[] {
  const budget = budgetFrac * TOTAL_COST;
  const resident = new Array<boolean>(N_MIPS).fill(false);
  let used = 0;
  for (let level = N_MIPS - 1; level >= 0; level--) {
    const c = mipCost(level);
    if (used + c <= budget) {
      resident[level] = true;
      used += c;
    } else {
      break;
    }
  }
  return resident;
}

export default function PageFaultViz() {
  const resident = useMemo(() => residency(BUDGET_FRAC), []);
  const fault = !resident[REF_MIP];

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
    ctx.fillText('텍스처 MIP 체인 — 레지던시 & 페이지 폴트 (발표 예시 #3)', padX, 20);

    // MIP 박스들을 가로로 배치. 비용(u)은 텍스트로.
    const boxTop = 44;
    const boxH = 64;
    const gap = 8;
    const totalGap = gap * (N_MIPS - 1);
    const boxW = (w - padX * 2 - totalGap) / N_MIPS;
    const shaderY = boxTop + boxH + 70;
    const boxX = (level: number): number => padX + level * (boxW + gap);

    for (let level = 0; level < N_MIPS; level++) {
      const x = boxX(level);
      const isRes = resident[level];
      const isRef = level === REF_MIP;
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

      // 참조 MIP 강조 테두리(점선) — fault면 빨강, 정상이면 초록
      if (isRef) {
        ctx.strokeStyle = isFault ? UE_COLORS.bad : UE_COLORS.ok;
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

      // 상대 비용 표시(위)
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
    ctx.fillText(`셰이더: Sample(tex, MIP${REF_MIP})`, shaderX + shaderW / 2, shaderY + 15);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 셰이더 → 참조 MIP 접근 화살표
    const rx = boxX(REF_MIP) + boxW / 2;
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
      ? `⛔ page fault: MIP${REF_MIP}을 참조했지만 메모리 부족으로 해제됨 → 존재하지 않는 주소 접근`
      : `✅ valid sample: MIP${REF_MIP}이 레지던트(올라옴) — 정상 접근`;
    ctx.fillText(verdict, padX + (w - padX * 2) / 2, vy + 15);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, []);

  const residentList =
    resident
      .map((r, i) => (r ? `MIP${i}` : null))
      .filter(Boolean)
      .join(' ') || '없음';

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block' }}
      />
      <div
        style={{
          marginTop: '0.6rem',
          fontSize: '0.85rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--muted)',
          lineHeight: 1.7,
        }}
      >
        레지던트: <span style={{ color: UE_COLORS.copy }}>{residentList}</span>
        {' · '}참조 MIP{REF_MIP}:{' '}
        <span style={{ color: fault ? UE_COLORS.bad : UE_COLORS.ok }}>
          {fault ? 'PAGE FAULT' : 'valid'}
        </span>
      </div>
      <figcaption>
        텍스처는 여러 해상도의 <strong>MIP 체인</strong>(MIP0이 가장 크고 4배씩 작아짐 — 위의{' '}
        <code>u</code> 값이 상대 메모리 비용)으로 들고 있고, 각 MIP은 GPU 메모리에{' '}
        <em>올라와 있거나(resident)</em> <em>해제된(evicted)</em> 상태입니다. 메모리가 빠듯하면 가장
        비싼 고해상도 MIP부터 밀려나 회색 빗금으로 바뀝니다 — 위 그림에선 작은 MIP4만 남고 MIP0~MIP3이
        모두 해제됐습니다. 셰이더가 해제된 <strong>MIP3</strong>을 샘플하려 하자{' '}
        <strong>존재하지 않는 주소</strong>를 읽게 되고 — 이것이 <strong>page fault</strong>입니다(빨간
        화살표·테두리). 발표의 예시 #3이 정확히 이것: "MIP3가 없는데 참조"했고, 메모리 부족으로
        해제됐던 겁니다. 폴트가 난 주소나 어느 MIP였는지 같은 세부 정보는 <strong>벤더 소프트웨어</strong>
        로 확인합니다(NVIDIA = <strong>Aftermath</strong>). (출처: Luke Thatcher (Epic) 발표.)
      </figcaption>
    </figure>
  );
}
