import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, monoFont, centerText, cell } from './wdo2d';

// ---------------------------------------------------------------------------
// 정적 도식: 같은 짧은 조건을 (좌) 분기+마스크 vs (우) predication으로.
//
// 두 패널 모두 가로 = 시간(명령 스트림). 셀 하나 = 한 명령(또는 명령 묶음).
//
// 좌(분기): [조건 평가][분기 명령][then 블록(else 레인 off)][else 블록(then 레인 off)]
//   → 분기 오버헤드(점프/마스크 셋업)가 별도 셀로 보인다.
// 우(predication): [조건 평가→predicate][then 코드][else 코드]  (분기 명령 없음)
//   → 분기 셀이 없다. 대신 then/else를 둘 다 "스트레이트라인"으로 깔고 predicate가 결과만 고른다.
//
// 핵심: predication은 분기 비용을 없애는 대신 "양쪽을 다 실행"한다. 경로가 짧으면 이득,
//       길면 손해(break-even). 캔버스엔 길이 비교를 위해 셀 개수만 다르게.
// 캔버스 글자 최소: 패널 제목 2개, 셀 위 짧은 토큰, 길이 합 1개씩.
// ---------------------------------------------------------------------------

const CANVAS_H = 330;

interface Step {
  label: string;
  color: string;
  /** 마스크 off 여부(흐리게) — 분기 패널에서 일부 레인이 노는 걸 표시 */
  faded?: boolean;
}

export default function PredicationVsBranch() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const pad = 16;
    const colGap = 22;
    const panelW = (w - 2 * pad - colGap) / 2;

    // 두 패널 각각의 "명령 스트림"(가로로 셀 나열).
    // 짧은 조건이라 then=2칸, else=2칸으로 둔다(대표 상태).
    const branchSteps: Step[] = [
      { label: 'cmp', color: COLORS.sched },
      { label: 'br', color: COLORS.sched },
      { label: 'then', color: COLORS.then },
      { label: 'then', color: COLORS.then },
      { label: 'else', color: COLORS.else, faded: false },
      { label: 'else', color: COLORS.else, faded: false },
    ];
    const predSteps: Step[] = [
      { label: 'cmp→p', color: COLORS.sched },
      { label: 'then', color: COLORS.then },
      { label: 'then', color: COLORS.then },
      { label: 'else', color: COLORS.else },
      { label: 'else', color: COLORS.else },
    ];

    const title = (cx: number, text: string, sub: string): void => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = monoFont(13);
      ctx.fillStyle = theme.text;
      ctx.fillText(text, cx, pad);
      ctx.font = monoFont(10);
      ctx.fillStyle = theme.muted;
      ctx.fillText(sub, cx, pad + 18);
    };

    const streamTop = pad + 44;
    const cellH = 34;
    const stepGap = 6;

    const drawStream = (panelX: number, steps: Step[], totalLabel: string): void => {
      // 셀 폭: 패널 폭을 가장 긴 스트림(분기=6칸) 기준으로 맞춰 두 패널 셀 크기를 통일.
      const maxCells = 6;
      const cellW = (panelW - (maxCells - 1) * stepGap) / maxCells;
      for (let i = 0; i < steps.length; i++) {
        const x = panelX + i * (cellW + stepGap);
        const s = steps[i];
        cell(ctx, x, streamTop, cellW, cellH, s.color, {
          fillAlpha: s.faded ? 0.12 : 0.34,
          strokeAlpha: s.faded ? 0.4 : 0.9,
          radius: 4,
        });
        centerText(
          ctx,
          s.label,
          x + cellW / 2,
          streamTop + cellH / 2,
          theme.text,
          monoFont(9),
        );
      }
      // 길이(셀 수) 라벨: 스트림 아래
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = monoFont(11);
      ctx.fillStyle = theme.text;
      ctx.fillText(totalLabel, panelX, streamTop + cellH + 14);
    };

    // 좌: 분기
    const lx = pad;
    title(lx + panelW / 2, '분기 + 마스크', 'cmp · br · then · else');
    drawStream(lx, branchSteps, '총 6 명령 (분기 2 + 경로 4)');

    // then/else가 "둘 다" 실행된다는 점을 분기 패널에도 표시:
    // then 블록 동안 else 레인 off, else 블록 동안 then 레인 off → 작은 마스크 띠
    const maskBarY = streamTop + cellH + 38;
    ctx.font = monoFont(9);
    ctx.fillStyle = theme.muted;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('then 패스: else 레인 off · else 패스: then 레인 off', lx, maskBarY);

    // 우: predication
    const rx = pad + panelW + colGap;
    title(rx + panelW / 2, 'predication', 'cmp→predicate · 분기 없음');
    drawStream(rx, predSteps, '총 5 명령 (분기 0 + 경로 4)');
    ctx.font = monoFont(9);
    ctx.fillStyle = theme.muted;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('predicate가 결과만 골라 씀 (둘 다 실행)', rx, maskBarY);

    // 가운데 구분선
    const sepX = pad + panelW + colGap / 2;
    ctx.strokeStyle = withAlpha(theme.border, 0.9);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sepX, pad + 4);
    ctx.lineTo(sepX, h - pad);
    ctx.stroke();
    ctx.setLineDash([]);

    // 하단 한 줄: 둘 다 "양쪽 경로"를 실행한다는 공통점 + 차이(분기 셀)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = monoFont(10);
    ctx.fillStyle = theme.muted;
    ctx.fillText(
      '경로가 짧을수록 predication 유리 · 길수록 분기 유리',
      w / 2,
      h - pad + 4,
    );

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
        같은 짧은 <code>if/else</code>를 컴파일하는 두 방식입니다. <strong>왼쪽(분기)</strong>은
        조건을 평가하고(<code>cmp</code>), <code>br</code> 명령으로 점프해, then 블록과 else 블록을
        각각 마스크를 걸어 실행합니다 — 앞쪽 두 칸의 <em>분기 오버헤드</em>(비교·점프·마스크 셋업)가
        보이죠. <strong>오른쪽(predication)</strong>은 조건을 <strong>predicate 비트</strong>로 만든
        뒤, then 코드와 else 코드를 <em>분기 없이 일직선으로</em> 쭉 깔고, 각 명령이 자기 predicate가
        참일 때만 결과를 씁니다. 분기 명령이 사라진 게 핵심 차이입니다. 하지만 공짜는 아닙니다 —{' '}
        <strong>predication도 양쪽 경로를 모두 실행</strong>합니다(다이버전스와 똑같이). 차이는{' '}
        <em>분기 명령·파이프라인 교란을 없앤 것</em>뿐입니다. 그래서 트레이드오프는 경로 길이로
        갈립니다: 경로가 <strong>짧으면</strong> 없앤 분기 비용 &gt; 더 한 일이라 predication이 이기고,
        경로가 <strong>길면</strong> 양쪽을 다 도는 비용이 분기 비용을 넘어서 진짜 분기가 이깁니다.
        컴파일러는 보통 이 손익분기를 보고 짧은 조건은 자동으로 predicate로 바꿉니다.
      </figcaption>
    </figure>
  );
}
