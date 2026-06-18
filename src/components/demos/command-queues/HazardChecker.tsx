import { useMemo, useRef, useState } from 'react';
import { ControlPanel, SelectControl, ToggleControl } from '../../controls';
import type { SelectOption } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import { QUEUE_COLORS, withAlpha, roundRect, drawArrow, pill } from './cq2d';

// ─────────────────────────────────────────────────────────────────────────────
// 해저드 체커
//
// 한 큐에서 하나의 리소스(텍스처/버퍼)에 연달아 작동하는 두 연산(A→B)을 두고,
// 사용자가 그 사이 틈에 "배리어 토큰"을 끌어다 놓는다. 배리어의 단계/접근(src/dst)
// 지정 여부와 레이아웃 전이 포함 여부를 토글로 바꾸면, 체커가 시나리오별로
// RAW/WAR/WAW 해저드가 막혔는지 정확히 판정한다.
//
//   (1) RAW: write → read  (렌더-투-텍스처 후 샘플)  배리어+레이아웃 전이 필요
//   (2) WAW: write → write (두 컴퓨트가 같은 버퍼에 기록)  배리어 필요(레이아웃 X)
//   (3) WAR: read  → write (샘플 후 덮어쓰기)  실행 의존성 배리어 필요
// ─────────────────────────────────────────────────────────────────────────────

type Scenario = 'RAW' | 'WAW' | 'WAR';

interface OpSpec {
  label: string;
  /** 'write' | 'read' */
  kind: 'write' | 'read';
  /** 카드 본문 보조 설명. */
  detail: string;
  /** 이 연산 시점의 이미지 레이아웃(RAW에서만 의미). null이면 레이아웃 미표시. */
  layout: string | null;
  /** 작업 큐 색(그래픽스/컴퓨트). */
  color: string;
}

interface ScenarioSpec {
  title: string;
  a: OpSpec;
  b: OpSpec;
  /** RAW만 레이아웃 전이가 필요. */
  needsLayout: boolean;
  /** 올바른 배리어의 단계/접근 라벨(읽기용). */
  srcStage: string;
  srcAccess: string;
  dstStage: string;
  dstAccess: string;
  /** 레이아웃 전이(RAW만). */
  oldLayout: string;
  newLayout: string;
  /** 해저드가 막히지 않을 때 무엇이 깨지는지. */
  corruptNote: string;
}

const SCENARIOS: Record<Scenario, ScenarioSpec> = {
  RAW: {
    title: 'RAW — 렌더 타깃에 그린 뒤 셰이더에서 샘플 (참 의존성)',
    a: {
      label: 'A: 렌더 타깃에 그리기',
      kind: 'write',
      detail: 'write · COLOR_ATTACHMENT_OUTPUT',
      layout: 'COLOR_ATTACHMENT',
      color: QUEUE_COLORS.graphics,
    },
    b: {
      label: 'B: 셰이더에서 샘플링',
      kind: 'read',
      detail: 'read · FRAGMENT_SHADER',
      layout: 'SHADER_READ_ONLY',
      color: QUEUE_COLORS.graphics,
    },
    needsLayout: true,
    srcStage: 'COLOR_ATTACHMENT_OUTPUT',
    srcAccess: 'COLOR_ATTACHMENT_WRITE',
    dstStage: 'FRAGMENT_SHADER',
    dstAccess: 'SHADER_READ',
    oldLayout: 'COLOR_ATTACHMENT_OPTIMAL',
    newLayout: 'SHADER_READ_ONLY_OPTIMAL',
    corruptNote:
      'B가 A의 쓰기가 끝나기 전에 읽음 → 이전 프레임/쓰레기 픽셀을 샘플(검증 오류 또는 깜빡임).',
  },
  WAW: {
    title: 'WAW — 두 컴퓨트 디스패치가 같은 버퍼에 기록',
    a: {
      label: 'A: 컴퓨트 기록 #1',
      kind: 'write',
      detail: 'write · COMPUTE_SHADER',
      layout: null,
      color: QUEUE_COLORS.compute,
    },
    b: {
      label: 'B: 컴퓨트 기록 #2',
      kind: 'write',
      detail: 'write · COMPUTE_SHADER',
      layout: null,
      color: QUEUE_COLORS.compute,
    },
    needsLayout: false,
    srcStage: 'COMPUTE_SHADER',
    srcAccess: 'SHADER_WRITE',
    dstStage: 'COMPUTE_SHADER',
    dstAccess: 'SHADER_WRITE',
    oldLayout: '',
    newLayout: '',
    corruptNote:
      '두 쓰기의 순서가 보장되지 않음 → 최종 값이 A인지 B인지 미정(레이스).',
  },
  WAR: {
    title: 'WAR — 샘플(read)한 뒤 같은 리소스를 덮어쓰기(write)',
    a: {
      label: 'A: 셰이더에서 샘플링',
      kind: 'read',
      detail: 'read · FRAGMENT_SHADER',
      layout: null,
      color: QUEUE_COLORS.graphics,
    },
    b: {
      label: 'B: 컴퓨트로 덮어쓰기',
      kind: 'write',
      detail: 'write · COMPUTE_SHADER',
      layout: null,
      color: QUEUE_COLORS.compute,
    },
    needsLayout: false,
    srcStage: 'FRAGMENT_SHADER',
    srcAccess: 'SHADER_READ',
    dstStage: 'COMPUTE_SHADER',
    dstAccess: 'SHADER_WRITE',
    oldLayout: '',
    newLayout: '',
    corruptNote:
      'B가 A의 읽기가 끝나기 전에 덮어씀 → A가 새 값을 읽어 잘못된 결과.',
  },
};

const scenarioOptions: ReadonlyArray<SelectOption<Scenario>> = [
  { value: 'RAW', label: '(1) RAW: write → read' },
  { value: 'WAW', label: '(2) WAW: write → write' },
  { value: 'WAR', label: '(3) WAR: read → write' },
];

// 판정 결과.
type Verdict = 'hazard' | 'missingLayout' | 'ok';

interface Evaluation {
  verdict: Verdict;
  /** 짧은 결론 + 이유(읽기용, 모노스페이스). */
  reason: string;
}

/**
 * 체커 핵심 로직. 시나리오 + (배리어 배치 여부, src/dst 지정 여부, 레이아웃 포함 여부)로
 * 정확히 판정한다.
 */
function evaluate(
  spec: ScenarioSpec,
  scen: Scenario,
  barrierPlaced: boolean,
  stagesSet: boolean,
  layoutIncluded: boolean,
): Evaluation {
  // 배리어가 없거나, 있어도 src/dst 단계·접근이 비어 있으면 의존성을 만들지 못함 → 해저드.
  if (!barrierPlaced || !stagesSet) {
    return {
      verdict: 'hazard',
      reason:
        `${scen} 해저드: ${spec.corruptNote} 필요한 배리어: ` +
        `srcStage=${spec.srcStage}, srcAccess=${spec.srcAccess} → ` +
        `dstStage=${spec.dstStage}, dstAccess=${spec.dstAccess}` +
        (spec.needsLayout
          ? `; 레이아웃 ${spec.oldLayout}→${spec.newLayout}.`
          : '.'),
    };
  }
  // 단계·접근은 맞지만 RAW인데 레이아웃 전이를 빠뜨림 → 두 번째 실패 모드.
  if (spec.needsLayout && !layoutIncluded) {
    return {
      verdict: 'missingLayout',
      reason:
        `레이아웃 전이 누락: 실행/메모리 의존성은 세웠지만 이미지가 아직 ` +
        `${spec.oldLayout} 상태 → 셰이더가 ${spec.newLayout}로 읽기를 기대해 ` +
        `쓰레기 샘플/검증 오류. ${spec.oldLayout}→${spec.newLayout} 전이를 추가하세요.`,
    };
  }
  // 모두 충족.
  return {
    verdict: 'ok',
    reason:
      `해저드 없음 — 올바른 동기화. srcStage=${spec.srcStage}, ` +
      `srcAccess=${spec.srcAccess} → dstStage=${spec.dstStage}, dstAccess=${spec.dstAccess}` +
      (spec.needsLayout ? `; 레이아웃 ${spec.oldLayout}→${spec.newLayout}.` : '.'),
  };
}

// 레이아웃 상수(CSS 픽셀).
const PAD = 18;
const CARD_Y = 54;
const CARD_H = 84;
const TRACK_GAP = 96; // A와 B 카드 사이 틈(드롭 존이 여기에).
const TOKEN_Y = 232; // 배리어 토큰 대기 위치(미배치 시).
const TOKEN_W = 96;
const TOKEN_H = 34;

export default function HazardChecker() {
  const [scen, setScen] = useState<Scenario>('RAW');
  const [barrierPlaced, setBarrierPlaced] = useState(false);
  const [stagesSet, setStagesSet] = useState(true); // 배치 후 단계 지정(기본 켬)
  const [layoutIncluded, setLayoutIncluded] = useState(false);

  const spec = SCENARIOS[scen];

  // 드래그 상태: ref로 보관(모바일 stale-closure 방지).
  const draggingRef = useRef(false);
  const placedRef = useRef(barrierPlaced);
  placedRef.current = barrierPlaced;

  const evalResult = useMemo(
    () => evaluate(spec, scen, barrierPlaced, stagesSet, layoutIncluded),
    [spec, scen, barrierPlaced, stagesSet, layoutIncluded],
  );

  // 배리어 통과 후 B의 리소스 상태가 바뀌는지(올바른 RAW 전이일 때만 새 레이아웃).
  const bLayoutShown = useMemo(() => {
    if (spec.b.layout == null) return null;
    // RAW: 올바른 배리어(+레이아웃)면 새 레이아웃, 아니면 여전히 옛 레이아웃.
    if (spec.needsLayout) {
      return barrierPlaced && stagesSet && layoutIncluded ? spec.newLayout : spec.oldLayout;
    }
    return spec.b.layout;
  }, [spec, barrierPlaced, stagesSet, layoutIncluded]);

  // 카드/드롭존 X 좌표 계산.
  function layout(w: number) {
    const x0 = PAD;
    const x1 = w - PAD;
    const totalW = x1 - x0;
    const cardW = (totalW - TRACK_GAP) / 2;
    const aX = x0;
    const gapX0 = x0 + cardW;
    const gapX1 = gapX0 + TRACK_GAP;
    const bX = gapX1;
    const gapCx = (gapX0 + gapX1) / 2;
    return { x0, x1, cardW, aX, bX, gapX0, gapX1, gapCx };
  }

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const L = layout(w);

    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    // 시나리오 제목.
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = theme.muted;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(spec.title, L.x0, 28);

    // 큐 트랙 베이스라인.
    ctx.strokeStyle = withAlpha(theme.border, 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const midY = CARD_Y + CARD_H / 2;
    ctx.moveTo(L.x0, midY);
    ctx.lineTo(L.x1, midY);
    ctx.stroke();

    // 연산 카드 렌더.
    const drawCard = (op: OpSpec, x: number, cw: number, resourceLayout: string | null) => {
      roundRect(ctx, x, CARD_Y, cw, CARD_H, 8);
      if (op.kind === 'write') {
        ctx.fillStyle = withAlpha(op.color, 0.22);
        ctx.fill();
        ctx.strokeStyle = op.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // read: 윤곽선만(채우기 없음).
        ctx.fillStyle = withAlpha(op.color, 0.06);
        ctx.fill();
        ctx.strokeStyle = op.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.fillStyle = theme.text;
      ctx.fillText(op.label, x + 10, CARD_Y + 22);
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.fillText(op.detail, x + 10, CARD_Y + 40);
      // write/read 배지.
      const badge = op.kind === 'write' ? 'WRITE' : 'READ';
      pill(
        ctx,
        x + cw - 34,
        CARD_Y + 18,
        badge,
        op.kind === 'write' ? op.color : withAlpha(op.color, 0.85),
        '#ffffff',
        '9px ui-monospace, monospace',
      );

      // 리소스 상태 칩(레이아웃 라벨) — 카드 아래.
      if (resourceLayout != null) {
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = theme.muted;
        ctx.textAlign = 'left';
        ctx.fillText('리소스 상태', x + 10, CARD_Y + CARD_H + 16);
        pill(
          ctx,
          x + cw / 2,
          CARD_Y + CARD_H + 30,
          resourceLayout,
          withAlpha(theme.text, 0.12),
          theme.text,
          '9px ui-monospace, monospace',
        );
      }
    };

    drawCard(spec.a, L.aX, L.cardW, spec.a.layout);
    drawCard(spec.b, L.bX, L.cardW, bLayoutShown);

    // 순서 화살표 A→B(틈을 가로질러, 옅게).
    drawArrow(
      ctx,
      L.gapX0 - 2,
      midY,
      L.gapX1 + 2,
      midY,
      withAlpha(theme.muted, 0.6),
      { width: 1.2, head: 6 },
    );

    // 드롭 존(틈) 윤곽 — 배리어 미배치일 때 점선 슬롯 강조.
    if (!barrierPlaced) {
      ctx.save();
      ctx.strokeStyle = withAlpha(theme.accent, draggingRef.current ? 0.9 : 0.5);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      roundRect(ctx, L.gapCx - 14, CARD_Y - 4, 28, CARD_H + 8, 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = withAlpha(theme.accent, 0.8);
      ctx.textAlign = 'center';
      ctx.fillText('여기로', L.gapCx, CARD_Y - 10);
    }

    // 배리어 토큰: 배치되면 틈 위 세로 막대, 아니면 하단 대기.
    if (barrierPlaced) {
      // 세로 배리어 막대.
      const bx = L.gapCx;
      ctx.fillStyle = withAlpha(QUEUE_COLORS.stall, 0.95);
      roundRect(ctx, bx - 5, CARD_Y - 6, 10, CARD_H + 12, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.save();
      ctx.translate(bx, midY);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BARRIER', 0, 0.5);
      ctx.restore();

      // src ▸ dst 단계/접근 라벨(지정됐을 때만 구체적).
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '9px ui-monospace, monospace';
      const labelY = CARD_Y + CARD_H + 54;
      if (stagesSet) {
        ctx.fillStyle = theme.text;
        ctx.fillText(`${spec.srcStage} / ${spec.srcAccess}`, bx, labelY);
        ctx.fillStyle = theme.muted;
        ctx.fillText('▸', bx, labelY + 12);
        ctx.fillStyle = theme.text;
        ctx.fillText(`${spec.dstStage} / ${spec.dstAccess}`, bx, labelY + 24);
        // RAW 레이아웃 전이 화살표.
        if (spec.needsLayout) {
          ctx.fillStyle = layoutIncluded ? QUEUE_COLORS.ok : QUEUE_COLORS.bad;
          ctx.fillText(
            layoutIncluded
              ? `${spec.oldLayout} ▸ ${spec.newLayout}`
              : '레이아웃 전이 누락',
            bx,
            labelY + 40,
          );
        }
      } else {
        ctx.fillStyle = QUEUE_COLORS.bad;
        ctx.fillText('src/dst 단계 미지정 (빈 배리어)', bx, labelY);
      }
      ctx.textAlign = 'left';
    } else {
      // 하단 대기 토큰(드래그 가능 힌트).
      const tx = L.gapCx - TOKEN_W / 2;
      roundRect(ctx, tx, TOKEN_Y, TOKEN_W, TOKEN_H, 8);
      ctx.fillStyle = withAlpha(QUEUE_COLORS.stall, 0.9);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▸ BARRIER ◂', L.gapCx, TOKEN_Y + TOKEN_H / 2 + 0.5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.fillText('드래그해서 A·B 사이 틈에 놓기', tx - 4, TOKEN_Y + TOKEN_H + 14);
    }

    // 판정 알약(우상단).
    const v = evalResult.verdict;
    const verdictText =
      v === 'ok' ? '✓ 해저드 없음' : v === 'missingLayout' ? '✗ 레이아웃 누락' : `✗ ${scen} 해저드`;
    const verdictColor = v === 'ok' ? QUEUE_COLORS.ok : QUEUE_COLORS.bad;
    pill(
      ctx,
      L.x1 - 64,
      14,
      verdictText,
      verdictColor,
      '#ffffff',
      'bold 11px ui-monospace, monospace',
    );

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, [
    scen,
    barrierPlaced,
    stagesSet,
    layoutIncluded,
    evalResult,
    bLayoutShown,
  ]);

  // 드래그: 하단 토큰을 집어 틈에 놓으면 배치. 배치된 막대를 끌어내리면 해제.
  usePointerDrag(ref, {
    onDown: (e, canvas) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const L = layout(rect.width);
      if (!placedRef.current) {
        // 하단 토큰 히트 영역.
        const tx = L.gapCx - TOKEN_W / 2;
        if (x >= tx - 8 && x <= tx + TOKEN_W + 8 && y >= TOKEN_Y - 8 && y <= TOKEN_Y + TOKEN_H + 8) {
          draggingRef.current = true;
          return true;
        }
        return false;
      } else {
        // 배치된 막대 히트 영역(틈 근처).
        if (Math.abs(x - L.gapCx) < 22 && y >= CARD_Y - 10 && y <= CARD_Y + CARD_H + 10) {
          draggingRef.current = true;
          return true;
        }
        return false;
      }
    },
    onMove: (e, canvas) => {
      if (!draggingRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const L = layout(rect.width);
      // 틈(드롭 존) 안이면 배치, 멀리 벗어나면 해제.
      const overGap = Math.abs(x - L.gapCx) < 40 && y < CARD_Y + CARD_H + 20;
      if (overGap) {
        if (!placedRef.current) setBarrierPlaced(true);
      } else if (y > CARD_Y + CARD_H + 30) {
        if (placedRef.current) setBarrierPlaced(false);
      }
    },
    onUp: () => {
      draggingRef.current = false;
    },
  });

  // 읽기용 색.
  const v = evalResult.verdict;
  const readColor = v === 'ok' ? QUEUE_COLORS.ok : v === 'missingLayout' ? QUEUE_COLORS.stall : QUEUE_COLORS.bad;

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 360, touchAction: 'none', display: 'block', cursor: 'grab' }}
      />
      <ControlPanel>
        <SelectControl
          label="시나리오"
          value={scen}
          options={scenarioOptions}
          onChange={(s) => {
            setScen(s);
            // 시나리오 바꾸면 레이아웃 토글 리셋(혼동 방지).
            if (s !== 'RAW') setLayoutIncluded(false);
          }}
        />
        <ToggleControl
          label="배리어 배치 (드래그 대신)"
          checked={barrierPlaced}
          onChange={setBarrierPlaced}
        />
        <ToggleControl
          label="src/dst 단계·접근 지정"
          checked={stagesSet}
          onChange={setStagesSet}
        />
        <ToggleControl
          label="레이아웃 전이 포함 (RAW만 유효)"
          checked={layoutIncluded}
          onChange={setLayoutIncluded}
        />
      </ControlPanel>
      <div
        style={{
          marginTop: '0.6rem',
          fontSize: '0.82rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--muted)',
          lineHeight: 1.6,
        }}
      >
        <span style={{ color: readColor, fontWeight: 600 }}>
          {v === 'ok' ? '✓' : '✗'}{' '}
          {v === 'ok' ? '해저드 없음' : v === 'missingLayout' ? '레이아웃 전이 누락' : `${scen} 해저드`}
        </span>
        <br />
        {evalResult.reason}
      </div>
      <figcaption>
        같은 리소스에 두 연산이 잇따르면 세 가지 해저드가 생길 수 있습니다 —{' '}
        <strong>RAW</strong>(쓰고 나서 읽기, 가장 흔함), <strong>WAR</strong>(읽고 나서 쓰기),{' '}
        <strong>WAW</strong>(쓰고 나서 또 쓰기). GPU는 파이프라이닝·재정렬을 하므로, 배리어가 없으면
        뒤 연산이 앞 연산의 효과가 보이기도 전에 끼어듭니다. 배리어는{' '}
        <em>src/dst 단계+접근</em>(실행 의존성 + 메모리 가시성)을, 이미지라면{' '}
        <em>레이아웃 전이</em>까지 지정합니다. 명시적 API에서는 GPU가 이걸 대신 넣어주지 않습니다 —{' '}
        정확성은 <strong>당신의 몫</strong>입니다.
        <br />
        <strong>직접 해보세요:</strong> 먼저 배리어를 빼고(또는 하단 토큰을 그냥 두고) 해저드 경고를
        확인하세요. 그다음 배리어를 틈에 끌어다 놓되 RAW에서 <em>레이아웃 전이</em>를 빼면 두 번째
        실패 모드(쓰레기 샘플)가 뜹니다. 마지막으로 단계·접근과 레이아웃을 모두 켜면 초록 ✓로
        바뀌고, B 카드 아래 리소스 상태 칩이 새 레이아웃으로 전이되는 게 보입니다.
      </figcaption>
    </figure>
  );
}
