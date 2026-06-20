import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, monoFont, centerText, cell, drawArrow } from './wdo2d';

// ---------------------------------------------------------------------------
// 정적 도식: 한 파티션의 워프 스케줄러가 사이클마다 "실행 준비된" 워프를 고른다.
//
// 가로 = 사이클(C0..), 세로 = 그 파티션에 걸린 워프들(W0..W3).
// 각 사이클에 스케줄러는 eligible(준비된) 워프 하나를 골라 명령을 낸다(파란 셀).
// 어떤 워프가 LOAD를 내면 그 결과가 올 때까지 scoreboard 의존성으로 "stall"(황토),
// 그 사이 스케줄러는 다른 eligible 워프로 갈아탄다 → 파이프라인이 비지 않는다.
//
// 대표 상태(고정): W0이 C1에서 LOAD → C2..C5 stall, 그 동안 W1/W2/W3이 발행됨.
// 캔버스 글자 최소: 사이클 틱 듬성, 워프 id, "LOAD"/"stall" 마커 한두 개, issue/stall 범례.
// ---------------------------------------------------------------------------

const CANVAS_H = 320;

type Kind = 'issue' | 'stall' | 'load' | 'idle';

export default function SchedulerScoreboard() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const pad = 16;
    const legendH = 22;
    const NW = 4; // 워프 수
    const NC = 9; // 사이클 수

    // 대표 시나리오(고정). 각 워프의 사이클별 상태.
    // 스케줄러는 한 사이클에 워프 하나만 발행(파란 issue). 나머지는 그냥 대기(빈칸) 또는 stall.
    // W0: C0 issue, C1 LOAD발행, C2~C5 stall(메모리 대기), C6 issue(데이터 도착)
    // W1: C1 issue, C5 issue
    // W2: C2 issue, C7 issue
    // W3: C3 issue, C4 issue, C8 issue
    const grid: Kind[][] = Array.from({ length: NW }, () =>
      Array.from({ length: NC }, () => 'idle' as Kind),
    );
    // W0
    grid[0][0] = 'issue';
    grid[0][1] = 'load';
    grid[0][2] = 'stall';
    grid[0][3] = 'stall';
    grid[0][4] = 'stall';
    grid[0][5] = 'stall';
    grid[0][6] = 'issue';
    // W1
    grid[1][1] = 'issue';
    grid[1][5] = 'issue';
    // W2
    grid[2][2] = 'issue';
    grid[2][7] = 'issue';
    // W3
    grid[3][3] = 'issue';
    grid[3][4] = 'issue';
    grid[3][8] = 'issue';

    // 레이아웃
    const labelW = 34; // 좌측 워프 id 폭
    const top = pad + legendH + 14;
    const bottom = h - pad - 26;
    const gridTop = top;
    const gridH = bottom - gridTop;
    const rowGap = 6;
    const rowH = (gridH - (NW - 1) * rowGap) / NW;

    const gridLeft = pad + labelW;
    const gridW = w - gridLeft - pad;
    const colGap = 4;
    const colW = (gridW - (NC - 1) * colGap) / NC;

    const cellX = (c: number): number => gridLeft + c * (colW + colGap);
    const cellY = (r: number): number => gridTop + r * (rowH + rowGap);

    // 사이클 틱(상단, 듬성: C0, C3, C6 표시)
    ctx.font = monoFont(9);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (let c = 0; c < NC; c++) {
      if (c % 3 === 0) {
        ctx.fillText('C' + c, cellX(c) + colW / 2, gridTop - 4);
      }
    }

    // 워프 행
    for (let r = 0; r < NW; r++) {
      // 워프 id 라벨(좌)
      ctx.font = monoFont(11);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('W' + r, pad, cellY(r) + rowH / 2);

      for (let c = 0; c < NC; c++) {
        const x = cellX(c);
        const y = cellY(r);
        const k = grid[r][c];
        if (k === 'idle') {
          // 비어있는 슬롯: 아주 옅은 트랙
          cell(ctx, x, y, colW, rowH, theme.muted, {
            fillAlpha: 0.05,
            strokeAlpha: 0.12,
            radius: 3,
          });
          continue;
        }
        let color: string = COLORS.exec;
        if (k === 'stall') color = COLORS.stall;
        if (k === 'load') color = COLORS.sched;
        cell(ctx, x, y, colW, rowH, color, {
          fillAlpha: k === 'stall' ? 0.22 : 0.4,
          strokeAlpha: 0.95,
          radius: 3,
        });
        // 마커 텍스트(짧게): LOAD 셀, stall은 가운데 점선 느낌으로
        if (k === 'load') {
          centerText(ctx, 'LD', x + colW / 2, y + rowH / 2, theme.text, monoFont(9));
        }
      }
    }

    // stall 구간을 묶는 가로 괄호 + "stall" 라벨(한 번만)
    const sStart = cellX(2);
    const sEnd = cellX(5) + colW;
    const sY = cellY(0) + rowH + 3;
    ctx.strokeStyle = withAlpha(COLORS.stall, 0.9);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sStart, sY);
    ctx.lineTo(sEnd, sY);
    ctx.stroke();
    ctx.font = monoFont(9);
    ctx.fillStyle = COLORS.stall;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('stall (메모리 대기)', (sStart + sEnd) / 2, sY + 2);

    // "갈아타기" 화살표: W0 LOAD(C1) → W1 issue(C1)로 스케줄러가 전환
    drawArrow(
      ctx,
      cellX(1) + colW / 2,
      cellY(0) + rowH,
      cellX(1) + colW / 2,
      cellY(1),
      withAlpha(theme.text, 0.6),
      { width: 1.3, head: 6 },
    );

    // 범례(상단)
    const chipY = pad;
    const chipR = 6;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = monoFont(11);
    let lxp = pad;
    const chip = (color: string, label: string, alpha: number): void => {
      cell(ctx, lxp, chipY, chipR * 2, chipR * 2, color, {
        fillAlpha: alpha,
        strokeAlpha: 0.95,
        radius: 3,
      });
      ctx.fillStyle = theme.text;
      ctx.fillText(label, lxp + chipR * 2 + 5, chipY + chipR);
      lxp += chipR * 2 + 5 + ctx.measureText(label).width + 16;
    };
    chip(COLORS.exec, 'issue', 0.4);
    chip(COLORS.sched, 'LOAD', 0.4);
    chip(COLORS.stall, 'stall', 0.22);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, display: 'block' }}
      />
      <figcaption>
        한 파티션의 <strong>워프 스케줄러</strong>가 사이클마다(가로 C0, C1, …) 무엇을 하는지를 본
        간트 차트입니다. 그 파티션에는 워프 넷(<code>W0</code>–<code>W3</code>)이 걸려 있고, 스케줄러는
        매 사이클 <strong>실행 준비된(eligible)</strong> 워프 하나를 골라 명령을 발행합니다(파란 칸).
        <strong>C1에서 W0이 메모리 LOAD를 냅니다.</strong> 메모리는 수백 사이클 걸리므로, 그 결과를
        쓰는 다음 명령은 데이터가 도착할 때까지 막힙니다 — 이걸 추적하는 게{' '}
        <strong>scoreboard(스코어보드)</strong>입니다. 각 레지스터에 “이 값 아직 안 왔음” 표시를 달아
        두고, 그 레지스터에 의존하는 명령을 <strong>not-ready</strong>로 막죠. 그래서 W0은 C2–C5 동안{' '}
        <em>stall</em>(황토)에 들어갑니다. 핵심은 그 사이 <strong>스케줄러가 노는 게 아니라 다른
        eligible 워프로 갈아탄다</strong>는 것입니다(화살표). C1에는 W1, C2에는 W2, C3–C4에는 W3가
        발행돼 파이프라인이 비지 않습니다. 이것이 GPU가 큰 캐시 없이도 빠른 비밀 —{' '}
        <strong>워프 수준 병렬성으로 지연을 숨기는 것</strong>입니다. CPU는 캐시로 지연을{' '}
        <em>줄이지만</em>, GPU는 대기 중인 워프를 갈아타며 지연을 <em>숨깁니다</em>. 단,{' '}
        갈아탈 eligible 워프가 충분히 있을 때만요 — 그게 다음 그림의 점유율 이야기입니다.
      </figcaption>
    </figure>
  );
}
