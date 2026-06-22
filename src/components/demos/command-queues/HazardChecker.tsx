import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { QUEUE_COLORS, withAlpha, roundRect, drawArrow, pill } from './cq2d';

// ─────────────────────────────────────────────────────────────────────────────
// 정적 도식: 해저드와 배리어 (RAW 사례)
//
// 한 큐에서 하나의 리소스(텍스처)에 연달아 작동하는 두 연산 A→B 사이에 올바른
// 파이프라인 배리어가 들어간 모습을 보여준다. 가장 흔한 RAW(write→read,
// 렌더-투-텍스처 후 샘플)를 대표 사례로 골라:
//   - src/dst 스테이지+접근(실행 의존성 + 메모리 가시성)
//   - 레이아웃 전이(COLOR_ATTACHMENT_OPTIMAL → SHADER_READ_ONLY_OPTIMAL)
// 둘을 모두 지정한 "올바른 배리어"를 라벨과 함께 그린다. 빠뜨렸을 때의 두 실패
// 모드(① 배리어 없음 → RAW 해저드, ② 레이아웃 누락 → 쓰레기 샘플)는 주석으로 적는다.
//
// 비-렌더링 시스템 주제이므로 드래그-퀴즈 대신 라벨이 달린 정적 그림으로 가르친다.
// ─────────────────────────────────────────────────────────────────────────────

const SPEC = {
  title: 'RAW — RT에 그린 뒤 셰이더 샘플',
  a: {
    label: 'A: RT에 그리기',
    detail: 'write · COLOR_OUT',
    layout: 'COLOR_ATTACHMENT',
    color: QUEUE_COLORS.graphics,
    kind: 'write' as 'read' | 'write',
  },
  b: {
    label: 'B: 셰이더 샘플',
    detail: 'read · FRAGMENT',
    layout: 'SHADER_READ_ONLY',
    color: QUEUE_COLORS.graphics,
    kind: 'read' as 'read' | 'write',
  },
  srcStage: 'COLOR_OUT',
  srcAccess: 'COLOR_WRITE',
  dstStage: 'FRAGMENT',
  dstAccess: 'SHADER_READ',
  oldLayout: 'COLOR_ATTACHMENT',
  newLayout: 'SHADER_READ_ONLY',
};

const PAD = 14;
const CARD_Y = 56;
const CARD_H = 88;
const TRACK_GAP = 64;
const CANVAS_W = 360;
const CANVAS_H = 380;

export default function HazardChecker() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const x0 = PAD;
    const x1 = w - PAD;
    const totalW = x1 - x0;
    const cardW = (totalW - TRACK_GAP) / 2;
    const aX = x0;
    const gapX0 = x0 + cardW;
    const gapX1 = gapX0 + TRACK_GAP;
    const bX = gapX1;
    const gapCx = (gapX0 + gapX1) / 2;

    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    // 제목.
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillStyle = theme.text;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(SPEC.title, x0, 28);

    const midY = CARD_Y + CARD_H / 2;
    ctx.strokeStyle = withAlpha(theme.border, 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, midY);
    ctx.lineTo(x1, midY);
    ctx.stroke();

    const drawCard = (
      op: typeof SPEC.a,
      x: number,
      cw: number,
      resourceLayout: string,
    ): void => {
      roundRect(ctx, x, CARD_Y, cw, CARD_H, 8);
      if (op.kind === 'write') {
        ctx.fillStyle = withAlpha(op.color, 0.22);
        ctx.fill();
        ctx.strokeStyle = op.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
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
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillStyle = theme.text;
      ctx.fillText(op.label, x + 10, CARD_Y + 24);
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.fillText(op.detail, x + 10, CARD_Y + 46);
      const badge = op.kind === 'write' ? 'WRITE' : 'READ';
      pill(
        ctx,
        x + cw - 32,
        CARD_Y + 64,
        badge,
        op.kind === 'write' ? op.color : withAlpha(op.color, 0.85),
        '#ffffff',
        '12px ui-monospace, monospace',
      );

      // 리소스 상태 칩(레이아웃 라벨).
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.fillText('리소스 상태', x + 10, CARD_Y + CARD_H + 18);
      pill(
        ctx,
        x + cw / 2,
        CARD_Y + CARD_H + 34,
        resourceLayout,
        withAlpha(theme.text, 0.12),
        theme.text,
        '12px ui-monospace, monospace',
      );
    };

    // A는 옛 레이아웃, B는 (올바른 배리어 덕분에) 새 레이아웃.
    drawCard(SPEC.a, aX, cardW, SPEC.oldLayout.replace('_OPTIMAL', ''));
    drawCard(SPEC.b, bX, cardW, SPEC.newLayout.replace('_OPTIMAL', ''));

    // 순서 화살표 A→B.
    drawArrow(ctx, gapX0 - 2, midY, gapX1 + 2, midY, withAlpha(theme.muted, 0.6), {
      width: 1.2,
      head: 6,
    });

    // 올바른 배리어: 세로 막대.
    {
      const bx = gapCx;
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

      // src ▸ dst 스테이지/접근 + 레이아웃 전이 라벨.
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '9px ui-monospace, monospace';
      const labelY = CARD_Y + CARD_H + 54;
      ctx.fillStyle = theme.text;
      ctx.fillText(`${SPEC.srcStage} / ${SPEC.srcAccess}`, bx, labelY);
      ctx.fillStyle = theme.muted;
      ctx.fillText('▸', bx, labelY + 12);
      ctx.fillStyle = theme.text;
      ctx.fillText(`${SPEC.dstStage} / ${SPEC.dstAccess}`, bx, labelY + 24);
      ctx.fillStyle = QUEUE_COLORS.ok;
      ctx.fillText(`${SPEC.oldLayout} ▸ ${SPEC.newLayout}`, bx, labelY + 40);
      ctx.textAlign = 'left';
    }

    // 판정 알약(우상단) — 올바른 배리어이므로 ✓.
    pill(ctx, x1 - 64, 14, '✓ 해저드 없음', QUEUE_COLORS.ok, '#ffffff', 'bold 11px ui-monospace, monospace');

    // 실패 모드 주석(하단).
    const noteY = CANVAS_H - 56;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = QUEUE_COLORS.bad;
    ctx.fillText('빼먹으면 깨지는 두 가지:', x0, noteY);
    ctx.fillStyle = theme.muted;
    ctx.fillText(
      '① 배리어 자체가 없으면 → B가 A의 쓰기 전에 읽음 = RAW 해저드(깜빡임/검증 오류)',
      x0,
      noteY + 16,
    );
    ctx.fillText(
      '② 단계·접근은 맞아도 레이아웃 전이를 빼면 → 쓰레기 샘플(두 번째 실패 모드)',
      x0,
      noteY + 32,
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
        같은 리소스에 두 연산이 잇따르면 세 가지 해저드가 생길 수 있습니다 —{' '}
        <strong>RAW</strong>(쓰고 나서 읽기, 가장 흔함), <strong>WAR</strong>(읽고 나서 쓰기),{' '}
        <strong>WAW</strong>(쓰고 나서 또 쓰기). GPU는 파이프라이닝·재정렬을 하므로, 배리어가 없으면
        뒤 연산이 앞 연산의 효과가 보이기도 전에 끼어듭니다. 위 그림은 가장 흔한 <strong>RAW</strong>{' '}
        (렌더 타깃 → 샘플링)에 들어간 <em>올바른 배리어</em>입니다. 배리어는{' '}
        <em>src/dst 단계+접근</em>(실행 의존성 + 메모리 가시성)을 지정하고, 이미지이므로{' '}
        <em>레이아웃 전이</em>(COLOR_ATTACHMENT_OPTIMAL → SHADER_READ_ONLY_OPTIMAL)까지 함께
        일으켜 B 카드의 리소스 상태가 새 레이아웃으로 바뀝니다. 하단의 두 실패 모드에 주의하세요:
        배리어가 아예 없으면 RAW 해저드가 나고, 단계·접근은 맞아도 레이아웃 전이를 빠뜨리면 쓰레기를
        샘플링합니다. 명시적 API에서는 GPU가 이걸 대신 넣어주지 않습니다 — 정확성은{' '}
        <strong>당신의 몫</strong>입니다.
      </figcaption>
    </figure>
  );
}
