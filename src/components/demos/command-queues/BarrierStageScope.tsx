import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { QUEUE_COLORS, roundRect, withAlpha, drawArrow } from './cq2d';

// ---------------------------------------------------------------------------
// 정적 도식: 파이프라인 배리어의 "스테이지 스코프(stage scope)"
//
// 배리어는 "전부 멈춰!"가 아니라 스테이지 단위의 범위(scope) 지정이다.
//   srcStageMask = "앞선 명령들이 이 스테이지까지 도달(완료)할 때까지 기다린다"
//                  (그보다 뒤 스테이지의 앞 작업은 기다리지 않음)
//   dstStageMask = "뒤따르는 명령들을 이 스테이지에서 막는다"
//                  (그보다 앞 스테이지의 뒤 작업은 먼저 진행될 수 있음)
//
// 너무 넓게 잡으면(src=BOTTOM_OF_PIPE, dst=TOP_OF_PIPE) 전체가 직렬화되어
// 오버랩이 죽고, 너무 좁게 잡으면 실제 의존(쓰기↔읽기)을 놓쳐 해저드가 난다.
// 정답은 "가장 좁으면서 정확한(tightest correct)" 스코프다.
//
// 비-렌더링 시스템 주제이므로 드래그 대신, 대표 시나리오(RT→샘플링)에서 tight한
// 정답 스코프를 라벨과 함께 정적으로 보여준다.
// ---------------------------------------------------------------------------

// 짧은 스테이지 라벨(모바일 좁은 폭에서 박스를 안 넘게 축약).
const STAGES = [
  'TOP',
  'VERTEX',
  'EARLY_Z',
  'FRAGMENT',
  'COLOR_OUT',
  'BOTTOM',
] as const;

// 시나리오: 렌더 타깃에 색을 쓴 뒤(COLOR_OUT) 다음 패스가 텍스처로 샘플링(FRAGMENT).
const WRITE_STAGE = STAGES.indexOf('COLOR_OUT');
const READ_STAGE = STAGES.indexOf('FRAGMENT');
// tight한 정답: src=쓰기 스테이지, dst=읽기 스테이지(과동기화 0).
const SRC = WRITE_STAGE;
const DST = READ_STAGE;

const CANVAS_W = 360;
const CANVAS_H = 440;

export default function BarrierStageScope() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 12;
    const top = 64;
    const bottomPad = 70; // 하단 주석 공간(여러 줄)
    const rowH = Math.min(40, (h - top - bottomPad) / STAGES.length);
    // 가운데 거터(gutter)는 점/화살표/주석이 들어갈 공간이라 좁은 폭에서도 최소 폭을 보장.
    const colW = Math.min(150, (w - padX * 2 - 56) / 2);
    const gap = w - padX * 2 - colW * 2;
    const leftX = padX;
    const rightX = padX + colW + gap;
    const gutterCx = (leftX + colW + rightX) / 2;

    // 시나리오 제목.
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillStyle = theme.text;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('배리어의 stage scope', leftX, 22);
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = theme.muted;
    ctx.fillText('RT→샘플링: tight한 정답', leftX, 40);

    // 컬럼 제목.
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = QUEUE_COLORS.stall;
    ctx.fillText('producer (src)', leftX, top - 8);
    ctx.fillStyle = QUEUE_COLORS.graphics;
    ctx.fillText('consumer (dst)', rightX, top - 8);

    const drawLadder = (x: number, side: 'left' | 'right'): void => {
      for (let i = 0; i < STAGES.length; i++) {
        const y = top + i * rowH;
        let shade: string | null = null;
        if (side === 'left') {
          if (i <= SRC) shade = withAlpha(QUEUE_COLORS.stall, 0.18); // src까지 완료 대기
        } else {
          if (i >= DST) shade = withAlpha(QUEUE_COLORS.graphics, 0.18); // dst부터 블록
        }

        roundRect(ctx, x, y + 2, colW, rowH - 4, 6);
        ctx.fillStyle = shade ?? withAlpha(theme.border, 0.35);
        ctx.fill();
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1;
        ctx.stroke();

        const isReal =
          (side === 'left' && i === WRITE_STAGE) || (side === 'right' && i === READ_STAGE);
        if (isReal) {
          const realCol = side === 'left' ? QUEUE_COLORS.bad : QUEUE_COLORS.ok;
          roundRect(ctx, x, y + 2, colW, rowH - 4, 6);
          ctx.strokeStyle = realCol;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.font = '12px ui-monospace, monospace';
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(STAGES[i], x + 6, y + rowH / 2);
        ctx.textBaseline = 'alphabetic';

        if (isReal) {
          const label = side === 'left' ? '쓰기' : '읽기';
          const col = side === 'left' ? QUEUE_COLORS.bad : QUEUE_COLORS.ok;
          ctx.font = 'bold 12px ui-monospace, monospace';
          ctx.fillStyle = col;
          ctx.textAlign = 'right';
          ctx.fillText(label, x + colW - 6, y + rowH / 2);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
        }
      }
    };

    drawLadder(leftX, 'left');
    drawLadder(rightX, 'right');

    // "안 기다림" / "먼저 진행 가능" 주석 — 거터(가운데)에 가운데 정렬로 둬서
    // 사다리 셀의 긴 스테이지 이름과 겹치지 않게 한다. 화살표가 지나는 행(SRC..DST)
    // 바깥의 행(SRC+1, DST-1)에 배치해 화살표/점과도 분리된다.
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    if (SRC < STAGES.length - 1) {
      const y = top + (SRC + 1) * rowH + rowH / 2;
      ctx.fillStyle = theme.muted;
      ctx.fillText('↑ 안 기다림', gutterCx, y + 3);
    }
    if (DST > 0) {
      const y = top + (DST - 1) * rowH + rowH / 2;
      ctx.fillStyle = theme.muted;
      ctx.fillText('↓ 먼저 진행', gutterCx, y + 3);
    }
    ctx.textAlign = 'left';

    // 점(드래그 아님 — src/dst 스테이지 위치 표시) — 거터 안쪽에 둔다.
    const srcDotX = leftX + colW + 12;
    const dstDotX = rightX - 12;

    // 커버 화살표: src 점 → dst 점, 커버됨 = 초록.
    {
      const sY = top + SRC * rowH + rowH / 2;
      const dY = top + DST * rowH + rowH / 2;
      drawArrow(ctx, srcDotX, sY, dstDotX, dY, QUEUE_COLORS.ok, {
        dashed: true,
        width: 1.5,
        head: 7,
      });
    }

    const drawDot = (hx: number, stageIdx: number, color: string, label: string, anchor: 'left' | 'right'): void => {
      const cy = top + stageIdx * rowH + rowH / 2;
      ctx.beginPath();
      ctx.arc(hx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = theme.bg;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = 'bold 12px ui-monospace, monospace';
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
    // src 점은 라벨을 오른쪽(거터)으로, dst 점은 왼쪽(거터)으로 → 화면 밖으로 안 나감.
    drawDot(srcDotX, SRC, QUEUE_COLORS.stall, 'src', 'right');
    drawDot(dstDotX, DST, QUEUE_COLORS.graphics, 'dst', 'left');

    // 하단 주석: tight vs 전체 배리어 비교.
    const noteY = h - 48;
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = QUEUE_COLORS.ok;
    ctx.fillText('✓ tight: src=COLOR_OUT, dst=FRAGMENT', padX, noteY);
    ctx.fillStyle = theme.muted;
    ctx.fillText('딱 필요한 만큼만 — 과동기화 0', padX, noteY + 18);
    ctx.fillText('cf. 전체 배리어는 직렬화 → 오버랩 죽음', padX, noteY + 36);
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{
          width: '100%',
          maxWidth: CANVAS_W,
          minWidth: 0,
          height: 'auto',
          aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
          display: 'block',
        }}
      />
      <figcaption>
        배리어는 “전부 멈춰”라는 벽이 아니라 <strong>스테이지 범위(scope)</strong>입니다.{' '}
        <strong>srcStage</strong>는 “앞선 명령들이 이 스테이지까지 도달(완료)하기를 기다린다”는
        뜻이고(그보다 뒤 스테이지의 작업은 기다리지 않습니다 — “↑ 안 기다림”), <strong>dstStage</strong>는
        “뒤따르는 명령들을 이 스테이지부터 막는다”는 뜻입니다(그보다 앞 스테이지들은 먼저 진행됩니다 —
        “↓ 먼저 진행 가능”). 위 그림은 RT→샘플링 의존에서 <em>가장 좁으면서 정확한(tight)</em>{' '}
        스코프입니다: 빨간 “실제 쓰기”(COLOR_ATTACHMENT_OUTPUT)를 src가 딱 덮고, 초록 “실제
        읽기”(FRAGMENT_SHADER)를 dst가 딱 막아 — 초록 화살표가 의존을 커버하면서 과동기화는 0입니다.
        범위를 너무 넓게 잡으면(src=BOTTOM, dst=TOP) 커버는 되지만 전체가 직렬화돼 오버랩이 죽고, 너무
        좁게 잡으면 실제 쓰기↔읽기 의존을 놓쳐 해저드가 납니다.
      </figcaption>
    </figure>
  );
}
