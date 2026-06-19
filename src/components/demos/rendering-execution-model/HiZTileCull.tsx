import { useMemo, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, monoFont } from './re2d';

// Hi-Z(계층적 깊이 컬링): 각 타일은 그동안 그려진 깊이의 [zMin, zMax] 범위를 들고 있다.
// 깊이가 zTri인 (평평한) 삼각형이 들어오면, 타일을 픽셀 단위로 보지 않고 *범위만*으로:
//   zTri > zMax  → 모두보다 뒤 → 기각(reject)        (빨강)
//   zTri < zMin  → 모두보다 앞 → 통과(pass)          (초록)
//   그 사이      → 모호 → 픽셀별 테스트 필요(needs-test) (보라)
// 깊이 규약: 값이 클수록 멀다(0=가까움, 1=멈).

const COLS = 6;
const ROWS = 4;

// 잘 고른 고정 깊이 지형: 타일마다 [zMin, zMax]. 왼쪽 위는 가까운 물체,
// 오른쪽 아래로 갈수록 먼 배경 + 일부 타일은 범위가 넓음(가까운 난간 + 먼 하늘).
function tileRange(col: number, row: number): { zMin: number; zMax: number } {
  // 거리장: 대각선으로 멀어짐 + 약간의 굴곡.
  const base = 0.18 + 0.62 * ((col / (COLS - 1)) * 0.5 + (row / (ROWS - 1)) * 0.5);
  const wobble = 0.05 * Math.sin(col * 1.3 + row * 0.7);
  const zMin = Math.max(0.02, base + wobble - 0.08);
  // 몇몇 타일은 가까운 것과 먼 것이 같이 있어 범위가 넓다(실루엣 가장자리).
  const wide = (col + row) % 3 === 0 ? 0.34 : 0.12;
  const zMax = Math.min(0.99, zMin + wide);
  return { zMin, zMax };
}

type Verdict = 'reject' | 'pass' | 'test';
function classify(zTri: number, zMin: number, zMax: number): Verdict {
  if (zTri > zMax) return 'reject'; // 타일 전부보다 뒤
  if (zTri < zMin) return 'pass'; // 타일 전부보다 앞
  return 'test'; // 범위 안 → 모호
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

export default function HiZTileCull() {
  const [zTri, setZTri] = useState(0.5);

  const tiles = useMemo(() => {
    const out: Array<{ col: number; row: number; zMin: number; zMax: number }> = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) out.push({ col: c, row: r, ...tileRange(c, r) });
    return out;
  }, []);

  const counts = useMemo(() => {
    const acc = { reject: 0, pass: 0, test: 0 };
    for (const t of tiles) acc[classify(zTri, t.zMin, t.zMax)]++;
    return acc;
  }, [tiles, zTri]);

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const padX = 12;
    const top = 10;
    const legendH = 22;
    const gridW = w - padX * 2;
    const gridH = h - top - legendH - 8;
    const tw = gridW / COLS;
    const th = gridH / ROWS;

    for (const t of tiles) {
      const v = classify(zTri, t.zMin, t.zMax);
      const col = verdictColor[v];
      const x = padX + t.col * tw;
      const y = top + t.row * th;
      ctx.fillStyle = withAlpha(col, 0.18);
      ctx.fillRect(x, y, tw - 2, th - 2);
      ctx.strokeStyle = withAlpha(col, 0.9);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, tw - 3, th - 3);

      // 타일 안 범위 막대([zMin,zMax])를 작은 세로 게이지로(짧은 시각 라벨).
      const gx = x + 7;
      const gh = th - 16;
      const gy = y + 8;
      ctx.fillStyle = withAlpha(theme.text, 0.12);
      ctx.fillRect(gx, gy, 5, gh);
      const y0 = gy + t.zMin * gh;
      const y1 = gy + t.zMax * gh;
      ctx.fillStyle = withAlpha(col, 0.95);
      ctx.fillRect(gx, y0, 5, Math.max(2, y1 - y0));

      // zTri 마커(가로 점선): 타일 내부 게이지에서의 위치.
      const ym = gy + Math.max(0, Math.min(1, zTri)) * gh;
      ctx.strokeStyle = theme.text;
      ctx.setLineDash([3, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx - 2, ym);
      ctx.lineTo(gx + 9, ym);
      ctx.stroke();
      ctx.setLineDash([]);

      // 짧은 판정 라벨
      ctx.font = monoFont(Math.min(11, th * 0.16), 'bold');
      ctx.fillStyle = col;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(verdictLabel[v], x + tw - 6, y + 5);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    // 범례(짧게)
    const ly = h - legendH + 4;
    ctx.font = monoFont(11);
    let lx = padX;
    const items: Array<[Verdict, string]> = [
      ['pass', '통과(전부 앞)'],
      ['reject', '기각(전부 뒤)'],
      ['test', '픽셀 테스트(모호)'],
    ];
    for (const [v, txt] of items) {
      ctx.fillStyle = verdictColor[v];
      ctx.fillRect(lx, ly, 11, 11);
      ctx.fillStyle = theme.muted;
      ctx.textBaseline = 'top';
      ctx.fillText(`${txt}`, lx + 15, ly);
      lx += ctx.measureText(txt).width + 40;
    }
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, [zTri]);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 320, display: 'block' }} />
      <ControlPanel>
        <Slider
          label="삼각형 깊이 z"
          value={zTri}
          min={0}
          max={1}
          step={0.01}
          onChange={setZTri}
          format={(v) => `${v.toFixed(2)} (0=가까움)`}
        />
      </ControlPanel>
      <figcaption>
        래스터라이저는 픽셀을 하나씩 깊이 테스트하기 <em>전에</em>, 화면을 타일로 나눠 각 타일이 들고
        있는 깊이 범위 <strong>[zMin, zMax]</strong>(이미 그려진 것 중 가장 가까운·가장 먼 깊이)만으로
        삼각형을 통째로 거를 수 있습니다 — 이것이 <strong>Hi-Z(계층적 깊이)</strong>입니다. 들어오는
        삼각형 깊이 z가 타일의 모든 것보다 <span style={{ color: COLORS.reject }}>뒤(z &gt; zMax)면
        기각</span>, <span style={{ color: COLORS.pass }}>앞(z &lt; zMin)이면 통과</span>, 범위 안에
        걸치면 <span style={{ color: COLORS.maybe }}>모호 → 픽셀별 테스트</span>로 떨어집니다. 각 타일
        안 작은 게이지가 그 범위, 점선이 삼각형 z입니다.{' '}
        <strong>슬라이더를 움직여 보세요:</strong> z를 키우면(멀어지면) 점점 많은 타일이 빨강(기각)으로
        바뀌어, 픽셀 셰이더는커녕 픽셀 깊이 테스트조차 건너뜁니다. 지금{' '}
        <strong style={{ color: COLORS.pass }}>{counts.pass} 통과</strong> ·{' '}
        <strong style={{ color: COLORS.reject }}>{counts.reject} 기각</strong> ·{' '}
        <strong style={{ color: COLORS.maybe }}>{counts.test} 테스트</strong>. 보라 타일만 비싼 정밀
        테스트로 넘어가니, 컬링은 "한 번의 비교로 한 타일 전체를 면제"하는 장사입니다.
      </figcaption>
    </figure>
  );
}
