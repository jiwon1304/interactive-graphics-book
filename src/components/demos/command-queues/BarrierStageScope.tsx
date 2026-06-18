import { useMemo, useRef, useState } from 'react';
import { ControlPanel, SelectControl, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import { QUEUE_COLORS, pointerToCanvas, roundRect, withAlpha, drawArrow } from './cq2d';

// ---------------------------------------------------------------------------
// 모델: 파이프라인 배리어의 "스테이지 스코프(stage scope)"
//
// 배리어는 "전부 멈춰!"가 아니라 스테이지 단위의 범위(scope) 지정이다.
//   srcStageMask = "앞선 명령들이 이 스테이지까지 도달(완료)할 때까지 기다린다"
//                  (앞선 명령이 src보다 뒤 스테이지에 있는 작업은 기다리지 않음)
//   dstStageMask = "뒤따르는 명령들을 이 스테이지에서 막는다"
//                  (그 명령의 더 앞 스테이지들은 그동안 진행될 수 있음)
//
// 너무 넓게 잡으면(src=BOTTOM_OF_PIPE, dst=TOP_OF_PIPE) 전체가 직렬화되어
// 오버랩이 죽고, 너무 좁게 잡으면 실제 의존(쓰기↔읽기)을 놓쳐 해저드가 난다.
// 정답은 "가장 좁으면서 정확한(tightest correct)" 스코프다.
// ---------------------------------------------------------------------------

// 그래픽스 파이프라인 스테이지(위→아래 = 파이프라인 진행 순서). index = 순서.
const STAGES = [
  'TOP_OF_PIPE',
  'VERTEX_SHADER',
  'EARLY_FRAGMENT_TESTS',
  'FRAGMENT_SHADER',
  'COLOR_ATTACHMENT_OUTPUT',
  'BOTTOM_OF_PIPE',
] as const;

/** 시나리오: 실제로 커버해야 하는 의존(producer 쓰기 ↔ consumer 읽기). */
interface Scenario {
  /** producer가 실제로 데이터를 "쓰는" 스테이지 인덱스 */
  writeStage: number;
  /** consumer가 실제로 데이터를 "읽는" 스테이지 인덱스 */
  readStage: number;
  /** 추천(가장 좁고 정확한) src/dst */
  tightSrc: number;
  tightDst: number;
  desc: string;
}

type ScenarioKey = 'rt-sample' | 'depth-color' | 'vtx-feedback';

const SCENARIOS: Record<ScenarioKey, Scenario> = {
  // 렌더 타깃에 색을 쓴 뒤(COLOR_ATTACHMENT_OUTPUT), 다음 패스가 그걸 텍스처로 샘플링(FRAGMENT_SHADER).
  'rt-sample': {
    writeStage: STAGES.indexOf('COLOR_ATTACHMENT_OUTPUT'),
    readStage: STAGES.indexOf('FRAGMENT_SHADER'),
    tightSrc: STAGES.indexOf('COLOR_ATTACHMENT_OUTPUT'),
    tightDst: STAGES.indexOf('FRAGMENT_SHADER'),
    desc: 'RT→샘플링: 쓰기=COLOR_OUTPUT, 읽기=FRAGMENT',
  },
  // 깊이 버퍼를 EARLY_FRAGMENT_TESTS에서 쓰고, 다음 패스가 색을 출력(COLOR_ATTACHMENT_OUTPUT).
  'depth-color': {
    writeStage: STAGES.indexOf('EARLY_FRAGMENT_TESTS'),
    readStage: STAGES.indexOf('COLOR_ATTACHMENT_OUTPUT'),
    tightSrc: STAGES.indexOf('EARLY_FRAGMENT_TESTS'),
    tightDst: STAGES.indexOf('COLOR_ATTACHMENT_OUTPUT'),
    desc: '깊이→색: 쓰기=EARLY_FRAG, 읽기=COLOR_OUTPUT',
  },
  // 프래그먼트에서 쓴 버퍼를 다음 드로우의 정점 단계가 읽음(예: GPU-driven 정점 데이터).
  'vtx-feedback': {
    writeStage: STAGES.indexOf('FRAGMENT_SHADER'),
    readStage: STAGES.indexOf('VERTEX_SHADER'),
    tightSrc: STAGES.indexOf('FRAGMENT_SHADER'),
    tightDst: STAGES.indexOf('VERTEX_SHADER'),
    desc: '프래그→정점: 쓰기=FRAGMENT, 읽기=VERTEX',
  },
};

const SCENARIO_OPTIONS = [
  { value: 'rt-sample' as const, label: 'RT→샘플링 (COLOR→FRAGMENT)' },
  { value: 'depth-color' as const, label: '깊이→색 (EARLY_FRAG→COLOR)' },
  { value: 'vtx-feedback' as const, label: '프래그→정점 (FRAGMENT→VERTEX)' },
];

/** 커버리지/과동기화 분석 결과. */
interface Analysis {
  /** 쓰기가 src 스코프에 포함되는가(src 인덱스 ≥ 쓰기 인덱스) */
  writeCovered: boolean;
  /** 읽기가 dst 스코프에 막히는가(dst 인덱스 ≤ 읽기 인덱스) */
  readBlocked: boolean;
  covered: boolean;
  /** 과동기화 정도(스테이지 수). 0이면 최소·정확. */
  over: number;
  full: boolean;
}

function analyze(src: number, dst: number, sc: Scenario): Analysis {
  const writeCovered = src >= sc.writeStage;
  const readBlocked = dst <= sc.readStage;
  const covered = writeCovered && readBlocked;
  // 과동기화 = (src가 쓰기보다 얼마나 뒤인가) + (dst가 읽기보다 얼마나 앞인가)
  const over = Math.max(0, src - sc.writeStage) + Math.max(0, sc.readStage - dst);
  const full = src === STAGES.length - 1 && dst === 0; // BOTTOM_OF_PIPE & TOP_OF_PIPE
  return { writeCovered, readBlocked, covered, over, full };
}

const CANVAS_H = 360;

/**
 * 파이프라인 배리어의 스테이지 스코프 위젯.
 * 좌(producer)/우(consumer) 스테이지 사다리에서 src/dst 핸들을 드래그하면,
 * 무엇이 "기다려지고" 무엇이 "막히는지"를 음영으로 보여주고,
 * 의존 커버 여부와 과동기화 정도를 보고한다.
 */
export default function BarrierStageScope() {
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>('rt-sample');
  const scenario = SCENARIOS[scenarioKey];

  // src/dst 스테이지 인덱스. 시나리오를 바꾸면 추천값으로 리셋(아래 핸들러에서).
  const [src, setSrc] = useState<number>(scenario.tightSrc);
  const [dst, setDst] = useState<number>(scenario.tightDst);

  // 드래그 대상. ref로 보관(모바일 stale closure 방지).
  const dragRef = useRef<'src' | 'dst' | null>(null);

  // 레이아웃 좌표를 그리기/히트테스트가 공유하도록 ref에 저장.
  const layoutRef = useRef({
    leftX: 0,
    rightX: 0,
    colW: 0,
    rowH: 0,
    top: 0,
  });

  const analysis = useMemo(() => analyze(src, dst, scenario), [src, dst, scenario]);

  const onScenarioChange = (key: ScenarioKey): void => {
    setScenarioKey(key);
    setSrc(SCENARIOS[key].tightSrc);
    setDst(SCENARIOS[key].tightDst);
  };

  const showFull = (on: boolean): void => {
    if (on) {
      setSrc(STAGES.length - 1); // BOTTOM_OF_PIPE
      setDst(0); // TOP_OF_PIPE
    } else {
      setSrc(scenario.tightSrc);
      setDst(scenario.tightDst);
    }
  };

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 14;
    const top = 56;
    const bottomPad = 18;
    const rowH = Math.min(40, (h - top - bottomPad) / STAGES.length);
    const colW = Math.min(150, (w - padX * 2 - 24) / 2);
    const gap = w - padX * 2 - colW * 2; // 두 컬럼 사이 간격
    const leftX = padX;
    const rightX = padX + colW + gap;

    layoutRef.current = { leftX, rightX, colW, rowH, top };

    // 컬럼 제목
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.text;
    ctx.fillText('이전 명령 (producer)', leftX, top - 30);
    ctx.fillText('다음 명령 (consumer)', rightX, top - 30);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = theme.muted;
    ctx.fillText('srcStage: 여기까지 도달 대기', leftX, top - 14);
    ctx.fillText('dstStage: 여기서부터 블록', rightX, top - 14);

    // 한 컬럼의 스테이지 사다리를 그린다.
    const drawLadder = (
      x: number,
      side: 'left' | 'right',
    ): void => {
      for (let i = 0; i < STAGES.length; i++) {
        const y = top + i * rowH;
        // 음영: 왼쪽은 src 이하(기다림), 오른쪽은 dst 이상(블록).
        let shade: string | null = null;
        let waited = false;
        if (side === 'left') {
          waited = i <= src; // src까지(포함) 완료를 기다림
          if (waited) shade = withAlpha(QUEUE_COLORS.stall, 0.18);
        } else {
          waited = i >= dst; // dst부터(포함) 블록됨
          if (waited) shade = withAlpha(QUEUE_COLORS.graphics, 0.18);
        }

        roundRect(ctx, x, y + 2, colW, rowH - 4, 6);
        ctx.fillStyle = shade ?? withAlpha(theme.border, 0.35);
        ctx.fill();
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1;
        ctx.stroke();

        // 실제 쓰기/읽기 스테이지 강조 테두리
        const isReal =
          (side === 'left' && i === scenario.writeStage) ||
          (side === 'right' && i === scenario.readStage);
        if (isReal) {
          const realCol = side === 'left' ? QUEUE_COLORS.bad : QUEUE_COLORS.ok;
          roundRect(ctx, x, y + 2, colW, rowH - 4, 6);
          ctx.strokeStyle = realCol;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // 스테이지 이름
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(STAGES[i], x + 8, y + rowH / 2);
        ctx.textBaseline = 'alphabetic';

        // 실제 쓰기/읽기 라벨
        if (isReal) {
          const label = side === 'left' ? '실제 쓰기' : '실제 읽기';
          const col = side === 'left' ? QUEUE_COLORS.bad : QUEUE_COLORS.ok;
          ctx.font = '9px ui-monospace, monospace';
          ctx.fillStyle = col;
          ctx.textAlign = 'right';
          ctx.fillText(label, x + colW - 8, y + rowH / 2 + 3);
          ctx.textAlign = 'left';
        }
      }
    };

    drawLadder(leftX, 'left');
    drawLadder(rightX, 'right');

    // "안 기다림" / "먼저 진행 가능" 주석
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    // 왼쪽: src 다음 스테이지가 있으면 "안 기다림"
    if (src < STAGES.length - 1) {
      const y = top + (src + 1) * rowH;
      ctx.fillStyle = theme.muted;
      ctx.fillText('↑ 안 기다림', leftX + 8, y + rowH / 2 + 12);
    }
    // 오른쪽: dst 이전 스테이지가 있으면 "먼저 진행 가능"
    if (dst > 0) {
      const y = top + (dst - 1) * rowH;
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.fillText('↓ 먼저 진행 가능', rightX + 8, y + rowH / 2 + 12);
    }

    // 핸들(드래그 가능): 왼쪽 src — 컬럼 왼쪽 가장자리, 오른쪽 dst — 컬럼 오른쪽 가장자리.
    const drawHandle = (
      hx: number,
      stageIdx: number,
      color: string,
      label: string,
      anchor: 'left' | 'right',
    ): void => {
      const cy = top + stageIdx * rowH + rowH / 2;
      const r = 8;
      ctx.beginPath();
      ctx.arc(hx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = theme.bg;
      ctx.lineWidth = 2;
      ctx.stroke();
      // 라벨 칩
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      if (anchor === 'left') {
        ctx.textAlign = 'right';
        ctx.fillText(label, hx - 12, cy);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(label, hx + 12, cy);
      }
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
    };

    // 대기 화살표: src(좌 핸들) → dst(우 핸들)
    {
      const sY = top + src * rowH + rowH / 2;
      const dY = top + dst * rowH + rowH / 2;
      drawArrow(
        ctx,
        leftX + colW,
        sY,
        rightX,
        dY,
        analysis.covered ? QUEUE_COLORS.ok : QUEUE_COLORS.bad,
        { dashed: true, width: 1.5, head: 7 },
      );
    }

    drawHandle(leftX, src, QUEUE_COLORS.stall, 'src', 'left');
    drawHandle(rightX + colW, dst, QUEUE_COLORS.graphics, 'dst', 'right');
  };

  const { ref } = useCanvas2d(draw, [src, dst, scenario, analysis]);

  // 포인터 y → 가장 가까운 스테이지 인덱스
  const yToStage = (py: number): number => {
    const { top, rowH } = layoutRef.current;
    const i = Math.round((py - top - rowH / 2) / rowH);
    return Math.max(0, Math.min(STAGES.length - 1, i));
  };

  usePointerDrag(ref, {
    onDown: (e, canvas) => {
      const p = pointerToCanvas(e, canvas);
      const L = layoutRef.current;
      // 어느 컬럼 절반을 탭했는지로 src/dst를 정한다(탭 타깃을 컬럼 폭만큼 넉넉히).
      const midX = (L.leftX + L.colW + L.rightX) / 2;
      if (p.x < midX) {
        dragRef.current = 'src';
        setSrc(yToStage(p.y));
      } else {
        dragRef.current = 'dst';
        setDst(yToStage(p.y));
      }
    },
    onMove: (e, canvas) => {
      if (!dragRef.current) return;
      const p = pointerToCanvas(e, canvas);
      const i = yToStage(p.y);
      if (dragRef.current === 'src') setSrc(i);
      else setDst(i);
    },
    onUp: () => {
      dragRef.current = null;
    },
  });

  // 읽기용 텍스트
  const srcName = STAGES[src];
  const dstName = STAGES[dst];
  const statusLine = (() => {
    if (!analysis.covered) {
      const reasons: string[] = [];
      if (!analysis.writeCovered) reasons.push('쓰기가 src 범위 밖');
      if (!analysis.readBlocked) reasons.push('읽기가 dst 범위 밖');
      return `✗ 동기화 부족(under-sync): ${reasons.join(' · ')} → 해저드`;
    }
    if (analysis.full) return '✓ 커버됨 — 하지만 전체 직렬화(full barrier): 오버랩 0';
    if (analysis.over === 0) return '✓ 최소·정확(tight): 딱 필요한 만큼만 기다림';
    return `✓ 커버됨 — 과동기화: 불필요하게 ${analysis.over}단계 더 기다림 → 오버랩 손해`;
  })();

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block', cursor: 'pointer' }}
      />
      <ControlPanel>
        <SelectControl
          label="시나리오(의존)"
          value={scenarioKey}
          options={SCENARIO_OPTIONS}
          onChange={onScenarioChange}
        />
        <ToggleControl
          label="전체 배리어(과동기화) 보기"
          checked={analysis.full}
          onChange={showFull}
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
        srcStage = <span style={{ color: QUEUE_COLORS.stall }}>{srcName}</span> · dstStage ={' '}
        <span style={{ color: QUEUE_COLORS.graphics }}>{dstName}</span>
        <br />
        <span style={{ color: analysis.covered ? QUEUE_COLORS.ok : QUEUE_COLORS.bad }}>
          {statusLine}
        </span>
      </div>
      <figcaption>
        배리어는 “전부 멈춰”라는 벽이 아니라 <strong>스테이지 범위(scope)</strong>입니다.{' '}
        <strong>srcStage</strong>는 “앞선 명령들이 이 스테이지까지 도달(완료)하기를 기다린다”는
        뜻이고(그보다 뒤 스테이지의 작업은 기다리지 않습니다), <strong>dstStage</strong>는 “뒤따르는
        명령들을 이 스테이지부터 막는다”는 뜻입니다(그보다 앞 스테이지들은 먼저 진행됩니다). 범위를
        너무 넓게 잡으면(src=BOTTOM, dst=TOP) 전체가 직렬화돼 오버랩이 죽고, 너무 좁게 잡으면 실제
        쓰기↔읽기 의존을 놓쳐 해저드가 납니다. 목표는 <em>가장 좁으면서 정확한</em> 스코프입니다.
        <br />
        <strong>직접 해보세요:</strong> 왼쪽에서 src 핸들을, 오른쪽에서 dst 핸들을 드래그해 보세요.
        먼저 <em>최소·정확(tight)</em>이 되도록(빨간 “실제 쓰기” ≤ src, 초록 “실제 읽기” ≥ dst)
        맞춰 보고, 그다음 “전체 배리어”를 켜서 과동기화로 얼마나 손해 보는지 비교해 보세요.
      </figcaption>
    </figure>
  );
}
