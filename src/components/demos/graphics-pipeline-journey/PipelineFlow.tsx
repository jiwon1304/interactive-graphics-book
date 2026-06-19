import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, roundRect, withAlpha, monoFont, centerText, drawArrow } from './gpj2d';

// ---------------------------------------------------------------------------
// 정적 도식: 삼각형이 통과하는 파이프라인 단계 사슬.
//   IA → VS → PA → 클립/컬 → ÷w → 뷰포트 → 셋업 → 래스터 → early-Z → PS → ROP
// 세 영역으로 색을 묶는다: 지오메트리(파랑) · 래스터(보라) · 프래그먼트(주황).
// 캔버스 안 글자는 짧은 단계명만. 설명은 전부 figcaption.
// ---------------------------------------------------------------------------

const CANVAS_H = 360;

type Domain = 'geo' | 'raster' | 'frag';

interface Stage {
  short: string;
  domain: Domain;
}

const STAGES: Stage[] = [
  { short: 'IA', domain: 'geo' },
  { short: 'VS', domain: 'geo' },
  { short: 'PA', domain: 'geo' },
  { short: '클립·컬', domain: 'geo' },
  { short: '÷w', domain: 'geo' },
  { short: '뷰포트', domain: 'geo' },
  { short: '셋업', domain: 'raster' },
  { short: '래스터', domain: 'raster' },
  { short: 'early-Z', domain: 'raster' },
  { short: 'PS', domain: 'frag' },
  { short: 'ROP', domain: 'frag' },
];

const DOMAIN_COLOR: Record<Domain, string> = {
  geo: COLORS.vA,
  raster: COLORS.clip,
  frag: COLORS.depth,
};

export default function PipelineFlow() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const pad = 16;
    // 두 행으로 뱀처럼(boustrophedon) 배치: 좁은 화면에서도 박스가 안 깨지게.
    const perRow = Math.ceil(STAGES.length / 2);
    const gapX = 10;
    const usableW = w - 2 * pad;
    const boxW = (usableW - (perRow - 1) * gapX) / perRow;
    const boxH = 40;
    const rowGap = 64;
    const topY = 70;

    const centers: { x: number; y: number }[] = [];

    for (let i = 0; i < STAGES.length; i++) {
      const row = Math.floor(i / perRow);
      let col = i % perRow;
      // 둘째 행은 오른쪽→왼쪽으로 흐르게(뱀)
      if (row === 1) col = perRow - 1 - col;
      const x = pad + col * (boxW + gapX);
      const y = topY + row * rowGap;
      centers.push({ x: x + boxW / 2, y: y + boxH / 2 });

      const s = STAGES[i];
      const c = DOMAIN_COLOR[s.domain];
      roundRect(ctx, x, y, boxW, boxH, 8);
      ctx.fillStyle = withAlpha(c, 0.16);
      ctx.fill();
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      centerText(ctx, s.short, x + boxW / 2, y + boxH / 2, theme.text, monoFont(13));
    }

    // 단계 사이 화살표(진행 순서대로)
    for (let i = 0; i < centers.length - 1; i++) {
      const a = centers[i];
      const b = centers[i + 1];
      const sameRow = Math.abs(a.y - b.y) < 1;
      if (sameRow) {
        const dir = b.x > a.x ? 1 : -1;
        drawArrow(
          ctx,
          a.x + dir * (boxW / 2 + 1),
          a.y,
          b.x - dir * (boxW / 2 + 1),
          b.y,
          theme.muted,
          { width: 1.4, head: 6 },
        );
      } else {
        // 행 바뀜: 아래로 꺾어 내려가는 연결(같은 열에서 다음 행으로)
        drawArrow(ctx, a.x, a.y + boxH / 2 + 1, b.x, b.y - boxH / 2 - 1, theme.muted, {
          width: 1.4,
          head: 6,
          dashed: true,
        });
      }
    }

    // 영역 범례(상단)
    const legend: { label: string; c: string }[] = [
      { label: '지오메트리 (정점 단위)', c: DOMAIN_COLOR.geo },
      { label: '래스터 (삼각형→픽셀)', c: DOMAIN_COLOR.raster },
      { label: '프래그먼트 (픽셀 단위)', c: DOMAIN_COLOR.frag },
    ];
    let lx = pad;
    const ly = 30;
    ctx.font = monoFont(11);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const item of legend) {
      roundRect(ctx, lx, ly - 7, 14, 14, 3);
      ctx.fillStyle = withAlpha(item.c, 0.3);
      ctx.fill();
      ctx.strokeStyle = item.c;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = theme.muted;
      ctx.fillText(item.label, lx + 20, ly);
      lx += 20 + ctx.measureText(item.label).width + 18;
    }

    // 입력/출력 캡션 라벨
    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.fillText('정점 버퍼 →', pad, topY - 12);
    ctx.textAlign = 'right';
    const lastRow = Math.floor((STAGES.length - 1) / perRow);
    ctx.fillText('→ 프레임버퍼', w - pad, topY + lastRow * rowGap + boxH + 22);

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
        삼각형 하나가 <strong>정점 버퍼</strong>에서 출발해 <strong>프레임버퍼</strong>의 픽셀로
        끝나기까지 거치는 고정 함수 + 프로그램 가능 단계의 사슬입니다. 크게 세 영역으로 나뉩니다.
        <strong style={{ color: 'var(--accent)' }}> 지오메트리 영역</strong>(파랑)은 아직 “정점”을
        다룹니다: <strong>IA</strong>(입력 어셈블리, 인덱스로 정점을 모음) → <strong>VS</strong>(정점
        셰이더, 정점을 클립 공간으로) → <strong>PA</strong>(프리미티브 어셈블리, 정점 3개를 삼각형으로
        묶음) → <strong>클립·컬</strong>(화면 밖·뒷면 제거) → <strong>÷w</strong>(원근 분할로 NDC로) →{' '}
        <strong>뷰포트</strong>(픽셀 좌표로). 여기서부터{' '}
        <strong style={{ color: '#a855f7' }}>래스터 영역</strong>(보라)이 삼각형을 픽셀 격자로 바꿉니다:{' '}
        <strong>셋업</strong>(에지 함수 계수 계산) → <strong>래스터</strong>(어떤 픽셀이 덮였나) →{' '}
        <strong>early-Z</strong>(보이지도 않을 픽셀을 셰이딩 전에 버림). 마지막{' '}
        <strong style={{ color: '#f97316' }}>프래그먼트 영역</strong>(주황)은 살아남은 픽셀 하나하나를
        다룹니다: <strong>PS</strong>(픽셀 셰이더, 색 계산) → <strong>ROP</strong>(깊이 테스트·블렌딩·
        프레임버퍼 쓰기). 이 챕터는 이 사슬을 <em>한 단계씩</em> 따라갑니다. 점선 화살표는 행이 바뀌는
        지점(흐름은 위 행을 왼→오, 아래 행을 오→왼으로 읽으세요).
      </figcaption>
    </figure>
  );
}
