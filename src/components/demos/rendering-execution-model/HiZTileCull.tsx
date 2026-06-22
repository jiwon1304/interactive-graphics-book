import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, monoFont } from './re2d';

// Hi-Z(계층적 깊이 컬링) (정적): 각 타일은 그동안 그려진 깊이의 [zMin, zMax] 범위를 들고 있다.
// 깊이 zTri인 (평평한) 삼각형이 들어오면 타일을 픽셀 단위로 보지 않고 범위만으로:
//   zTri > zMax → 기각(reject, 빨강) · zTri < zMin → 통과(pass, 초록) · 그 사이 → 픽셀 테스트(보라).
// 대표 상태는 zTri=0.5 — 통과·기각·테스트가 고루 섞인 한 컷. (깊이: 클수록 멀다)

const COLS = 6;
const ROWS = 4;
const Z_TRI = 0.5;

function tileRange(col: number, row: number): { zMin: number; zMax: number } {
  const base = 0.18 + 0.62 * ((col / (COLS - 1)) * 0.5 + (row / (ROWS - 1)) * 0.5);
  const wobble = 0.05 * Math.sin(col * 1.3 + row * 0.7);
  const zMin = Math.max(0.02, base + wobble - 0.08);
  const wide = (col + row) % 3 === 0 ? 0.34 : 0.12;
  const zMax = Math.min(0.99, zMin + wide);
  return { zMin, zMax };
}

type Verdict = 'reject' | 'pass' | 'test';
function classify(zTri: number, zMin: number, zMax: number): Verdict {
  if (zTri > zMax) return 'reject';
  if (zTri < zMin) return 'pass';
  return 'test';
}
const verdictColor: Record<Verdict, string> = {
  reject: COLORS.reject,
  pass: COLORS.pass,
  test: COLORS.maybe,
};
const verdictLabel: Record<Verdict, string> = {
  reject: '기각',
  pass: '통과',
  test: '테스트',
};

const TILES = (() => {
  const out: Array<{ col: number; row: number; zMin: number; zMax: number }> = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) out.push({ col: c, row: r, ...tileRange(c, r) });
  return out;
})();

const COUNTS = (() => {
  const acc = { reject: 0, pass: 0, test: 0 };
  for (const t of TILES) acc[classify(Z_TRI, t.zMin, t.zMax)]++;
  return acc;
})();

export default function HiZTileCull() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const padX = 12;
    const top = 10;
    const legendH = 22;
    const gridW = w - padX * 2;
    const gridH = h - top - legendH - 8;
    const tw = gridW / COLS;
    const th = gridH / ROWS;

    for (const t of TILES) {
      const v = classify(Z_TRI, t.zMin, t.zMax);
      const col = verdictColor[v];
      const x = padX + t.col * tw;
      const y = top + t.row * th;
      ctx.fillStyle = withAlpha(col, 0.18);
      ctx.fillRect(x, y, tw - 2, th - 2);
      ctx.strokeStyle = withAlpha(col, 0.9);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, tw - 3, th - 3);

      // 타일 안 범위 막대([zMin,zMax])를 작은 세로 게이지로.
      const gx = x + 7;
      const gh = th - 16;
      const gy = y + 8;
      ctx.fillStyle = withAlpha(theme.text, 0.12);
      ctx.fillRect(gx, gy, 5, gh);
      const y0 = gy + t.zMin * gh;
      const y1 = gy + t.zMax * gh;
      ctx.fillStyle = withAlpha(col, 0.95);
      ctx.fillRect(gx, y0, 5, Math.max(2, y1 - y0));

      // zTri 마커(가로 점선)
      const ym = gy + Math.max(0, Math.min(1, Z_TRI)) * gh;
      ctx.strokeStyle = theme.text;
      ctx.setLineDash([3, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx - 2, ym);
      ctx.lineTo(gx + 9, ym);
      ctx.stroke();
      ctx.setLineDash([]);

      // 짧은 판정 라벨
      ctx.font = monoFont(Math.min(12, th * 0.16), 'bold');
      ctx.fillStyle = col;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(verdictLabel[v], x + tw - 6, y + 5);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    // 범례
    const ly = h - legendH + 4;
    ctx.font = monoFont(11);
    let lx = padX;
    const items: Array<[Verdict, string]> = [
      ['pass', '통과'],
      ['reject', '기각'],
      ['test', '픽셀 테스트'],
    ];
    for (const [v, txt] of items) {
      ctx.fillStyle = verdictColor[v];
      ctx.fillRect(lx, ly, 11, 11);
      ctx.fillStyle = theme.muted;
      ctx.textBaseline = 'top';
      ctx.fillText(txt, lx + 15, ly);
      lx += ctx.measureText(txt).width + 34;
    }
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 300, display: 'block' }} />
      </div>
      <figcaption>
        래스터라이저는 픽셀을 하나씩 깊이 테스트하기 <em>전에</em>, 화면을 타일로 나눠 각 타일이 들고
        있는 깊이 범위 <strong>[zMin, zMax]</strong>(이미 그려진 것 중 가장 가까운·가장 먼 깊이)만으로
        삼각형을 통째로 거를 수 있습니다 — 이것이 <strong>Hi-Z(계층적 깊이)</strong>입니다. 여기 그린
        삼각형은 깊이 z = <strong>{Z_TRI}</strong>입니다. 타일의 모든 것보다{' '}
        <span style={{ color: COLORS.reject }}>뒤(z &gt; zMax)면 기각</span>,{' '}
        <span style={{ color: COLORS.pass }}>앞(z &lt; zMin)이면 통과</span>, 범위 안에 걸치면{' '}
        <span style={{ color: COLORS.maybe }}>모호 → 픽셀별 테스트</span>로 떨어집니다. 각 타일 안 작은
        게이지가 그 범위, 점선이 삼각형 z입니다. 지금{' '}
        <strong style={{ color: COLORS.pass }}>{COUNTS.pass} 통과</strong> ·{' '}
        <strong style={{ color: COLORS.reject }}>{COUNTS.reject} 기각</strong> ·{' '}
        <strong style={{ color: COLORS.maybe }}>{COUNTS.test} 테스트</strong>. z가 커질수록(멀어질수록)
        점점 많은 타일이 기각으로 바뀌어 픽셀 깊이 테스트조차 건너뜁니다 — 컬링은 "한 번의 비교로 한
        타일 전체를 면제"하는 장사입니다.
      </figcaption>
    </figure>
  );
}
