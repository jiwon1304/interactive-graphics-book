import { useMemo } from 'react';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { UE_COLORS, roundRect, withAlpha, drawArrow, monoFont } from './ue2d';

// ---------------------------------------------------------------------------
// 정적 도식: 크래시 리포트 자동화 파이프라인
//
// 출처: Luke Thatcher (Epic) 발표.
// 1. 문제 보고가 들어오면 전체 로그가 아니라 active 상태였던 콜스택만 수집.
// 2. 콜스택을 hashing 해서 상황을 unique하게 식별.
// 3. 이미 리포트된 콜스택이면 카운트 증가 → Jira에서 중요도 상승.
//
// 이 그림은 흐름(수집 → 해시 → 조회 → 카운트++)과, 여러 보고가 dedup된 뒤의
// 결과 테이블(hash → count → Jira 우선순위)을 정지시켜 보여준다(인터랙티브 아님).
// 같은 크래시가 많이 들어온 행일수록 count가 크고 우선순위가 높다.
// ---------------------------------------------------------------------------

const CANVAS_H = 340;

/** 결정적 FNV-1a 32비트 해시 → 짧은 hex. */
function fnv1a(s: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 6);
}

interface CrashKind {
  top: string;
  stack: string[];
  count: number;
}

// 발표의 세 사례 + 가벼운 추가 노이즈. count는 "같은 콜스택이 몇 번 들어왔나".
const CRASHES: ReadonlyArray<CrashKind> = [
  { top: 'BasePassPS', stack: ['BasePassPS', 'FScene::Render', 'WaitForGPU', 'TdrTimeout'], count: 6 },
  { top: 'SampleTexture', stack: ['SampleTexture(MIP3)', 'ShadingPS', 'PageFault'], count: 3 },
  { top: 'AsyncCompute', stack: ['AsyncCompute::Dispatch', 'FenceWait(graphics)', 'RHISubmit'], count: 2 },
  { top: 'PostProcessPS', stack: ['PostProcessPS', 'Bloom', 'NullDescriptor'], count: 1 },
];

interface DedupRow {
  hash: string;
  top: string;
  count: number;
}

/** count → Jira 우선순위 라벨/색. */
function jiraPriority(count: number, minorColor: string): { label: string; color: string } {
  if (count >= 5) return { label: 'Blocker', color: UE_COLORS.bad };
  if (count >= 3) return { label: 'Critical', color: UE_COLORS.stall };
  if (count >= 2) return { label: 'Major', color: UE_COLORS.compute };
  return { label: 'Minor', color: minorColor };
}

const STAGES = ['수집', '해시', '조회', '카운트'] as const;
type Stage = (typeof STAGES)[number];

export default function CrashReportPipeline() {
  // 테이블: 콜스택을 해시해 dedup, 빈도순 정렬.
  const rows = useMemo<DedupRow[]>(() => {
    const r: DedupRow[] = CRASHES.map((c) => ({
      hash: fnv1a(c.stack.join(' > ')),
      top: c.top,
      count: c.count,
    }));
    r.sort((a, b) => b.count - a.count);
    return r;
  }, []);

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
    ctx.fillText('크래시 리포트 자동화 — 수집 → 해시 → dedup → Jira', padX, 18);

    // --- 파이프라인 단계(상단, 가로) ---
    const stageY = 30;
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
      roundRect(ctx, x, stageY, sW, stageH, 6);
      ctx.fillStyle = withAlpha(theme.accent, 0.16);
      ctx.fill();
      ctx.strokeStyle = withAlpha(theme.accent, 0.7);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = monoFont(11);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(STAGES[i], x + sW / 2, stageY + stageH / 2 - 7);
      ctx.font = monoFont(8);
      ctx.fillStyle = theme.muted;
      ctx.fillText(stageDesc[STAGES[i]], x + sW / 2, stageY + stageH / 2 + 8);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      if (i < STAGES.length - 1) {
        const ax = x + sW;
        drawArrow(ctx, ax + 1, stageY + stageH / 2, ax + sgap - 1, stageY + stageH / 2, theme.muted, {
          width: 1.2,
          head: 5,
        });
      }
    }

    // --- dedup 테이블(하단) ---
    const tableY = stageY + stageH + 24;
    const rowH = 30;
    ctx.font = monoFont(10);
    ctx.fillStyle = theme.muted;
    ctx.fillText('dedup 테이블 (hash → count → Jira 우선순위, 빈도순 정렬)', padX, tableY - 8);

    const colHash = padX + 6;
    const colTop = padX + 78;
    const colCount = w - padX - 156;
    const colBar = w - padX - 122;
    const barMaxW = 70;

    // 헤더
    ctx.font = monoFont(9);
    ctx.fillStyle = theme.muted;
    ctx.fillText('hash', colHash, tableY + 6);
    ctx.fillText('top frame', colTop, tableY + 6);
    ctx.fillText('count', colCount, tableY + 6);
    ctx.textAlign = 'right';
    ctx.fillText('Jira', w - padX - 4, tableY + 6);
    ctx.textAlign = 'left';

    const maxCount = rows.reduce((m, r) => Math.max(m, r.count), 1);
    const bodyY = tableY + 12;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const y = bodyY + i * rowH;
      const pri = jiraPriority(r.count, theme.muted);
      const isTop = i === 0; // 가장 빈번한 = 최우선

      roundRect(ctx, padX, y, w - padX * 2, rowH - 5, 4);
      ctx.fillStyle = isTop ? withAlpha(UE_COLORS.bad, 0.1) : withAlpha(theme.border, 0.18);
      ctx.fill();
      if (isTop) {
        ctx.strokeStyle = withAlpha(UE_COLORS.bad, 0.7);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      const ty = y + (rowH - 5) / 2;
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
      ctx.fillText(`×${r.count}`, colCount, ty);
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

    // 테이블 아래 주석(헤더와 겹치지 않게 본문 아래 빈 공간에)
    const noteY = bodyY + rows.length * rowH + 16;
    ctx.font = monoFont(9);
    ctx.fillStyle = UE_COLORS.bad;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('맨 위 행 = 가장 빈번 → 최우선(Blocker)', padX + 6, noteY);
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block' }}
      />
      <figcaption>
        크래시가 쏟아지면 전부 사람이 볼 수 없습니다. 발표가 소개한 자동화는 세 단계입니다(위 흐름):
        먼저 전체 로그가 아니라 <strong>active 상태였던 콜스택만</strong> 수집하고, 그 콜스택을{' '}
        <strong>해시</strong>해서 상황을 고유하게 식별한 뒤, dedup 테이블에서 조회해 처음 보는
        해시면 새 행으로 넣고 이미 본 해시면 <strong>count를 1 올립니다</strong>. 아래 테이블이 여러
        보고를 dedup한 결과입니다 — 같은 크래시가 자주 들어온 행일수록 count가 크고{' '}
        <strong>Jira 우선순위</strong>가 높습니다(예: ×6 BasePass hang = Blocker). 해싱+중복 제거가
        핵심인 이유: 똑같은 콜스택의 홍수를 <em>한 줄</em>로 접고 빈도로 정렬하면, 수천 건의 리포트가
        "무엇부터 고쳐야 하는지" 순위가 매겨진 백로그로 바뀝니다 — Minor → Major → Critical → Blocker.
        (출처: Luke Thatcher (Epic) 발표.)
      </figcaption>
    </figure>
  );
}
