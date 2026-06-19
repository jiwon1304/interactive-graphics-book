import { useRef, useState } from 'react';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import { COLORS, monoFont, label, roundRect, withAlpha, pointerToCanvas, mixRgb, rgbToCss, type RGB } from './tf2d';

// Bilinear 보간: 샘플점을 둘러싼 4 텍셀을 거리(소수부)로 가중 평균.
//   - 작은 텍셀 격자에 샘플점을 드래그.
//   - 둘러싼 4 텍셀 강조 + 각 가중치 (1-tx)(1-ty) 등 표시.
//   - 오른쪽: nearest 한 점 vs bilinear blend 결과 비교.

const G = 6; // 격자 텍셀 수

function hsv2rgb(h: number, s: number, v: number): RGB {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function texColor(x: number, y: number): RGB {
  const hue = ((x * 53 + y * 29) % 12) * 30;
  return hsv2rgb(hue, 0.55, 0.92);
}

export default function Bilinear() {
  // 샘플점은 텍셀 좌표(중심=정수)로 보관. 초기 (2.35, 2.6).
  const [su, setSu] = useState(2.35);
  const [sv, setSv] = useState(2.6);

  // 레이아웃 값(드래그 히트테스트에서 재사용).
  const geo = useRef({ gx: 0, gy: 0, side: 0, cell: 0 });

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const side = Math.min(h - 24, w * 0.52);
    const gx = 12;
    const gy = (h - side) / 2;
    const cell = side / G;
    geo.current = { gx, gy, side, cell };

    // 격자 텍셀
    for (let ty = 0; ty < G; ty++) {
      for (let tx = 0; tx < G; tx++) {
        ctx.fillStyle = rgbToCss(texColor(tx, ty));
        ctx.fillRect(gx + tx * cell, gy + ty * cell, cell + 0.5, cell + 0.5);
      }
    }
    ctx.strokeStyle = withAlpha(theme.text, 0.15);
    ctx.lineWidth = 1;
    for (let i = 0; i <= G; i++) {
      ctx.beginPath();
      ctx.moveTo(gx + i * cell, gy);
      ctx.lineTo(gx + i * cell, gy + side);
      ctx.moveTo(gx, gy + i * cell);
      ctx.lineTo(gx + side, gy + i * cell);
      ctx.stroke();
    }

    // 텍셀 좌표(중심=정수) → 픽셀. 중심은 (i+0.5)*cell.
    const toPx = (u: number, v: number) => ({
      x: gx + (u + 0.5) * cell,
      y: gy + (v + 0.5) * cell,
    });

    const x0 = Math.floor(su);
    const y0 = Math.floor(sv);
    const tx = su - x0;
    const ty = sv - y0;
    const neighbors = [
      { ix: x0, iy: y0, wx: 1 - tx, wy: 1 - ty },
      { ix: x0 + 1, iy: y0, wx: tx, wy: 1 - ty },
      { ix: x0, iy: y0 + 1, wx: 1 - tx, wy: ty },
      { ix: x0 + 1, iy: y0 + 1, wx: tx, wy: ty },
    ];

    // 4 이웃 강조 + 가중치
    for (const n of neighbors) {
      const w4 = n.wx * n.wy;
      const cx = gx + n.ix * cell;
      const cy = gy + n.iy * cell;
      ctx.strokeStyle = COLORS.sample;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2);
      // 가중치 라벨(텍셀 중심)
      const c = toPx(n.ix, n.iy);
      ctx.font = monoFont(11, 'bold');
      ctx.fillStyle = '#000';
      ctx.globalAlpha = 0.25;
      roundRect(ctx, c.x - 18, c.y - 9, 36, 18, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      label(ctx, c.x, c.y, w4.toFixed(2), '#fff', 11, 'bold');
      // 텍셀 중심 점
      ctx.fillStyle = withAlpha(theme.text, 0.5);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 샘플점
    const sp = toPx(su, sv);
    ctx.fillStyle = COLORS.accent2;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // --- 오른쪽: nearest vs bilinear 결과 ---
    const rx = gx + side + 22;
    const rw = w - rx - 12;
    if (rw > 60) {
      const nearest = texColor(Math.max(0, Math.round(su)), Math.max(0, Math.round(sv)));
      // bilinear blend
      const c00 = texColor(x0, y0);
      const c10 = texColor(x0 + 1, y0);
      const c01 = texColor(x0, y0 + 1);
      const c11 = texColor(x0 + 1, y0 + 1);
      const top = mixRgb(c00, c10, tx);
      const bot = mixRgb(c01, c11, tx);
      const bil = mixRgb(top, bot, ty);

      const swH = Math.min(70, side / 2 - 22);
      const swY = gy;
      label(ctx, rx + rw / 2, swY - 4, 'nearest', theme.muted, 11, 'bold');
      ctx.fillStyle = rgbToCss(nearest);
      roundRect(ctx, rx, swY + 6, rw, swH, 8);
      ctx.fill();
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.stroke();

      const swY2 = swY + swH + 34;
      label(ctx, rx + rw / 2, swY2 - 4, 'bilinear', COLORS.good, 11, 'bold');
      ctx.fillStyle = rgbToCss(bil);
      roundRect(ctx, rx, swY2 + 6, rw, swH, 8);
      ctx.fill();
      ctx.strokeStyle = COLORS.good;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = monoFont(10);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'center';
      ctx.fillText(`tx=${tx.toFixed(2)} ty=${ty.toFixed(2)}`, rx + rw / 2, swY2 + swH + 22);
      ctx.textAlign = 'left';
    }
  };

  const { ref } = useCanvas2d(draw, [su, sv]);

  // 드래그: 포인터 → 텍셀 좌표(클램프해 4 이웃이 항상 존재).
  const setFromPointer = (e: PointerEvent, canvas: HTMLCanvasElement) => {
    const p = pointerToCanvas(e, canvas);
    const { gx, gy, cell } = geo.current;
    const u = (p.x - gx) / cell - 0.5;
    const v = (p.y - gy) / cell - 0.5;
    setSu(Math.max(0, Math.min(G - 1.001, u)));
    setSv(Math.max(0, Math.min(G - 1.001, v)));
  };
  usePointerDrag(ref, {
    onDown: (e, c) => {
      setFromPointer(e, c);
    },
    onMove: (e, c) => setFromPointer(e, c),
  });

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 240, display: 'block', touchAction: 'none', cursor: 'crosshair' }}
      />
      <figcaption>
        화면 픽셀이 텍셀 사이의 어중간한 위치에 떨어지면(보라 점) 어느 텍셀 하나를 고를까요?{' '}
        <strong>nearest</strong>는 가장 가까운 한 텍셀만 읽어 계단처럼 끊깁니다. <strong>bilinear</strong>는
        둘러싼 <span style={{ color: COLORS.sample }}>4 텍셀</span>을, 샘플점과의 거리(소수부 tx·ty)로
        가중 평균합니다. <strong>점을 끌어 보세요</strong> — 각 텍셀의 가중치{' '}
        <code>(1−tx)(1−ty)</code>, <code>tx(1−ty)</code>, <code>(1−tx)ty</code>, <code>tx·ty</code> 가
        실시간으로 변하고, 네 가중치의 합은 항상 1입니다. 오른쪽에서 nearest의 뚝뚝 끊기는 색과 bilinear의{' '}
        <span style={{ color: COLORS.good }}>매끈한 blend</span>를 비교해 보세요. bilinear는 한 레벨{' '}
        <em>안에서</em>의 보간입니다. 레벨 <em>사이</em>를 잇는 것이 다음의 trilinear입니다.
      </figcaption>
    </figure>
  );
}
