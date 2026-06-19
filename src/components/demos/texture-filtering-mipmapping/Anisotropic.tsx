import { useMemo, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import {
  COLORS,
  monoFont,
  label,
  drawArrow,
  makeTexture,
  buildMipChain,
  sampleTrilinear,
  lodFromRho,
  rgbToCss,
  withAlpha,
  type RGB,
} from './tf2d';

// Anisotropic filtering: 비스듬한 표면에서 픽셀 footprint는 길쭉한 타원이 된다.
// isotropic(trilinear)은 footprint 장축 길이로 LOD를 골라 단축까지 과하게 흐린다.
// anisotropic은 장축을 따라 N개 탭을 더 낮은 LOD로 샘플해 단축 방향 선명함을 지킨다.
//
// 원근 바닥(receding floor)을 그려 멀리(위)서의 흐림 차이를 직접 보인다 + footprint inset.

const BASE = 32;

// 화면(px,py) → 텍스처 (u,v). 원근 바닥: 위=멀리, 아래=가까움.
function mapUV(px: number, py: number, W: number, H: number, yH: number): { u: number; v: number } {
  const p = Math.max(0.0015, (py - yH) / (H - yH)); // (0,1], 작을수록 멀다
  const depth = 1 / p;
  const v = depth * 0.55;
  const u = ((px - W / 2) / W) * depth * 1.1 + depth * 0.0;
  return { u, v };
}

// (px,py)에서 footprint 두 벡터(텍셀 단위)와 파생량.
function footprint(px: number, py: number, W: number, H: number, yH: number) {
  const o = mapUV(px, py, W, H, yH);
  const dx = mapUV(px + 1, py, W, H, yH);
  const dy = mapUV(px, py + 1, W, H, yH);
  const fx: [number, number] = [(dx.u - o.u) * BASE, (dx.v - o.v) * BASE];
  const fy: [number, number] = [(dy.u - o.u) * BASE, (dy.v - o.v) * BASE];
  const lenx = Math.hypot(fx[0], fx[1]);
  const leny = Math.hypot(fy[0], fy[1]);
  const major = lenx >= leny ? fx : fy;
  const majorLen = Math.max(lenx, leny);
  const minorLen = Math.max(1e-3, Math.min(lenx, leny));
  return { o, fx, fy, lenx, leny, major, majorLen, minorLen };
}

export default function Anisotropic() {
  const [aniso, setAniso] = useState(true);
  const [maxAniso, setMaxAniso] = useState(8);
  const chain = useMemo(() => buildMipChain(makeTexture(BASE, 'brick')), []);
  const maxL = chain.length - 1;

  const sampleFloor = (px: number, py: number, W: number, H: number, yH: number): RGB => {
    const fp = footprint(px, py, W, H, yH);
    if (!aniso) {
      const lod = lodFromRho(fp.majorLen);
      return sampleTrilinear(chain, fp.o.u, fp.o.v, lod);
    }
    const ratio = fp.majorLen / fp.minorLen;
    const N = Math.max(1, Math.min(maxAniso, Math.round(ratio)));
    const lod = lodFromRho(fp.majorLen / N);
    // 장축 방향(uv 단위)으로 N개 탭
    const muv: [number, number] = [fp.major[0] / BASE, fp.major[1] / BASE];
    let acc: RGB = [0, 0, 0];
    for (let k = 0; k < N; k++) {
      const t = (k + 0.5) / N - 0.5;
      const u = fp.o.u + muv[0] * t;
      const v = fp.o.v + muv[1] * t;
      const c = sampleTrilinear(chain, u, v, lod);
      acc = [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]];
    }
    return [acc[0] / N, acc[1] / N, acc[2] / N];
  };

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const yH = Math.round(h * 0.05);
    const cell = 5;
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil((h - yH) / cell);

    // 하늘(상단 얇은 띠)
    ctx.fillStyle = withAlpha(theme.text, 0.06);
    ctx.fillRect(0, 0, w, yH);

    for (let r = 0; r < rows; r++) {
      const py = yH + r * cell + cell / 2;
      for (let c = 0; c < cols; c++) {
        const px = c * cell + cell / 2;
        const col = sampleFloor(px, py, w, h, yH);
        ctx.fillStyle = rgbToCss(col);
        ctx.fillRect(c * cell, yH + r * cell, cell + 0.6, cell + 0.6);
      }
    }

    // --- footprint inset (대표 먼 픽셀) ---
    const repPx = w * 0.5;
    const repPy = yH + (h - yH) * 0.16; // 멀리(위쪽)
    const fp = footprint(repPx, repPy, w, h, yH);
    const ratio = fp.majorLen / fp.minorLen;
    const N = aniso ? Math.max(1, Math.min(maxAniso, Math.round(ratio))) : 1;

    const isz = Math.min(120, w * 0.32);
    const ix = w - isz - 10;
    const iy = 10;
    ctx.fillStyle = withAlpha(theme.bg, 0.9);
    ctx.fillRect(ix, iy, isz, isz);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(ix, iy, isz, isz);
    const cx = ix + isz / 2;
    const cy = iy + isz / 2;
    // 스케일: 장축이 inset 절반에 차도록
    const sc = (isz * 0.42) / Math.max(1e-3, fp.majorLen);
    // footprint 평행사변형(±fx ±fy)
    const corners: Array<[number, number]> = [
      [fp.fx[0] + fp.fy[0], fp.fx[1] + fp.fy[1]],
      [fp.fx[0] - fp.fy[0], fp.fx[1] - fp.fy[1]],
      [-fp.fx[0] - fp.fy[0], -fp.fx[1] - fp.fy[1]],
      [-fp.fx[0] + fp.fy[0], -fp.fx[1] + fp.fy[1]],
    ];
    ctx.beginPath();
    corners.forEach((c, i) => {
      const X = cx + c[0] * sc;
      const Y = cy + c[1] * sc;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.closePath();
    ctx.fillStyle = withAlpha(COLORS.accent2, 0.18);
    ctx.fill();
    ctx.strokeStyle = COLORS.accent2;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 장축 + 탭
    const muv: [number, number] = [fp.major[0], fp.major[1]];
    drawArrow(ctx, cx - muv[0] * sc, cy - muv[1] * sc, cx + muv[0] * sc, cy + muv[1] * sc, COLORS.major, 1.5, 6);
    if (aniso) {
      for (let k = 0; k < N; k++) {
        const t = (k + 0.5) / N - 0.5;
        const X = cx + muv[0] * sc * 2 * t;
        const Y = cy + muv[1] * sc * 2 * t;
        ctx.fillStyle = COLORS.major;
        ctx.beginPath();
        ctx.arc(X, Y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    label(ctx, ix + isz / 2, iy - 0 + 10, 'footprint', theme.muted, 9, 'bold');

    // 상태 텍스트
    ctx.font = monoFont(11, 'bold');
    ctx.fillStyle = aniso ? COLORS.good : COLORS.bad;
    ctx.textAlign = 'left';
    ctx.fillText(
      aniso ? `anisotropic ×${N} (ratio ${ratio.toFixed(1)})` : `isotropic (ratio ${ratio.toFixed(1)} 무시)`,
      8,
      h - 10,
    );
  };

  const { ref } = useCanvas2d(draw, [aniso, maxAniso, chain, maxL]);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 300, display: 'block' }} />
      <ControlPanel>
        <ToggleControl label="anisotropic" checked={aniso} onChange={setAniso} />
        <Slider
          label="max anisotropy"
          value={maxAniso}
          min={1}
          max={16}
          step={1}
          onChange={setMaxAniso}
          format={(v) => `×${v}`}
        />
      </ControlPanel>
      <figcaption>
        바닥을 비스듬히 내려다보면 멀리(위쪽) 한 픽셀이 텍스처에서 덮는 영역은 정사각형이 아니라{' '}
        <span style={{ color: COLORS.accent2 }}>길쭉한 타원</span>(inset의 평행사변형)입니다 — 깊이
        방향으로 훨씬 길죠. trilinear는 이 footprint의 <em>장축</em> 길이로 LOD를 정하기 때문에, 짧은
        단축 방향까지 똑같이 흐려 멀리 바닥이 <span style={{ color: COLORS.bad }}>뭉개집니다</span>.{' '}
        <strong>anisotropic을 꺼고 켜 보세요.</strong> 켜면 장축을 따라{' '}
        <span style={{ color: COLORS.major }}>N개의 탭</span>을 더 낮은(선명한) LOD로 찍어 평균하므로,
        멀리 바닥의 줄눈이 <span style={{ color: COLORS.good }}>또렷하게</span> 살아납니다. ‘max
        anisotropy’가 N의 상한입니다(보통 ×2~×16). footprint가 길쭉할수록 탭이 늘어 비용도 그만큼 커지므로,
        하드웨어는 ratio에 맞춰 필요한 만큼만 탭을 씁니다.
      </figcaption>
    </figure>
  );
}
