import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, roundRect, withAlpha, monoFont, centerText, labelBox } from './gem2d';

// ---------------------------------------------------------------------------
// 정적 도식: 한 SM(Streaming Multiprocessor)의 플로어플랜.
//
// SM은 단일 거대한 코어가 아니라, 4개의 스케줄러 파티션(processing block)으로
// 쪼개져 있다. 각 파티션은 자기만의 워프 스케줄러 + 디스패치 + 레지스터 파일 +
// 실행 유닛(FP32/INT ALU 레인, SFU, LSU, 텐서 코어)을 갖는다. 공유 메모리/L1과
// 텍스처 유닛은 SM 전체가 공유한다.
//
// 캔버스 안 글자는 짧은 블록명만. 설명은 전부 figcaption.
// "CUDA 코어"란 마케팅 용어가 사실은 FP32 ALU 레인 하나라는 게 핵심.
// ---------------------------------------------------------------------------

const CANVAS_H = 440;

export default function SmFloorplan() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const pad = 12;
    const outerX = pad;
    const outerY = pad;
    const outerW = w - 2 * pad;
    const outerH = h - 2 * pad;

    // SM 외곽
    roundRect(ctx, outerX, outerY, outerW, outerH, 12);
    ctx.fillStyle = withAlpha(theme.border, 0.18);
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // SM 라벨
    ctx.font = monoFont(12);
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SM', outerX + 12, outerY + 8);

    // 하단 공유 영역 높이(공유 메모리/L1 + 텍스처)
    const sharedH = 52;
    const sharedGap = 10;
    const partsTop = outerY + 30;
    const partsBottom = outerY + outerH - sharedH - sharedGap - 8;
    const partsAreaH = partsBottom - partsTop;

    // 4개 파티션을 2×2 그리드로 배치
    const cols = 2;
    const rows = 2;
    const partGapX = 10;
    const partGapY = 10;
    const innerX = outerX + 12;
    const innerW = outerW - 24;
    const partW = (innerW - (cols - 1) * partGapX) / cols;
    const partH = (partsAreaH - (rows - 1) * partGapY) / rows;

    const drawPartition = (px: number, py: number, idx: number): void => {
      // 파티션 외곽
      roundRect(ctx, px, py, partW, partH, 8);
      ctx.fillStyle = withAlpha(theme.surface, 0.6);
      ctx.fill();
      ctx.strokeStyle = withAlpha(theme.text, 0.35);
      ctx.lineWidth = 1.1;
      ctx.stroke();

      const ipad = 7;
      let cy = py + ipad;
      const cx = px + ipad;
      const cw = partW - 2 * ipad;

      // 스케줄러 + 디스패치 헤더
      const schedH = 16;
      labelBox(ctx, cx, cy, cw, schedH, `워프 스케줄러 ${idx}`, COLORS.sched, theme.text, {
        font: monoFont(9),
        radius: 4,
        fillAlpha: 0.22,
      });
      cy += schedH + 5;

      // 레지스터 파일
      const regH = 13;
      labelBox(ctx, cx, cy, cw, regH, '레지스터 파일 (16K×32b)', COLORS.mem, theme.text, {
        font: monoFont(8),
        radius: 4,
        fillAlpha: 0.16,
      });
      cy += regH + 5;

      // FP32 레인 그리드 (16개 = "CUDA 코어"). 2행 8열.
      const laneRows = 2;
      const laneCols = 8;
      const laneGap = 2;
      const laneAreaH = 26;
      const laneW = (cw - (laneCols - 1) * laneGap) / laneCols;
      const laneH = (laneAreaH - (laneRows - 1) * laneGap) / laneRows;
      for (let r = 0; r < laneRows; r++) {
        for (let c = 0; c < laneCols; c++) {
          const lx = cx + c * (laneW + laneGap);
          const ly = cy + r * (laneH + laneGap);
          roundRect(ctx, lx, ly, laneW, laneH, 2);
          ctx.fillStyle = withAlpha(COLORS.fp32, 0.32);
          ctx.fill();
          ctx.strokeStyle = withAlpha(COLORS.fp32, 0.85);
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
      // FP32 라벨(작게, 그리드 위)
      ctx.font = monoFont(8);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('FP32 ×16', cx, cy - 1);
      cy += laneAreaH + 5;

      // INT / SFU / LSU 한 행
      const utilH = 13;
      const utilGap = 4;
      const utilW = (cw - 2 * utilGap) / 3;
      labelBox(ctx, cx, cy, utilW, utilH, 'INT', COLORS.int, theme.text, {
        font: monoFont(9),
        radius: 3,
        fillAlpha: 0.22,
      });
      labelBox(ctx, cx + utilW + utilGap, cy, utilW, utilH, 'SFU', COLORS.sfu, theme.text, {
        font: monoFont(9),
        radius: 3,
        fillAlpha: 0.22,
      });
      labelBox(
        ctx,
        cx + 2 * (utilW + utilGap),
        cy,
        utilW,
        utilH,
        'LSU',
        COLORS.lsu,
        theme.text,
        { font: monoFont(9), radius: 3, fillAlpha: 0.22 },
      );
      cy += utilH + 5;

      // 텐서 코어
      const tH = py + partH - ipad - cy;
      const tHeight = Math.max(13, Math.min(16, tH));
      labelBox(ctx, cx, cy, cw, tHeight, '텐서 코어', COLORS.tensor, theme.text, {
        font: monoFont(9),
        radius: 4,
        fillAlpha: 0.2,
      });
    };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const px = innerX + c * (partW + partGapX);
        const py = partsTop + r * (partH + partGapY);
        drawPartition(px, py, idx);
      }
    }

    // 하단 공유 영역: 공유 메모리/L1 + 텍스처
    const shY = partsBottom + sharedGap;
    const shX = innerX;
    const shW = innerW;
    const shGap = 10;
    const memW = shW * 0.62;
    const texW = shW - memW - shGap;

    roundRect(ctx, shX, shY, memW, sharedH, 7);
    ctx.fillStyle = withAlpha(COLORS.mem, 0.16);
    ctx.fill();
    ctx.strokeStyle = withAlpha(COLORS.mem, 0.85);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    centerText(
      ctx,
      '공유 메모리 / L1 (128 KB)',
      shX + memW / 2,
      shY + sharedH / 2,
      theme.text,
      monoFont(11),
    );

    roundRect(ctx, shX + memW + shGap, shY, texW, sharedH, 7);
    ctx.fillStyle = withAlpha(theme.muted, 0.12);
    ctx.fill();
    ctx.strokeStyle = withAlpha(theme.muted, 0.7);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    centerText(
      ctx,
      'Tex 유닛',
      shX + memW + shGap + texW / 2,
      shY + sharedH / 2,
      theme.text,
      monoFont(10),
    );

    // 정렬 복구
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
        한 <strong>SM</strong>(Streaming Multiprocessor, AMD에선 CU)의 평면도입니다. 흔한 오해는
        SM을 “하나의 큰 코어”로 보는 것인데, 실제로는 <strong>4개의 스케줄러 파티션</strong>(processing
        block)으로 쪼개져 있습니다. 각 파티션은 <em>자기만의</em> 워프 스케줄러·레지스터 파일·실행
        유닛을 가진 작은 독립 공장입니다. 그 안의 파란 칸 하나하나 — <strong>FP32 ALU 레인</strong> —
        가 바로 마케팅이 말하는 “CUDA 코어”입니다. 코어는 거창한 CPU 코어가 아니라{' '}
        <em>32비트 부동소수점 곱셈-덧셈을 하나 처리하는 산술 레인</em>일 뿐입니다. INT는 정수 연산,{' '}
        <strong>SFU</strong>는 sin·exp·rsqrt 같은 초월함수, <strong>LSU</strong>는 메모리 로드/스토어,{' '}
        <strong>텐서 코어</strong>는 작은 행렬 곱(딥러닝·DLSS)을 담당합니다. 파티션 넷이 끝나는
        아래쪽 <strong>공유 메모리/L1</strong>과 텍스처 유닛은 SM 전체가 함께 씁니다 — 같은 블록의
        스레드들이 데이터를 주고받는 “작업대”가 여기입니다. (숫자는 Ada/Ampere 세대의 대표값이며 세대마다 다릅니다.)
      </figcaption>
    </figure>
  );
}
