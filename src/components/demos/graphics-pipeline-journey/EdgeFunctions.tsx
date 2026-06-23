import { useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import {
  v2,
  sub,
  len,
  edge,
  COLORS,
  withAlpha,
  monoFont,
  pointerToCanvas,
  vertexHandle,
  type Vec2,
} from './gpj2d';

// ---------------------------------------------------------------------------
// 인터랙티브: 에지 함수로 픽셀 커버리지를 판정한다.
//
//   E_AB(P) = (P.x − A.x)(B.y − A.y) − (P.y − A.y)(B.x − A.x)
//
// 픽셀 중심 P가 세 에지(AB, BC, CA)에 대해 부호가 모두 같으면 → 삼각형 내부 → 커버됨.
// 정점 3개를 드래그하면 커버되는 픽셀 집합이 실시간으로 다시 칠해진다.
// "과정": 결과(삼각형 그림)가 아니라, *각 픽셀이 어떻게 in/out으로 판정되는지*를 본다.
// ---------------------------------------------------------------------------

const CANVAS_H = 420;

export default function EdgeFunctions() {
  // 정점은 캔버스 픽셀 좌표(=스크린 공간). 초기값은 마운트 후 비율에 맞춰 조정.
  const [a, setA] = useState<Vec2>(v2(110, 90));
  const [b, setB] = useState<Vec2>(v2(330, 140));
  const [c, setC] = useState<Vec2>(v2(180, 320));
  const [cell, setCell] = useState(22);
  const [showSigns, setShowSigns] = useState(true);
  const dragRef = useRef<'A' | 'B' | 'C' | null>(null);

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    // 픽셀 격자 위를 훑으며 커버리지 판정
    for (let py = 0; py < h; py += cell) {
      for (let px = 0; px < w; px += cell) {
        const p = v2(px + cell / 2, py + cell / 2);
        const e0 = edge(a, b, p);
        const e1 = edge(b, c, p);
        const e2 = edge(c, a, p);
        const hasNeg = e0 < 0 || e1 < 0 || e2 < 0;
        const hasPos = e0 > 0 || e1 > 0 || e2 > 0;
        const inside = !(hasNeg && hasPos);
        if (inside) {
          ctx.fillStyle = withAlpha(COLORS.pass, 0.42);
          ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
        }
      }
    }

    // 격자선(은은하게)
    ctx.strokeStyle = withAlpha(theme.muted, 0.22);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let px = 0; px <= w; px += cell) {
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }
    for (let py = 0; py <= h; py += cell) {
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.stroke();

    // 삼각형 외곽선(정확한 기하)
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 세 에지에 라벨(부호 표시 옵션)
    if (showSigns) {
      const mid = (u: Vec2, vv: Vec2): Vec2 => v2((u.x + vv.x) / 2, (u.y + vv.y) / 2);
      const drawEdgeLabel = (u: Vec2, vv: Vec2, name: string, color: string) => {
        const m = mid(u, vv);
        ctx.font = monoFont(12);
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // 라벨을 에지 바깥쪽으로 살짝 밀기
        const dir = sub(vv, u);
        const nlen = Math.hypot(dir.x, dir.y) || 1;
        const nx = -dir.y / nlen;
        const ny = dir.x / nlen;
        ctx.fillText(name, m.x + nx * 14, m.y + ny * 14);
      };
      drawEdgeLabel(a, b, 'E_AB', COLORS.vA);
      drawEdgeLabel(b, c, 'E_BC', COLORS.vB);
      drawEdgeLabel(c, a, 'E_CA', COLORS.vC);
    }

    // 정점 핸들
    vertexHandle(ctx, a, COLORS.vA, 'A', theme.text);
    vertexHandle(ctx, b, COLORS.vB, 'B', theme.text);
    vertexHandle(ctx, c, COLORS.vC, 'C', theme.text);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, [a, b, c, cell, showSigns]);

  const pick = (e: PointerEvent, canvas: HTMLCanvasElement): 'A' | 'B' | 'C' | null => {
    const p = pointerToCanvas(e, canvas);
    const dA = len(sub(p, a));
    const dB = len(sub(p, b));
    const dC = len(sub(p, c));
    const m = Math.min(dA, dB, dC);
    if (m > 24) return null;
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
        <Slider
          label="픽셀 크기"
          value={cell}
          min={10}
          max={40}
          step={2}
          onChange={setCell}
          unit="px"
        />
        <ToggleControl label="에지 라벨 보기" checked={showSigns} onChange={setShowSigns} />
      </ControlPanel>
      <figcaption>
        래스터화의 심장입니다. 화면을 픽셀 격자로 보고, <strong>각 픽셀의 중심점 P</strong>마다 세 에지
        함수 <em>E_AB(P)</em>, <em>E_BC(P)</em>, <em>E_CA(P)</em>의 부호를 잰 뒤 — 셋의{' '}
        <strong>부호가 모두 같으면 그 픽셀은 삼각형 안</strong>이라 초록으로 칠합니다. 에지 함수 하나는
        “이 점이 그 변의 어느 쪽에 있나”를 재는 부호 있는 값(외적)일 뿐이고, 변 셋에 대해 모두 같은
        쪽이면 내부라는 단순한 논리입니다.
        <br />
        <strong>직접 해보세요:</strong> 정점{' '}
        <span style={{ color: '#3b82f6' }}>A</span>·<span style={{ color: '#ec4899' }}>B</span>·
        <span style={{ color: '#22c55e' }}>C</span>를 드래그해 모양을 바꿔 보세요 — 커버되는 픽셀 집합이
        즉시 다시 칠해집니다. 픽셀 크기를 키우면 “계단(앨리어싱)”이 거칠어지고, 줄이면 윤곽이
        매끄러워지지만 판정해야 할 픽셀 수가 제곱으로 늘어납니다. 이 한 줄의 부호 판정을 GPU는 픽셀마다
        — 한 프레임에 수백만 번 — 병렬로 돌립니다.
      </figcaption>
    </figure>
  );
}
