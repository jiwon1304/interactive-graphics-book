import { useRef, useState } from 'react';
import { ControlPanel, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import {
  v2,
  add,
  sub,
  len,
  clipPolygon,
  COLORS,
  withAlpha,
  monoFont,
  pointerToCanvas,
  vertexHandle,
  type Vec2,
  type HalfPlane,
} from './gpj2d';

// ---------------------------------------------------------------------------
// 인터랙티브: Sutherland–Hodgman 클리핑.
//
// 클립 공간의 가시 영역은 6개 반평면(좌·우·상·하·근·원)의 교집합인 볼록 박스다.
// 여기선 화면 사각형(가드밴드/뷰포트)을 그 박스의 2D 단면으로 삼고, 삼각형을
// 네 변(좌우상하)에 차례로 통과시킨다. 각 변을 지날 때마다 바깥 부분이 잘려
// 다각형의 꼭짓점 수가 변한다(삼각형 → 사각형 → 오각형 …).
// "과정": 클리핑이 *변마다 한 번씩 잘라 나가는* 알고리즘임을 직접 끌고 다니며 본다.
// ---------------------------------------------------------------------------

const CANVAS_H = 420;

export default function Clipping() {
  const [a, setA] = useState<Vec2>(v2(120, 110));
  const [b, setB] = useState<Vec2>(v2(360, 180));
  const [c, setC] = useState<Vec2>(v2(200, 330));
  const [showHandles, setShowHandles] = useState(true);
  const dragRef = useRef<'A' | 'B' | 'C' | 'T' | null>(null);
  const lastPtr = useRef<Vec2>(v2(0, 0));

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    // 클립 사각형(가시 영역) — 캔버스 안쪽 여백
    const m = 70;
    const L = m;
    const R = w - m;
    const T = m;
    const B = h - m;

    // 네 반평면(안쪽이 f≥0): 좌·우·상·하
    const planes: { f: HalfPlane; name: string }[] = [
      { f: (p) => p.x - L, name: 'x ≥ −w' },
      { f: (p) => R - p.x, name: 'x ≤ +w' },
      { f: (p) => p.y - T, name: 'y ≥ −w' },
      { f: (p) => B - p.y, name: 'y ≤ +w' },
    ];

    // 바깥 영역 음영(가시 영역 밖)
    ctx.fillStyle = withAlpha(theme.muted, 0.1);
    ctx.fillRect(0, 0, w, T);
    ctx.fillRect(0, B, w, h - B);
    ctx.fillRect(0, T, L, B - T);
    ctx.fillRect(R, T, w - R, B - T);

    // 원본 삼각형(점선)
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.strokeStyle = withAlpha(theme.text, 0.45);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Sutherland–Hodgman: 네 변에 차례로 클리핑
    let poly: Vec2[] = [a, b, c];
    for (const pl of planes) {
      poly = clipPolygon(poly, pl.f);
      if (poly.length === 0) break;
    }

    // 클리핑된 다각형(채움)
    if (poly.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      ctx.fillStyle = withAlpha(COLORS.pass, 0.32);
      ctx.fill();
      ctx.strokeStyle = COLORS.pass;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 클리핑으로 *새로 생긴* 꼭짓점(원래 정점이 아닌 것)을 작은 보라 점으로
      const isOriginal = (p: Vec2) =>
        len(sub(p, a)) < 2 || len(sub(p, b)) < 2 || len(sub(p, c)) < 2;
      for (const p of poly) {
        if (!isOriginal(p)) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.clip;
          ctx.fill();
        }
      }
    }

    // 클립 사각형 외곽
    ctx.strokeStyle = COLORS.clip;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(L, T, R - L, B - T);
    ctx.font = monoFont(12);
    ctx.fillStyle = COLORS.clip;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('가시 영역 (클립 박스)', L + 4, T - 4);

    // 정점 핸들
    if (showHandles) {
      vertexHandle(ctx, a, COLORS.vA, 'A', theme.text);
      vertexHandle(ctx, b, COLORS.vB, 'B', theme.text);
      vertexHandle(ctx, c, COLORS.vC, 'C', theme.text);
    }

    // 꼭짓점 수 표시
    ctx.font = `bold ${monoFont(12)}`;
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const nv = poly.length;
    ctx.fillText(nv === 0 ? '완전히 밖 → 버림' : `클립 결과: ${nv}각형`, w - 10, 10);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, [a, b, c, showHandles]);

  const pick = (e: PointerEvent, canvas: HTMLCanvasElement): 'A' | 'B' | 'C' | 'T' | null => {
    const p = pointerToCanvas(e, canvas);
    if (showHandles) {
      const dA = len(sub(p, a));
      const dB = len(sub(p, b));
      const dC = len(sub(p, c));
      const m = Math.min(dA, dB, dC);
      if (m <= 24) return m === dA ? 'A' : m === dB ? 'B' : 'C';
    }
    // 핸들 밖을 누르면 삼각형 전체를 이동
    lastPtr.current = p;
    return 'T';
  };

  usePointerDrag(ref, {
    onDown: (e, canvas) => {
      dragRef.current = pick(e, canvas);
    },
    onMove: (e, canvas) => {
      if (!dragRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const p = pointerToCanvas(e, canvas);
      const clamp = (q: Vec2): Vec2 =>
        v2(Math.max(-200, Math.min(rect.width + 200, q.x)), Math.max(-200, Math.min(rect.height + 200, q.y)));
      if (dragRef.current === 'T') {
        const dl = sub(p, lastPtr.current);
        lastPtr.current = p;
        setA((s) => clamp(add(s, dl)));
        setB((s) => clamp(add(s, dl)));
        setC((s) => clamp(add(s, dl)));
      } else {
        const cl = clamp(p);
        if (dragRef.current === 'A') setA(cl);
        else if (dragRef.current === 'B') setB(cl);
        else setC(cl);
      }
    },
    onUp: () => {
      dragRef.current = null;
    },
  });

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block', cursor: 'grab' }}
      />
      <ControlPanel>
        <ToggleControl label="정점 핸들 보기" checked={showHandles} onChange={setShowHandles} />
      </ControlPanel>
      <figcaption>
        화면 밖으로 비어져 나간 삼각형은 그냥 둘 수 없습니다 — 음수 깊이나 화면 밖 좌표는 래스터라이저를
        망가뜨리니까요. 그래서 가시 영역(여기선 <span style={{ color: '#a855f7' }}>보라 사각형</span>,
        실제로는 클립 공간의 6면 박스) 밖 부분을 잘라 냅니다. <strong>Sutherland–Hodgman</strong> 알고리즘은
        경계 <em>한 변씩</em> 처리합니다: 다각형의 모든 변을 돌며 “안→밖”이면 교점을, “밖→안”이면 교점과
        끝점을 새 다각형에 넣습니다. 잘릴 때마다 <strong style={{ color: '#a855f7' }}>새 꼭짓점</strong>(보라
        점)이 생겨서, 결과는 삼각형이 아니라 사각형·오각형이 될 수 있습니다(그래서 GPU는 클립 후 다시
        삼각형으로 쪼갭니다).
        <br />
        <strong>직접 해보세요:</strong> 빈 공간을 잡아 삼각형을 경계 밖으로 끌어 보세요(정점 하나만
        끌려면 핸들을 잡으세요). 한 변을 넘으면 모서리가 잘려 <em>사각형</em>이 되고, 두 변(모서리)을
        넘으면 <em>오각형</em>이 됩니다. 완전히 밖으로 내보내면 다각형이 사라지며 “버림”으로 컬링됩니다.
        오른쪽 위 카운터에서 꼭짓점 수가 변하는 걸 보세요.
      </figcaption>
    </figure>
  );
}
