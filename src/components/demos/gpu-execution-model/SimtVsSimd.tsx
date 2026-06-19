import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, roundRect, withAlpha, monoFont, centerText } from './gem2d';

// ---------------------------------------------------------------------------
// 정적 도식: SIMT vs SIMD — 분기(branch)에서 마스크를 누가 관리하나.
//
// 같은 8-레인 벡터가 if(x>0) 분기를 만났다. 절반은 조건 참(then), 절반은 거짓(else).
//  - SIMD 패널: 프로그래머가 손으로 마스크 레지스터를 만들고, then/else를
//    blend/select로 직접 합쳐야 한다. (명시적, 수동)
//  - SIMT 패널: 하드웨어가 레인마다 predicate 비트를 들고, then 실행 땐 거짓 레인을
//    자동으로 "꺼두고", else 실행 땐 반대로 끈다. (자동, per-lane mask)
//
// 캔버스 글자 최소: 패널 제목 + 레인 활성/마스크 색 + 짧은 코드 1~2줄.
// 핵심 등식 "SIMT = SIMD HW + per-lane predicate mask"는 figcaption.
// ---------------------------------------------------------------------------

const CANVAS_H = 360;
const LANES = 8;
// 대표 마스크: 레인별 (x>0) 결과 — then에서 활성인 레인들
const THEN_MASK = [true, true, false, true, false, false, true, false];

export default function SimtVsSimd() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const pad = 12;
    const gap = 14;
    const panelW = (w - 2 * pad - gap) / 2;
    const panelH = h - 2 * pad;
    const panelY = pad;

    const drawLaneRow = (
      px: number,
      y: number,
      activeMask: boolean[],
    ): void => {
      const n = LANES;
      const lgap = 3;
      const innerPad = 10;
      const avail = panelW - 2 * innerPad;
      const cw = (avail - (n - 1) * lgap) / n;
      const ch = 20;
      for (let i = 0; i < n; i++) {
        const lx = px + innerPad + i * (cw + lgap);
        const on = activeMask[i];
        roundRect(ctx, lx, y, cw, ch, 3);
        ctx.fillStyle = withAlpha(on ? COLORS.active : COLORS.masked, on ? 0.32 : 0.14);
        ctx.fill();
        ctx.strokeStyle = withAlpha(on ? COLORS.active : COLORS.masked, on ? 0.95 : 0.55);
        ctx.lineWidth = 1.1;
        ctx.stroke();
        // 마스크 off면 X 표시(꺼진 레인), on이면 비움
        if (!on) {
          ctx.strokeStyle = withAlpha(COLORS.masked, 0.7);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lx + 3, y + 3);
          ctx.lineTo(lx + cw - 3, y + ch - 3);
          ctx.moveTo(lx + cw - 3, y + 3);
          ctx.lineTo(lx + 3, y + ch - 3);
          ctx.stroke();
        }
      }
    };

    const elseMask = THEN_MASK.map((v) => !v);

    const drawPanel = (
      px: number,
      title: string,
      codeLines: string[],
      accent: string,
    ): void => {
      // 패널 외곽
      roundRect(ctx, px, panelY, panelW, panelH, 10);
      ctx.fillStyle = withAlpha(theme.border, 0.18);
      ctx.fill();
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1.3;
      ctx.stroke();

      // 제목 칩
      const titleH = 24;
      roundRect(ctx, px + 10, panelY + 10, panelW - 20, titleH, 6);
      ctx.fillStyle = withAlpha(accent, 0.18);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      centerText(ctx, title, px + panelW / 2, panelY + 10 + titleH / 2, theme.text, monoFont(13));

      let y = panelY + 10 + titleH + 18;

      // then 라벨 + 레인 행
      ctx.font = monoFont(10);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('then  (x > 0)', px + 10, y - 4);
      drawLaneRow(px, y, THEN_MASK);
      y += 20 + 22;

      // else 라벨 + 레인 행
      ctx.fillStyle = theme.muted;
      ctx.fillText('else  (x ≤ 0)', px + 10, y - 4);
      drawLaneRow(px, y, elseMask);
      y += 20 + 22;

      // 코드 박스(마스크를 누가 만드나)
      const codeH = 18 * codeLines.length + 12;
      roundRect(ctx, px + 10, y, panelW - 20, codeH, 6);
      ctx.fillStyle = withAlpha(theme.text, 0.05);
      ctx.fill();
      ctx.strokeStyle = withAlpha(theme.text, 0.2);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = monoFont(10.5);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      codeLines.forEach((line, i) => {
        ctx.fillText(line, px + 18, y + 12 + i * 18);
      });
      ctx.textBaseline = 'alphabetic';
    };

    // 왼쪽: SIMD — 수동 마스크
    drawPanel(
      pad,
      'SIMD (수동 마스크)',
      ['m = cmp_gt(x, 0)', 'a = then(...)', 'b = else(...)', 'r = blend(m, a, b)'],
      COLORS.int,
    );
    // 오른쪽: SIMT — HW per-lane predicate
    drawPanel(
      pad + panelW + gap,
      'SIMT (HW predicate)',
      ['if (x > 0)', '  // HW가 거짓 레인 OFF', 'else', '  // HW가 참 레인 OFF'],
      COLORS.fp32,
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
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block' }}
      />
      <figcaption>
        분기(<code>if</code>)를 만나면 락스텝의 약점이 드러납니다. 한 워프 안에서 일부 레인은 조건이
        참, 일부는 거짓 — 하지만 모두가 <em>같은 명령</em>을 받아야 합니다. 해법은 둘 다{' '}
        <strong>마스킹</strong>이지만, <em>누가 마스크를 관리하느냐</em>가 다릅니다.{' '}
        <strong>SIMD</strong>(CPU의 AVX 등)에서는 프로그래머가 직접 비교로 마스크 레지스터를 만들고,
        then 결과와 else 결과를 따로 계산한 뒤 <code>blend</code>로 손수 합쳐야 합니다(녹색=활성,
        빨강 X=마스크된 레인). <strong>SIMT</strong>(GPU)에서는 그냥 <code>if/else</code>를 쓰면 됩니다 —{' '}
        <strong>하드웨어가 레인마다 predicate 비트</strong>를 들고, then을 실행할 땐 조건이 거짓인 레인을
        자동으로 꺼두고, else를 실행할 땐 반대로 끕니다. 한 줄로 요약하면{' '}
        <strong>SIMT = SIMD 하드웨어 + 하드웨어가 관리하는 per-lane predicate mask</strong>입니다. 편하지만
        공짜는 아닙니다: then과 else <em>양쪽 모두</em>를 워프가 차례로 실행하되 매번 절반이 꺼져 있으니,
        분기가 갈리면 처리량이 깎입니다. 이게 다음 절의 <strong>워프 다이버전스(divergence)</strong>입니다.
      </figcaption>
    </figure>
  );
}
