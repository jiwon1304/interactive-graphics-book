import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, label, roundRect, withAlpha, monoFont } from './dcj2d';

// 정적 1컷: "한 번의 Draw에서 user CPU 시간이 어디로 가는가"를 per-draw 범주로 보이고,
// 대표 프레임 draw 수에서 그 합이 16.6ms 예산을 넘기는 모습을 한 상태로 고정해 그린다.
// 대표값으로 24k draws를 고정 — 이 지점에서 프레임 합이 16.6ms를 넘어 CPU가 병목이 된다.
// 도식용 대표 차수 — 절대 ns가 아니라 구성과 기울기가 요점.

const CATS = [
  { key: '검증', c: COLORS.validate, ns: 180 },
  { key: '상태·hazard', c: COLORS.state, ns: 340 },
  { key: '디스크립터', c: COLORS.descriptor, ns: 240 },
  { key: '기록·append', c: COLORS.umd, ns: 190 },
]; // ns/draw — user 모드(제출 분할상환분은 작아 생략)

const PER_DRAW_NS = CATS.reduce((s, c) => s + c.ns, 0);
const BUDGET_MS = 16.6;
const DRAWS = 24000; // 대표값: 이 지점에서 프레임 합이 16.6ms 예산을 넘는다(CPU 병목).

export default function DrawCostBreakdown() {
  const frameMs = (PER_DRAW_NS * DRAWS) / 1e6;

  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;
    const pad = 12;

    // ---- 위: per-draw 분해 막대(한 Draw = PER_DRAW_NS) ----
    label(ctx, pad, 14, `한 번의 Draw ≈ ${PER_DRAW_NS} ns (user CPU)`, theme.text, 13, 'bold');
    const barY = 26;
    const barH = 30;
    const barX = pad;
    const barW = w - pad * 2;
    const ppx = barW / PER_DRAW_NS;
    let x = barX;
    CATS.forEach((c) => {
      const segW = c.ns * ppx;
      roundRect(ctx, x, barY, Math.max(1, segW - 1), barH, 3);
      ctx.fillStyle = withAlpha(c.c, 0.85);
      ctx.fill();
      if (segW > 38) {
        label(ctx, x + segW / 2, barY + barH / 2, `${c.ns}`, '#fff', 12, 'bold');
      }
      x += segW;
    });

    // 범례(per-draw 색) — 세로로 쌓아 좁은 화면에서 넘치지 않게
    const legY = barY + barH + 18;
    let lx = barX;
    let lyCur = legY;
    ctx.font = monoFont(12);
    CATS.forEach((c) => {
      const need = 18 + ctx.measureText(c.key).width + 16;
      if (lx + need > w - pad) {
        lx = barX;
        lyCur += 18;
      }
      roundRect(ctx, lx, lyCur - 8, 13, 13, 3);
      ctx.fillStyle = withAlpha(c.c, 0.85);
      ctx.fill();
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.key, lx + 18, lyCur - 1);
      ctx.textBaseline = 'alphabetic';
      lx += need;
    });

    // ---- 아래: 프레임 합 vs 예산 ----
    const fY = lyCur + 30;
    label(ctx, pad, fY - 2, `프레임당 ${(DRAWS / 1000).toFixed(0)}k draws`, theme.muted, 12, 'bold');
    const fBarY = fY + 10;
    const fBarH = 30;
    const fBarX = pad;
    const fBarMaxW = w - pad * 2 - 56;
    const scaleMs = Math.max(frameMs, BUDGET_MS) * 1.08;
    const msToPx = fBarMaxW / scaleMs;

    // 누적 색(범주별)
    let fx = fBarX;
    CATS.forEach((c) => {
      const segMs = (c.ns * DRAWS) / 1e6;
      const segW = segMs * msToPx;
      if (segW < 0.5) return;
      roundRect(ctx, fx, fBarY, Math.max(1, segW - 1), fBarH, 3);
      ctx.fillStyle = withAlpha(c.c, 0.85);
      ctx.fill();
      fx += segW;
    });
    // 총합 라벨
    ctx.font = monoFont(13, 'bold');
    ctx.fillStyle = frameMs > BUDGET_MS ? COLORS.submit : theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${frameMs.toFixed(1)}ms`, fBarX + frameMs * msToPx + 6, fBarY + fBarH / 2);
    ctx.textBaseline = 'alphabetic';

    // 예산선
    const bx = fBarX + BUDGET_MS * msToPx;
    ctx.strokeStyle = COLORS.submit;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx, fBarY - 10);
    ctx.lineTo(bx, fBarY + fBarH + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, bx, fBarY - 18, '16.6ms (60fps)', COLORS.submit, 12, 'bold');
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ width: '100%', maxWidth: 400, height: 200, display: 'block' }}
      />
      <figcaption>
        위 막대는 <strong>한 번의 Draw</strong>가 user 모드에서 쓰는 CPU 시간을 범주로 쪼갠 것입니다(도식용
        대표 차수 — 절대값이 아니라 구성비가 요점). <span style={{ color: COLORS.validate }}>검증</span>은
        runtime이 인자·바인딩이 유효한지 보는 비용, <span style={{ color: COLORS.state }}>상태·hazard</span>는
        드라이버가 매 draw마다 바인딩을 검사하고 위험(같은 리소스를 쓰며 읽기 등)을 추적하는 비용,{' '}
        <span style={{ color: COLORS.descriptor }}>디스크립터 패치</span>는 바인딩을 그 하드웨어의 디스크립터
        형식으로 변환하는 비용, <span style={{ color: COLORS.umd }}>기록</span>은 변환된 명령을 command
        buffer에 적는 비용입니다. 이 합이 한 draw의 user CPU 총비용입니다. 아래 막대는 이 비용을 프레임당{' '}
        <strong>{(DRAWS / 1000).toFixed(0)}k draws</strong>에 곱한 합으로, 이미{' '}
        <span style={{ color: COLORS.submit }}>16.6ms 예산</span>을 넘습니다 — GPU가 놀고 있는데도 CPU가
        병목이 되는 지점입니다. 4편·5편은 바로 이 윗줄 범주들을 어떻게 깎아 내는지를 다룹니다.
      </figcaption>
    </figure>
  );
}
