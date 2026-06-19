import { useRef, useState } from 'react';
import { ControlPanel, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import {
  v2,
  add,
  sub,
  scale,
  len,
  signedArea2,
  COLORS,
  withAlpha,
  monoFont,
  drawArrow,
  pointerToCanvas,
  vertexHandle,
  type Vec2,
} from './gpj2d';

// ---------------------------------------------------------------------------
// 인터랙티브: 부호 있는 면적 → 와인딩 → 정면/후면.
//
//   2·Area(A,B,C) = E_AB(C) = (C.x−A.x)(B.y−A.y) − (C.y−A.y)(B.x−A.x)
//
// 이 부호가 화면상 회전 방향(시계/반시계)을 가른다. 한 정점을 반대편으로 드래그해
// A→B→C 순회가 뒤집히면 부호가 0을 지나 반대로 바뀌고, 컬링 규칙에 따라 삼각형이
// "후면"으로 판정되어 버려진다(여기선 빨강으로 표시).
// "과정": 백페이스 컬링이 *어떤 스칼라의 부호 하나로* 결정되는지를 직접 본다.
// ---------------------------------------------------------------------------

const CANVAS_H = 420;

export default function BackfaceCulling() {
  const [a, setA] = useState<Vec2>(v2(110, 130));
  const [b, setB] = useState<Vec2>(v2(320, 130));
  const [c, setC] = useState<Vec2>(v2(215, 300));
  // 정면으로 칠 와인딩: true면 CW(부호>0)를 정면으로 본다(캔버스 y-down 기준).
  const [frontIsCW, setFrontIsCW] = useState(true);
  const dragRef = useRef<'A' | 'B' | 'C' | null>(null);

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const area2 = signedArea2(a, b, c); // = edge(a,b,c)
    const cw = area2 > 0; // 캔버스 y-down: 양수 = 화면상 시계방향
    const isFront = cw === frontIsCW;
    const faceColor = isFront ? COLORS.front : COLORS.back;

    // 삼각형 채움
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fillStyle = withAlpha(faceColor, isFront ? 0.3 : 0.16);
    ctx.fill();
    ctx.strokeStyle = faceColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 후면이면 "기각" 빗금
    if (!isFront) {
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = withAlpha(COLORS.fail, 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = -h; x < w; x += 12) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 순회 방향 화살표 A→B→C→A (와인딩을 눈으로)
    const verts = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const u = verts[i];
      const vv = verts[(i + 1) % 3];
      // 화살표를 약간 안쪽으로 들여서 정점과 안 겹치게
      const p0 = add(u, scale(sub(vv, u), 0.18));
      const p1 = add(u, scale(sub(vv, u), 0.82));
      drawArrow(ctx, p0.x, p0.y, p1.x, p1.y, withAlpha(theme.text, 0.7), {
        width: 1.6,
        head: 9,
      });
    }

    // 정점 핸들
    vertexHandle(ctx, a, COLORS.vA, 'A', theme.text);
    vertexHandle(ctx, b, COLORS.vB, 'B', theme.text);
    vertexHandle(ctx, c, COLORS.vC, 'C', theme.text);

    // 상태 패널(좌상단): 부호 있는 면적 + 와인딩 + 판정
    const panelW = 176;
    const panelH = 70;
    const ppx = 12;
    const ppy = 12;
    ctx.fillStyle = withAlpha(theme.bg, 0.86);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(ppx, ppy, panelW, panelH);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.fillText(`2·면적 = ${(area2 / 1000).toFixed(1)}k`, ppx + 10, ppy + 16);
    ctx.fillText(`와인딩: ${cw ? 'CW (부호 +)' : 'CCW (부호 −)'}`, ppx + 10, ppy + 35);
    ctx.font = `bold ${monoFont(12)}`;
    ctx.fillStyle = isFront ? COLORS.front : COLORS.fail;
    ctx.fillText(isFront ? '정면 → 통과' : '후면 → 컬링', ppx + 10, ppy + 55);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, [a, b, c, frontIsCW]);

  const pick = (e: PointerEvent, canvas: HTMLCanvasElement): 'A' | 'B' | 'C' | null => {
    const p = pointerToCanvas(e, canvas);
    const dA = len(sub(p, a));
    const dB = len(sub(p, b));
    const dC = len(sub(p, c));
    const m = Math.min(dA, dB, dC);
    if (m > 26) return null;
    if (m === dA) return 'A';
    if (m === dB) return 'B';
    return 'C';
  };

  usePointerDrag(ref, {
    onDown: (e, canvas) => {
      const t = pick(e, canvas);
      if (!t) return false;
      dragRef.current = t;
    },
    onMove: (e, canvas) => {
      if (!dragRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const p = pointerToCanvas(e, canvas);
      const cl = v2(
        Math.max(8, Math.min(rect.width - 8, p.x)),
        Math.max(8, Math.min(rect.height - 8, p.y)),
      );
      if (dragRef.current === 'A') setA(cl);
      else if (dragRef.current === 'B') setB(cl);
      else setC(cl);
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
        <ToggleControl
          label="정면 = 시계방향(CW)"
          checked={frontIsCW}
          onChange={setFrontIsCW}
        />
      </ControlPanel>
      <figcaption>
        백페이스 컬링은 사실 <strong>스칼라 하나의 부호</strong>로 끝납니다. 삼각형{' '}
        <em>(A,B,C)</em>의 “부호 있는 면적의 2배”는 정확히 에지 함수{' '}
        <em>E_AB(C)</em>와 같고, 그 <strong>부호가 회전 방향(시계 CW / 반시계 CCW)</strong>을 가릅니다.
        화살표는 A→B→C 순회 방향을 보여줍니다. GPU는 “정면은 어느 와인딩” 하나를 정해 두고, 반대
        와인딩이면 그 삼각형을 셰이딩도 하기 전에 <span style={{ color: '#ef4444' }}>버립니다</span>{' '}
        — 닫힌 메시에서 뒤통수를 향한 삼각형은 어차피 안 보이니, 평균 절반을 공짜로 쳐냅니다.
        <br />
        <strong>직접 해보세요:</strong> 정점 <span style={{ color: '#22c55e' }}>C</span>를 변 AB의
        반대편으로 끌고 넘어가 보세요. 순회가 뒤집히는 순간 면적의 부호가 <em>0을 지나</em> 반대로
        바뀌고, 삼각형이 <span style={{ color: '#14b8a6' }}>정면</span>↔<span style={{ color: '#f59e0b' }}>후면
        </span>으로 토글되며 빗금이 그어집니다. 토글로 “정면=CW/CCW” 규칙 자체를 뒤집어 보세요 —
        같은 모양이 통과/기각으로 바뀝니다. (부호가 0인 순간 = 세 점이 일직선 = 면적 0인 퇴화 삼각형.)
      </figcaption>
    </figure>
  );
}
