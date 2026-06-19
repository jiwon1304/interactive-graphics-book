import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, roundRect, withAlpha, monoFont, centerText, drawArrow } from './gem2d';

// ---------------------------------------------------------------------------
// 정적 도식: 워프(warp) = 32 스레드 락스텝(lockstep).
//
// 하나의 명령(FMA)이 한 사이클에 32개 레인 전부로 "브로드캐스트"된다.
// 모든 레인은 같은 명령을, 각자의 데이터(레지스터)로, 정확히 같은 박자에 실행한다.
//
// 캔버스 글자 최소: "1 instr → 32 lanes", 레인 인덱스는 듬성듬성(0,7,15,23,31)만.
// 나머지 설명(블록→워프 분해, 64폭 wavefront)은 figcaption + 본문.
// ---------------------------------------------------------------------------

const CANVAS_H = 300;

export default function WarpLockstep() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const pad = 16;

    // 상단: 단일 명령 박스(디코드된 한 명령)
    const instrW = Math.min(220, w - 2 * pad);
    const instrH = 34;
    const instrX = (w - instrW) / 2;
    const instrY = pad + 6;
    roundRect(ctx, instrX, instrY, instrW, instrH, 8);
    ctx.fillStyle = withAlpha(COLORS.sched, 0.2);
    ctx.fill();
    ctx.strokeStyle = COLORS.sched;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    centerText(ctx, '1 instr:  FMA r2, r0, r1', w / 2, instrY + instrH / 2, theme.text, monoFont(13));

    // 레인 그리드: 4행 8열 = 32
    const cols = 8;
    const rows = 4;
    const gridTop = instrY + instrH + 44;
    const gridGap = 6;
    const gridX = pad + 12;
    const gridW = w - 2 * (pad + 12);
    const cellW = (gridW - (cols - 1) * gridGap) / cols;
    const cellAreaH = h - gridTop - pad - 4;
    const cellH = Math.min(34, (cellAreaH - (rows - 1) * gridGap) / rows);

    // 듬성듬성 인덱스만 라벨링
    const labelIdx = new Set([0, 7, 15, 23, 31]);

    const cellCenters: Array<{ x: number; y: number; idx: number }> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const cx = gridX + c * (cellW + gridGap);
        const cy = gridTop + r * (cellH + gridGap);
        roundRect(ctx, cx, cy, cellW, cellH, 4);
        ctx.fillStyle = withAlpha(COLORS.fp32, 0.28);
        ctx.fill();
        ctx.strokeStyle = withAlpha(COLORS.fp32, 0.9);
        ctx.lineWidth = 1;
        ctx.stroke();
        if (labelIdx.has(idx)) {
          centerText(ctx, String(idx), cx + cellW / 2, cy + cellH / 2, theme.text, monoFont(11));
        } else {
          // 작은 점으로 "레인 있음"만 표시(글자 최소화)
          ctx.beginPath();
          ctx.arc(cx + cellW / 2, cy + cellH / 2, 2, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(theme.text, 0.45);
          ctx.fill();
        }
        cellCenters.push({ x: cx + cellW / 2, y: cy, idx });
      }
    }

    // 브로드캐스트 화살표: 명령 박스 하단 → 첫 행 각 셀 상단
    const srcY = instrY + instrH + 2;
    const srcX = w / 2;
    const fanColor = withAlpha(COLORS.sched, 0.75);
    for (let c = 0; c < cols; c++) {
      const target = cellCenters[c];
      drawArrow(ctx, srcX, srcY, target.x, target.y - 3, fanColor, {
        width: 1.1,
        head: 5,
      });
    }

    // "→ 32 lanes" 라벨: 명령 박스와 그리드 사이 빈 띠의 오른쪽 끝에 둔다.
    // (화살표 팬은 가운데에서 퍼지므로 오른쪽 가장자리는 비어 있어 안 겹친다.)
    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('→ 32 lanes', gridX + gridW, srcY + (gridTop - srcY) * 0.42);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
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
        <strong>워프(warp)</strong>는 GPU 실행의 진짜 단위입니다. 스케줄러가 명령을 하나 꺼내면, 그
        명령은 <em>한 사이클에</em> 32개 레인 전부로 동시에 브로드캐스트됩니다. 32개 스레드가 모두{' '}
        <strong>똑같은 명령</strong>을 — 각자 자기 레지스터의 다른 데이터로 — <strong>정확히 같은
        박자에</strong> 실행합니다. 이것이 <strong>락스텝(lockstep)</strong>입니다. 군대의 제식 행진처럼,
        한 명만 다른 동작을 할 자유가 없습니다. 그래서 여러분이 짠 256-스레드 블록은 하드웨어에서{' '}
        <strong>8개의 워프</strong>로 쪼개져(256 ÷ 32 = 8) 실행됩니다. 블록 크기를 32의 배수로 잡으라는
        조언은 여기서 나옵니다 — 250개로 잡으면 마지막 워프의 6개 레인이 놀게 되니까요. (NVIDIA는 워프 폭이
        32, AMD는 <em>웨이브프론트(wavefront)</em>라 부르며 보통 64(RDNA는 32도 지원)입니다. 폭은
        다르지만 “고정 폭으로 묶어 락스텝” 원리는 같습니다.)
      </figcaption>
    </figure>
  );
}
