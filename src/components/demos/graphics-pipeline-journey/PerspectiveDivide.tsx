import { useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import {
  v2,
  sub,
  len,
  barycentric,
  inTriangle,
  COLORS,
  withAlpha,
  monoFont,
  centerText,
  pointerToCanvas,
  vertexHandle,
  type Vec2,
} from './gpj2d';

// ---------------------------------------------------------------------------
// 인터랙티브: 원근 분할(÷w) + 뷰포트 변환 + 원근 보정 보간.
//
//   (x_c, y_c, z_c, w_c) ──÷w──▶ (x_ndc, y_ndc) = (x_c/w_c, y_c/w_c) ∈ [−1,1]
//   ──뷰포트──▶ 픽셀 좌표.
//
// w가 클수록(=멀수록) 같은 클립 좌표가 더 작은 NDC로 줄어든다(원근 단축).
// 정점마다 w가 다르면, 화면에서 선형 보간한 속성은 *틀린다* — 텍스처가 휜다.
// 올바른 답은 속성을 1/w로 보간한 뒤 다시 나누는 "원근 보정" 보간이다.
// "과정": ÷w가 어떻게 깊이를 화면 크기에 반영하고, 왜 보간이 1/w 공간이어야 하는지.
// ---------------------------------------------------------------------------

const CANVAS_H = 460;

export default function PerspectiveDivide() {
  // 클립 공간 XY를 캔버스 좌측 패널 픽셀로 직접 들고 있는다(드래그용).
  const [a, setA] = useState<Vec2>(v2(70, 70));
  const [b, setB] = useState<Vec2>(v2(200, 110));
  const [c, setC] = useState<Vec2>(v2(110, 230));
  // 정점별 w (깊이감). 슬라이더로 한 정점만 멀리 밀어 비대칭 단축을 만든다.
  const [wA, setWA] = useState(1.0);
  const [wC, setWC] = useState(2.6);
  const [perspCorrect, setPerspCorrect] = useState(true);
  const dragRef = useRef<'A' | 'B' | 'C' | null>(null);

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const halfW = w / 2;
    // ---- 좌측 패널: 클립 공간(÷w 전) ----
    ctx.fillStyle = withAlpha(theme.muted, 0.06);
    ctx.fillRect(0, 0, halfW, h);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, h);
    ctx.stroke();

    // 좌 패널 좌표계: 클립 XY를 패널 안 [0..1]^2로 정규화해 그린다.
    const padL = 30;
    const clipBoxW = halfW - 2 * padL;
    const clipBoxH = h - 2 * padL - 40;
    const clipBoxY = padL + 30;

    // 정점의 패널 내 정규화 좌표(0..1)
    const norm = (p: Vec2): Vec2 =>
      v2((p.x - padL) / clipBoxW, (p.y - clipBoxY) / clipBoxH);
    const na = norm(a);
    const nb = norm(b);
    const nc = norm(c);

    // 클립 박스 외곽
    ctx.strokeStyle = withAlpha(theme.muted, 0.5);
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(padL, clipBoxY, clipBoxW, clipBoxH);
    ctx.setLineDash([]);
    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('클립 공간 (÷w 전)', padL, clipBoxY - 8);

    // 클립 삼각형
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.strokeStyle = withAlpha(theme.text, 0.6);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 정점 핸들 + w 라벨
    const labelW = (p: Vec2, ww: number) => {
      ctx.font = monoFont(10);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'center';
      ctx.fillText(`w=${ww.toFixed(1)}`, p.x, p.y + 20);
    };
    vertexHandle(ctx, a, COLORS.vA, 'A', theme.text);
    vertexHandle(ctx, b, COLORS.vB, 'B', theme.text);
    vertexHandle(ctx, c, COLORS.vC, 'C', theme.text);
    labelW(a, wA);
    labelW(b, 1.0);
    labelW(c, wC);

    // ---- 우측 패널: ÷w 후 NDC → 뷰포트(픽셀) + 체커 보간 ----
    // 각 정점을 NDC로: ndc = (clip_norm * 2 − 1) / w, 그 뒤 우 패널에 매핑.
    const ndc = (n: Vec2, ww: number): Vec2 =>
      v2(((n.x * 2 - 1)) / ww, ((n.y * 2 - 1)) / ww);
    const da = ndc(na, wA);
    const db = ndc(nb, 1.0);
    const dc = ndc(nc, wC);

    // 우 패널 뷰포트 매핑: NDC [-1,1] → 우 패널 박스
    const padR = 30;
    const vpX = halfW + padR;
    const vpY = padR + 30;
    const vpW = halfW - 2 * padR;
    const vpH = h - 2 * padR - 40;
    const toVp = (p: Vec2): Vec2 =>
      v2(vpX + ((p.x + 1) / 2) * vpW, vpY + ((p.y + 1) / 2) * vpH);
    const pa = toVp(da);
    const pb = toVp(db);
    const pc = toVp(dc);

    // 우 패널 박스 + 라벨
    ctx.strokeStyle = withAlpha(theme.muted, 0.5);
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(vpX, vpY, vpW, vpH);
    ctx.setLineDash([]);
    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('NDC → 뷰포트 (÷w 후)', vpX, vpY - 8);

    // 보간 검증용 체커: 삼각형 내부 픽셀마다 바리센트릭 → "텍스처 좌표 u" 계산.
    // u의 정점값을 A=0, B=1, C=0로 두고, 화면선형 vs 원근보정 두 가지로 칠해
    // 같은 줄무늬가 어떻게 휘는지 본다.
    const uVal = [0, 1, 0]; // A,B,C의 텍스처 좌표 u
    const invW = [1 / wA, 1 / 1.0, 1 / wC];
    const step = 3;
    const minX = Math.floor(Math.min(pa.x, pb.x, pc.x));
    const maxX = Math.ceil(Math.max(pa.x, pb.x, pc.x));
    const minY = Math.floor(Math.min(pa.y, pb.y, pc.y));
    const maxY = Math.ceil(Math.max(pa.y, pb.y, pc.y));
    for (let py = minY; py <= maxY; py += step) {
      for (let px = minX; px <= maxX; px += step) {
        const p = v2(px, py);
        if (!inTriangle(pa, pb, pc, p)) continue;
        const bc = barycentric(pa, pb, pc, p);
        if (!bc) continue;
        const { wa, wb, wc } = bc;
        let u: number;
        if (perspCorrect) {
          // 원근 보정: (Σ u_i/w_i · λ_i) / (Σ 1/w_i · λ_i)
          const num = uVal[0] * invW[0] * wa + uVal[1] * invW[1] * wb + uVal[2] * invW[2] * wc;
          const den = invW[0] * wa + invW[1] * wb + invW[2] * wc;
          u = num / den;
        } else {
          // 화면선형(틀림): u_i를 그냥 λ로 보간
          u = uVal[0] * wa + uVal[1] * wb + uVal[2] * wc;
        }
        // u를 줄무늬로: 흑백 8칸
        const stripe = Math.floor(u * 8) % 2 === 0;
        ctx.fillStyle = stripe ? withAlpha(COLORS.depth, 0.55) : withAlpha(theme.text, 0.12);
        ctx.fillRect(px, py, step, step);
      }
    }

    // 우 삼각형 외곽 + 정점
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.lineTo(pc.x, pc.y);
    ctx.closePath();
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    for (const [p, col, lab] of [
      [pa, COLORS.vA, 'A'],
      [pb, COLORS.vB, 'B'],
      [pc, COLORS.vC, 'C'],
    ] as [Vec2, string, string][]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.font = monoFont(10);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'center';
      ctx.fillText(lab, p.x, p.y - 12);
    }

    centerText(
      ctx,
      perspCorrect ? '원근 보정 보간' : '화면 선형 (틀림)',
      vpX + vpW / 2,
      vpY + vpH + 22,
      perspCorrect ? COLORS.pass : COLORS.fail,
      `bold ${monoFont(11)}`,
    );

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, [a, b, c, wA, wC, perspCorrect]);

  const pick = (e: PointerEvent, canvas: HTMLCanvasElement): 'A' | 'B' | 'C' | null => {
    const p = pointerToCanvas(e, canvas);
    const dA = len(sub(p, a));
    const dB = len(sub(p, b));
    const dC = len(sub(p, c));
    const m = Math.min(dA, dB, dC);
    if (m > 24) return null;
    return m === dA ? 'A' : m === dB ? 'B' : 'C';
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
      // 좌측 패널 안으로만 제한
      const cl = v2(
        Math.max(34, Math.min(rect.width / 2 - 34, p.x)),
        Math.max(64, Math.min(rect.height - 64, p.y)),
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
          label="정점 A의 w (깊이)"
          value={wA}
          min={0.5}
          max={4}
          step={0.1}
          onChange={setWA}
          format={(v) => v.toFixed(1)}
        />
        <Slider
          label="정점 C의 w (깊이)"
          value={wC}
          min={0.5}
          max={4}
          step={0.1}
          onChange={setWC}
          format={(v) => v.toFixed(1)}
        />
        <ToggleControl
          label="원근 보정 보간"
          checked={perspCorrect}
          onChange={setPerspCorrect}
        />
      </ControlPanel>
      <figcaption>
        정점 셰이더가 내놓는 좌표는 <em>클립 공간</em>의 4D 동차좌표 (x, y, z, w)입니다. 화면에 찍으려면
        모든 성분을 <strong>w로 나눠야</strong> 합니다 — 이 한 번의 나눗셈(<strong>원근 분할</strong>)이
        원근감 전체를 만듭니다. 같은 클립 좌표라도 <strong>w가 클수록(=멀수록) 더 작은 NDC</strong>로
        줄어드니까요. 왼쪽은 ÷w 전, 오른쪽은 ÷w 후 뷰포트로 옮긴 모습입니다.
        <br />
        <strong>직접 해보세요:</strong> 슬라이더로 정점 <span style={{ color: '#3b82f6' }}>A</span>·
        <span style={{ color: '#22c55e' }}>C</span>의 w를 키워 “멀리” 밀어 보세요 — 오른쪽 삼각형이
        비대칭으로 단축됩니다. 그리고 <strong>원근 보정 보간</strong>을 꺼 보세요. 줄무늬(텍스처 좌표
        u를 화면에서 그냥 선형 보간한 것)가 <span style={{ color: '#ef4444' }}>휘어집니다</span> — 멀리
        있는 쪽이 균등 간격이어야 하는데 화면선형은 가까운 쪽으로 쏠리거든요. 올바른 답은 속성을{' '}
        <em>1/w 공간</em>에서 보간한 뒤 다시 나누는 것(켜진 상태). w가 모두 같아질수록(정면 평행) 두
        방식의 차이가 사라지는 것도 확인해 보세요.
      </figcaption>
    </figure>
  );
}
