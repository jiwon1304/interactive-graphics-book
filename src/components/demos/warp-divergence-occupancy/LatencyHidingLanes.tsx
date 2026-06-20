import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, monoFont, cell } from './wdo2d';

// ---------------------------------------------------------------------------
// 정적 도식: 지연 숨기기 — 낮은 점유율(버블 발생) vs 높은 점유율(버블 없음).
//
// 두 개의 스택된 타임라인. 가로 = 시간(사이클), 세로 = 그 SM/파티션에 걸린 워프들.
// 각 워프는 짧게 compute(파랑) 후 긴 stall(메모리 대기, 흐린 황토)을 반복.
//
// 위(낮은 점유율, 워프 2개): 두 워프가 동시에 stall에 빠지는 구간이 생겨 → SM이 노는
//   "버블"(빨강 빗금)이 실행 레인(맨 아래 SM 행)에 뚫린다.
// 아래(높은 점유율, 워프 6개): 한 워프가 stall인 동안 항상 compute할 다른 워프가 있어
//   SM 실행 레인이 빈틈없이 채워진다 → 버블 없음.
//
// 캔버스 글자 최소: 두 라벨("낮은 점유율"/"높은 점유율"), "버블" 마커, compute/stall 범례.
// ---------------------------------------------------------------------------

const CANVAS_H = 380;

export default function LatencyHidingLanes() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const pad = 16;
    const legendH = 20;

    // 시간 격자
    const NC = 18; // 사이클 칸 수
    const gridLeft = pad + 30;
    const gridW = w - gridLeft - pad;
    const colW = gridW / NC;

    // compute 길이 1칸, stall 길이 3칸 → "지연/처리량 = 3" → 가리려면 워프 ≈ 1 + 3 = 4개 필요.
    const COMP = 1;
    const STALL = 3;
    const PERIOD = COMP + STALL; // 4

    // 한 워프의 타임라인을 그린다: offset부터 (compute, stall) 반복.
    // 반환: 각 사이클이 compute인지 여부(SM 실행 레인 점유 계산용).
    const drawWarpRow = (
      y: number,
      rowH: number,
      offset: number,
    ): boolean[] => {
      const busy: boolean[] = Array.from({ length: NC }, () => false);
      for (let c = 0; c < NC; c++) {
        const x = gridLeft + c * colW;
        const phase = (c - offset + PERIOD * 4) % PERIOD;
        const started = c >= offset;
        if (!started) {
          cell(ctx, x + 0.5, y, colW - 1, rowH, theme.muted, {
            fillAlpha: 0.04,
            strokeAlpha: 0.1,
            radius: 2,
          });
          continue;
        }
        if (phase < COMP) {
          cell(ctx, x + 0.5, y, colW - 1, rowH, COLORS.exec, {
            fillAlpha: 0.42,
            strokeAlpha: 0.9,
            radius: 2,
          });
          busy[c] = true;
        } else {
          cell(ctx, x + 0.5, y, colW - 1, rowH, COLORS.stall, {
            fillAlpha: 0.13,
            strokeAlpha: 0.32,
            radius: 2,
          });
        }
      }
      return busy;
    };

    // SM 실행 레인 행: 그 시점에 compute하는 워프가 하나라도 있으면 busy(파랑),
    // 아무도 없으면 버블(빨강).
    const drawSmRow = (y: number, rowH: number, busyByCycle: boolean[]): void => {
      for (let c = 0; c < NC; c++) {
        const x = gridLeft + c * colW;
        if (busyByCycle[c]) {
          cell(ctx, x + 0.5, y, colW - 1, rowH, COLORS.exec, {
            fillAlpha: 0.5,
            strokeAlpha: 0.95,
            radius: 2,
          });
        } else {
          // 버블: 빨강 빗금
          cell(ctx, x + 0.5, y, colW - 1, rowH, COLORS.bubble, {
            fillAlpha: 0.2,
            strokeAlpha: 0.85,
            radius: 2,
          });
          // 대각선 빗금
          ctx.save();
          ctx.strokeStyle = withAlpha(COLORS.bubble, 0.8);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 2, y + rowH - 2);
          ctx.lineTo(x + colW - 2, y + 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    };

    // --- 두 시나리오 영역 분할 ---
    const blockGap = 26;
    const areaTop = pad + legendH + 4;
    const areaH = (h - areaTop - pad - blockGap) / 2;

    const drawScenario = (
      topY: number,
      title: string,
      nWarps: number,
    ): void => {
      // 제목
      ctx.font = monoFont(12);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(title, pad, topY);

      const rowsTop = topY + 18;
      const rowGap = 3;
      // 워프 행 nWarps개 + SM 실행 레인 1행(분리 간격 둠)
      const smGap = 8;
      const usableH = areaH - 18 - smGap;
      const totalRows = nWarps + 1;
      const rowH = (usableH - (totalRows - 1) * rowGap) / totalRows;

      // 각 워프를 offset 1칸씩 어긋나게(스케줄러가 순차 발행한다고 가정).
      const busyAcc: boolean[] = Array.from({ length: NC }, () => false);
      for (let i = 0; i < nWarps; i++) {
        const y = rowsTop + i * (rowH + rowGap);
        const busy = drawWarpRow(y, rowH, i % PERIOD); // offset로 위상 분산
        for (let c = 0; c < NC; c++) {
          if (busy[c]) busyAcc[c] = true;
        }
        // 워프 id
        ctx.font = monoFont(9);
        ctx.fillStyle = theme.muted;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('W' + i, gridLeft - 5, y + rowH / 2);
      }

      // SM 실행 레인(맨 아래, 간격 두고)
      const smY = rowsTop + nWarps * (rowH + rowGap) + smGap;
      drawSmRow(smY, rowH, busyAcc);
      ctx.font = monoFont(9);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('SM', gridLeft - 5, smY + rowH / 2);

      // 버블 개수 세서 "버블" 마커(있을 때만)
      const bubbleCount = busyAcc.filter((b) => !b).length;
      if (bubbleCount > 0) {
        // 첫 버블 위에 라벨
        const firstBubble = busyAcc.findIndex((b) => !b);
        const bx = gridLeft + firstBubble * colW + colW / 2;
        ctx.font = monoFont(9);
        ctx.fillStyle = COLORS.bubble;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('버블', bx, smY - 1);
      } else {
        // 빈틈 없음 표시
        ctx.font = monoFont(9);
        ctx.fillStyle = COLORS.then;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('빈틈 없음 ✓', gridLeft, smY - 1);
      }
    };

    drawScenario(areaTop, '낮은 점유율 (워프 2)', 2);
    drawScenario(areaTop + areaH + blockGap, '높은 점유율 (워프 6)', 6);

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
        strokeAlpha: 0.9,
        radius: 3,
      });
      ctx.fillStyle = theme.text;
      ctx.fillText(label, lxp + chipR * 2 + 5, chipY + chipR);
      lxp += chipR * 2 + 5 + ctx.measureText(label).width + 16;
    };
    chip(COLORS.exec, 'compute', 0.42);
    chip(COLORS.stall, 'stall', 0.13);
    chip(COLORS.bubble, '버블(SM 유휴)', 0.2);

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
        같은 워크로드를 점유율만 바꿔 돌린 두 타임라인입니다(가로=시간). 각 워프는 짧게{' '}
        <strong>compute</strong>(파랑) 하고 긴 <strong>stall</strong>(메모리 대기, 흐린 황토)에 빠지길
        반복합니다 — 여기서는 compute 1칸 : stall 3칸. 맨 아래 <code>SM</code> 행은 그 시점에 실제로
        일하는 실행 레인입니다. <strong>위(워프 2개·낮은 점유율)</strong>: 두 워프가 동시에 stall에
        빠지는 순간이 생겨 SM에 시킬 일이 없어집니다 — <strong>버블</strong>(빨강 빗금), 즉 비싼
        실행 유닛이 노는 시간입니다. <strong>아래(워프 6개·높은 점유율)</strong>: 한 워프가 기다리는
        동안 항상 compute할 다른 워프가 있어 SM 행이 <em>빈틈없이</em> 찹니다. 이게 핵심 직관입니다 —{' '}
        <strong>지연을 가리려면 충분히 많은 워프가 필요하다.</strong> 필요한 워프 수는 대략{' '}
        <em>지연 ÷ 처리량</em>(여기선 (1+3)/1 = 4개)으로, 한 워프가 기다리는 긴 시간을 다른 워프들의
        일감으로 메우는 데 몇 개가 드는지를 말합니다. 점유율이 낮으면 워프가 모자라 버블이 뚫리고, GPU의
        지연 숨기기 전략이 무너집니다.
      </figcaption>
    </figure>
  );
}
