import { useEffect, useMemo, useRef, useState } from 'react';
import { ControlPanel, SelectControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { UE_COLORS, roundRect, withAlpha, drawArrow, monoFont } from './ue2d';

// ---------------------------------------------------------------------------
// 모델: 크래시 리포트 자동화 파이프라인
//
// 출처: Luke Thatcher (Epic) 발표.
// 1. 문제 보고가 들어오면 전체 로그가 아니라 active 상태였던 콜스택만 수집.
// 2. 콜스택을 hashing 해서 상황을 unique하게 식별.
// 3. 이미 리포트된 콜스택이면 카운트 증가 → Jira에서 중요도 상승.
//
// 이 위젯: 프리셋 크래시 리포트(짧은 가짜 콜스택)를 골라 "크래시 보고 도착"을
// 누르면, 보고가 단계(수집 → 해시 → 조회 → 삽입/카운트++)를 따라 흐르며 각
// 단계가 강조된다. 우하단의 dedup 테이블(hash → count → Jira 우선순위)이
// 실시간 갱신되고, 같은 콜스택이 반복되면 같은 행의 count가 오르고 우선순위가
// 시각적으로 상승·재정렬된다.
// ---------------------------------------------------------------------------

const CANVAS_H = 340;

interface CrashPreset {
  id: string;
  label: string;
  /** active 상태였던 콜스택(상위→하위 프레임 3~4개) */
  stack: string[];
}

const PRESETS: ReadonlyArray<CrashPreset> = [
  {
    id: 'tdr',
    label: 'A — TDR (행/hang)',
    stack: ['BasePassPS', 'FScene::Render', 'WaitForGPU', 'TdrTimeout'],
  },
  {
    id: 'deadlock',
    label: 'B — AsyncCompute deadlock',
    stack: ['AsyncCompute::Dispatch', 'FenceWait(graphics)', 'RHISubmit'],
  },
  {
    id: 'pagefault',
    label: 'C — MIP3 page fault',
    stack: ['SampleTexture(MIP3)', 'ShadingPS', 'PageFault'],
  },
  {
    id: 'random',
    label: '(무작위로 하나)',
    stack: [],
  },
] as const;

/** 결정적 FNV-1a 32비트 해시 → 짧은 hex. 핸들러 안에서만 호출(SSR 안전). */
function fnv1a(s: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    // 32-bit FNV prime multiply
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 6);
}

interface DedupRow {
  hash: string;
  /** 대표 콜스택(표시용 상단 프레임) */
  top: string;
  count: number;
}

/** count → Jira 우선순위 라벨/색. Minor 색은 테마 muted를 받아서 쓴다. */
function jiraPriority(
  count: number,
  minorColor: string,
): { label: string; color: string } {
  if (count >= 5) return { label: 'Blocker', color: UE_COLORS.bad };
  if (count >= 3) return { label: 'Critical', color: UE_COLORS.stall };
  if (count >= 2) return { label: 'Major', color: UE_COLORS.compute };
  return { label: 'Minor', color: minorColor };
}

const STAGES = ['수집', '해시', '조회', '카운트'] as const;
type Stage = (typeof STAGES)[number];

/**
 * 크래시 리포트 자동화 파이프라인 위젯.
 * 보고가 단계를 따라 흐르며 dedup 테이블이 빈도순으로 우선순위를 매긴다.
 */
export default function CrashReportPipeline() {
  const [selected, setSelected] = useState<string>('tdr');
  const [rows, setRows] = useState<DedupRow[]>([]);
  // 현재 파이프라인을 통과 중인 보고
  const [active, setActive] = useState<{
    top: string;
    hash: string;
    stageIdx: number;
    isNew: boolean;
  } | null>(null);

  const seedRef = useRef(0x2545f491); // 무작위 프리셋용 시드 PRNG
  const timerRef = useRef<number | null>(null);

  const stopTimer = (): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => stopTimer, []);

  const nextRandom = (): CrashPreset => {
    // 결정적 LCG로 셔플 없이 하나 고른다(SSR 안전: 핸들러에서만 호출).
    seedRef.current = (seedRef.current * 1664525 + 1013904223) >>> 0;
    const concrete = PRESETS.filter((p) => p.stack.length > 0);
    const idx = seedRef.current % concrete.length;
    return concrete[idx];
  };

  const arrive = (): void => {
    stopTimer();
    const preset =
      selected === 'random'
        ? nextRandom()
        : PRESETS.find((p) => p.id === selected) ?? PRESETS[0];
    const stackStr = preset.stack.join(' > ');
    const hash = fnv1a(stackStr);
    const top = preset.stack[0];

    // 이미 본 해시인지 — 카운트 증가 여부 미리 계산(애니메이션 표시용).
    const existing = rows.find((r) => r.hash === hash);
    const isNew = !existing;

    // 단계별 애니메이션: 0=수집,1=해시,2=조회,3=카운트
    setActive({ top, hash, stageIdx: 0, isNew });

    const advance = (idx: number): void => {
      if (idx >= STAGES.length) {
        // 마지막 단계: 테이블 갱신 + 잠깐 더 보이고 사라짐.
        setRows((prev) => {
          const found = prev.find((r) => r.hash === hash);
          let next: DedupRow[];
          if (found) {
            next = prev.map((r) =>
              r.hash === hash ? { ...r, count: r.count + 1 } : r,
            );
          } else {
            next = [...prev, { hash, top, count: 1 }];
          }
          // 빈도순(내림차순) 정렬 → 우선순위 재정렬.
          next.sort((a, b) => b.count - a.count);
          return next;
        });
        timerRef.current = window.setTimeout(() => setActive(null), 700);
        return;
      }
      setActive((a) => (a ? { ...a, stageIdx: idx } : a));
      timerRef.current = window.setTimeout(() => advance(idx + 1), 520);
    };
    timerRef.current = window.setTimeout(() => advance(1), 520);
  };

  const reset = (): void => {
    stopTimer();
    setRows([]);
    setActive(null);
  };

  const presetOptions = useMemo(
    () => PRESETS.map((p) => ({ value: p.id, label: p.label })),
    [],
  );

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 14;

    // 제목
    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('크래시 리포트 자동화', padX, 18);

    // --- 파이프라인 단계(상단, 가로) ---
    const stageY = 32;
    const stageH = 42;
    const sgap = 8;
    const sW = (w - padX * 2 - sgap * (STAGES.length - 1)) / STAGES.length;
    const stageDesc: Record<Stage, string> = {
      수집: 'active 콜스택만',
      해시: 'callstack→hash',
      조회: 'dedup 테이블',
      카운트: 'count++ / 삽입',
    };

    for (let i = 0; i < STAGES.length; i++) {
      const x = padX + i * (sW + sgap);
      const on = active !== null && active.stageIdx === i;
      roundRect(ctx, x, stageY, sW, stageH, 6);
      ctx.fillStyle = on ? withAlpha(UE_COLORS.active, 0.85) : withAlpha(theme.border, 0.3);
      ctx.fill();
      ctx.strokeStyle = on ? UE_COLORS.active : theme.border;
      ctx.lineWidth = on ? 2 : 1;
      ctx.stroke();
      ctx.font = monoFont(11);
      ctx.fillStyle = on ? '#fff' : theme.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(STAGES[i], x + sW / 2, stageY + stageH / 2 - 7);
      ctx.font = monoFont(8);
      ctx.fillStyle = on ? withAlpha('#ffffff', 0.85) : theme.muted;
      ctx.fillText(stageDesc[STAGES[i]], x + sW / 2, stageY + stageH / 2 + 8);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // 단계 사이 화살표
      if (i < STAGES.length - 1) {
        const ax = x + sW;
        drawArrow(
          ctx,
          ax + 1,
          stageY + stageH / 2,
          ax + sgap - 1,
          stageY + stageH / 2,
          theme.muted,
          { width: 1.2, head: 5 },
        );
      }
    }

    // --- 통과 중인 보고 카드 ---
    const reportY = stageY + stageH + 12;
    if (active) {
      const cardW = Math.min(260, w - padX * 2);
      roundRect(ctx, padX, reportY, cardW, 26, 5);
      ctx.fillStyle = withAlpha(UE_COLORS.bad, 0.14);
      ctx.fill();
      ctx.strokeStyle = UE_COLORS.bad;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = monoFont(10);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const stageName = STAGES[active.stageIdx];
      let txt = `📥 ${active.top}`;
      if (active.stageIdx >= 1) txt += `  #${active.hash}`;
      if (active.stageIdx >= 3) txt += active.isNew ? '  (신규 insert)' : '  (count++)';
      ctx.fillText(txt, padX + 8, reportY + 13);
      ctx.textAlign = 'right';
      ctx.fillStyle = UE_COLORS.active;
      ctx.fillText(`▶ ${stageName}`, padX + cardW - 8, reportY + 13);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    } else {
      ctx.font = monoFont(10);
      ctx.fillStyle = theme.muted;
      ctx.fillText('“크래시 보고 도착”을 눌러 보고를 흘려보내세요', padX, reportY + 16);
    }

    // --- dedup 테이블(하단) ---
    const tableY = reportY + 38;
    const rowH = 26;
    ctx.font = monoFont(10);
    ctx.fillStyle = theme.muted;
    ctx.fillText('dedup 테이블 (hash → count → Jira 우선순위)', padX, tableY - 6);

    // 컬럼 위치
    const colHash = padX + 4;
    const colTop = padX + 74;
    const colCount = w - padX - 150;
    const colBar = w - padX - 120;
    const barMaxW = 70;

    // 헤더
    ctx.font = monoFont(9);
    ctx.fillStyle = theme.muted;
    ctx.fillText('hash', colHash, tableY + 8);
    ctx.fillText('top frame', colTop, tableY + 8);
    ctx.fillText('count', colCount, tableY + 8);
    ctx.textAlign = 'right';
    ctx.fillText('Jira', w - padX - 4, tableY + 8);
    ctx.textAlign = 'left';

    const maxCount = rows.reduce((m, r) => Math.max(m, r.count), 1);
    const bodyY = tableY + 14;
    const visibleRows = rows.slice(0, 5);

    for (let i = 0; i < visibleRows.length; i++) {
      const r = visibleRows[i];
      const y = bodyY + i * rowH;
      const isActiveRow = active !== null && active.hash === r.hash && active.stageIdx >= 2;
      const pri = jiraPriority(r.count, theme.muted);

      // 행 배경
      roundRect(ctx, padX, y, w - padX * 2, rowH - 4, 4);
      ctx.fillStyle = isActiveRow ? withAlpha(UE_COLORS.active, 0.18) : withAlpha(theme.border, 0.18);
      ctx.fill();
      if (isActiveRow) {
        ctx.strokeStyle = UE_COLORS.active;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      const ty = y + (rowH - 4) / 2;
      ctx.textBaseline = 'middle';
      // hash
      ctx.font = monoFont(10);
      ctx.fillStyle = UE_COLORS.graphics;
      ctx.textAlign = 'left';
      ctx.fillText(`#${r.hash}`, colHash, ty);
      // top frame
      ctx.fillStyle = theme.text;
      const topShown = r.top.length > 12 ? r.top.slice(0, 11) + '…' : r.top;
      ctx.fillText(topShown, colTop, ty);
      // count
      ctx.fillStyle = theme.text;
      ctx.fillText(`${r.count}`, colCount, ty);
      // count 막대
      const bw = (r.count / maxCount) * barMaxW;
      roundRect(ctx, colBar, ty - 4, Math.max(2, bw), 8, 3);
      ctx.fillStyle = pri.color;
      ctx.fill();
      // Jira 우선순위
      ctx.font = monoFont(9);
      ctx.fillStyle = pri.color;
      ctx.textAlign = 'right';
      ctx.fillText(pri.label, w - padX - 4, ty);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    if (rows.length === 0) {
      ctx.font = monoFont(10);
      ctx.fillStyle = theme.muted;
      ctx.fillText('(아직 보고 없음)', padX + 4, bodyY + 14);
    }
  };

  const { ref } = useCanvas2d(draw, [rows, active]);

  const running = active !== null;

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block' }}
      />
      <ControlPanel>
        <SelectControl
          label="크래시 종류"
          value={selected}
          options={presetOptions}
          onChange={setSelected}
        />
        <Btn onClick={arrive} disabled={running}>
          크래시 보고 도착
        </Btn>
        <Btn onClick={reset} variant="ghost">
          테이블 비우기
        </Btn>
      </ControlPanel>
      <figcaption>
        크래시가 쏟아지면 전부 사람이 볼 수 없습니다. 발표가 소개한 자동화는 세 단계입니다: 먼저 전체
        로그가 아니라 <strong>active 상태였던 콜스택만</strong> 수집하고, 그 콜스택을{' '}
        <strong>해시</strong>해서 상황을 고유하게 식별한 뒤, dedup 테이블에서 조회해 처음 보는
        해시면 새 행으로 넣고 이미 본 해시면 <strong>count를 1 올립니다</strong>. 같은 크래시가 자주
        들어올수록 그 행의 count가 커지고 <strong>Jira 우선순위</strong>가 올라갑니다. 해싱+중복 제거가
        핵심인 이유: 똑같은 콜스택의 홍수를 <em>한 줄</em>로 접고 빈도로 정렬하면, 수천 건의 리포트가
        “무엇부터 고쳐야 하는지” 순위가 매겨진 백로그로 바뀝니다. (출처: Luke Thatcher (Epic) 발표.)
        <br />
        <strong>직접 해보세요:</strong> 같은 “크래시 종류”로 “크래시 보고 도착”을 여러 번 눌러 보세요 —
        같은 해시 행의 count가 오르고 우선순위가 Minor → Major → Critical → Blocker로 상승하며 위로
        재정렬됩니다. 종류를 바꿔 다른 콜스택을 넣으면 새 행(다른 해시)이 생깁니다.
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 작은 버튼 — 컨트롤 툴킷에 버튼 프리미티브가 없어 캔버스 밖(DOM)에서
// CSS 변수만 읽는 플레인 버튼으로 직접 만든다. 탭 타깃 ≥ 38px.
// ---------------------------------------------------------------------------
interface BtnProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'ghost';
  children: React.ReactNode;
}

function Btn({ onClick, disabled, variant = 'solid', children }: BtnProps) {
  const solid = variant === 'solid';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 38,
        padding: '0 0.85rem',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: solid ? 'var(--accent)' : 'var(--surface)',
        color: solid ? '#fff' : 'var(--text)',
        font: 'inherit',
        fontSize: '0.85rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        flex: '0 0 auto',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </button>
  );
}
