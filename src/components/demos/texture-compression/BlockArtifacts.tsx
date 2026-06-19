import { useEffect, useMemo, useRef, useState } from 'react';
import { ControlPanel, SelectControl, ToggleControl, type SelectOption } from '../../controls';
import {
  setupCanvas,
  readTheme,
  observeTheme,
  blitImage,
  encodeBlock,
  fitEndpoints,
  clamp,
  type RGB,
} from './tc2d';

// ---------------------------------------------------------------------------
// 그림 3 (인터랙티브): 블록 아티팩트 & 녹색 밴딩.
//
// 매끈한 절차적 이미지를 4×4 블록 단위로 실제 BC1 인코딩하고, 원본↔압축을 토글한다.
// 블록 경계 격자 오버레이를 켜면 "각 블록이 독립적으로 양자화된다"는 사실이 드러나고,
// 차이(오차) 뷰를 켜면 RGB565의 비대칭(초록 6비트 vs 적·청 5비트)이 만드는 색 틴트를
// 본다. blitImage로 픽셀 버퍼를 HiDPI 정확히 올린다.
// ---------------------------------------------------------------------------

type Scene = 'gradient' | 'ramp' | 'disc';
type View = 'original' | 'bc1' | 'diff';

const SCENES: ReadonlyArray<SelectOption<Scene>> = [
  { value: 'gradient', label: '대각 그라데이션' },
  { value: 'ramp', label: '하늘색 램프(밴딩 잘 보임)' },
  { value: 'disc', label: '둥근 하이라이트' },
];
const VIEWS: ReadonlyArray<SelectOption<View>> = [
  { value: 'original', label: '원본 (비압축)' },
  { value: 'bc1', label: 'BC1 압축' },
  { value: 'diff', label: '차이 ×8 (오차)' },
];

const SRC = 64; // 소스 텍스처 해상도(텍셀)

// 절차적 소스 이미지(외부 에셋 없이). 부드러운 그라데이션류가 블록 압축에 가장 가혹.
function makeSource(scene: Scene): RGB[] {
  const out: RGB[] = [];
  for (let y = 0; y < SRC; y++) {
    for (let x = 0; x < SRC; x++) {
      const u = x / (SRC - 1);
      const v = y / (SRC - 1);
      let c: RGB;
      if (scene === 'gradient') {
        c = [
          Math.round(40 + 200 * u),
          Math.round(70 + 150 * ((u + v) / 2)),
          Math.round(200 - 150 * v),
        ];
      } else if (scene === 'ramp') {
        // 청록→흰색 매끈 램프 — 초록·청 채널이 천천히 변해 565 밴딩이 도드라짐
        const t = (u + v) / 2;
        c = [Math.round(120 + 130 * t), Math.round(180 + 70 * t), Math.round(220 + 35 * t)];
      } else {
        // 중앙에서 퍼지는 매끈한 밝기(둥근 하이라이트)
        const dx = u - 0.5;
        const dy = v - 0.5;
        const r = Math.sqrt(dx * dx + dy * dy) * 1.7;
        const b = clamp(1 - r * r, 0, 1);
        c = [Math.round(40 + 215 * b), Math.round(50 + 180 * b), Math.round(70 + 150 * b)];
      }
      out.push(c);
    }
  }
  return out;
}

// 소스를 4×4 블록 단위로 BC1 인코딩(블록마다 끝점 자동 fit).
function encodeBC1(src: RGB[]): RGB[] {
  const out: RGB[] = new Array(SRC * SRC);
  for (let by = 0; by < SRC; by += 4) {
    for (let bx = 0; bx < SRC; bx += 4) {
      const block: RGB[] = [];
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) block.push(src[(by + y) * SRC + (bx + x)]);
      const { c0, c1 } = fitEndpoints(block);
      const { out: q } = encodeBlock(block, c0, c1);
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) out[(by + y) * SRC + (bx + x)] = q[y * 4 + x];
    }
  }
  return out;
}

export default function BlockArtifacts() {
  const [scene, setScene] = useState<Scene>('ramp');
  const [view, setView] = useState<View>('bc1');
  const [grid, setGrid] = useState(true);
  const ref = useRef<HTMLCanvasElement>(null);

  const src = useMemo(() => makeSource(scene), [scene]);
  const comp = useMemo(() => encodeBC1(src), [src]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const run = (): void => {
      const setup = setupCanvas(canvas);
      if (!setup) return;
      const { ctx, w, h } = setup;
      const theme = readTheme(canvas);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = theme.surface;
      ctx.fillRect(0, 0, w, h);

      // 정사각 그리기 영역(중앙)
      const side = Math.min(w, h) - 8;
      const ox = (w - side) / 2;
      const oy = (h - side) / 2;

      // 픽셀 버퍼 채우기(소스 해상도)
      const img = ctx.createImageData(SRC, SRC);
      for (let i = 0; i < SRC * SRC; i++) {
        let c: RGB;
        if (view === 'original') c = src[i];
        else if (view === 'bc1') c = comp[i];
        else {
          // 차이 ×8 — 오차 부호를 보여 색 틴트(초록 vs 자홍)를 드러냄
          const dr = (comp[i][0] - src[i][0]) * 8;
          const dg = (comp[i][1] - src[i][1]) * 8;
          const db = (comp[i][2] - src[i][2]) * 8;
          c = [clamp(128 + dr, 0, 255), clamp(128 + dg, 0, 255), clamp(128 + db, 0, 255)];
        }
        img.data[i * 4] = c[0];
        img.data[i * 4 + 1] = c[1];
        img.data[i * 4 + 2] = c[2];
        img.data[i * 4 + 3] = 255;
      }
      // HiDPI: 반드시 blitImage(putImageData 직접 호출은 변환을 무시).
      blitImage(ctx, img, ox, oy, side, side);

      // 4×4 블록 경계 격자
      if (grid) {
        ctx.strokeStyle = theme.muted;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = 0; gx <= SRC; gx += 4) {
          const px = ox + (gx / SRC) * side;
          ctx.moveTo(px, oy);
          ctx.lineTo(px, oy + side);
        }
        for (let gy = 0; gy <= SRC; gy += 4) {
          const py = oy + (gy / SRC) * side;
          ctx.moveTo(ox, py);
          ctx.lineTo(ox + side, py);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(canvas);
    const stop = observeTheme(run);
    return () => {
      ro.disconnect();
      stop();
    };
  }, [src, comp, view, grid]);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 300, display: 'block' }} />
      </div>
      <ControlPanel>
        <SelectControl<Scene> label="장면" value={scene} options={SCENES} onChange={setScene} />
        <SelectControl<View> label="보기" value={view} options={VIEWS} onChange={setView} />
        <ToggleControl label="4×4 블록 격자" checked={grid} onChange={setGrid} />
      </ControlPanel>
      <figcaption>
        이 이미지는 실제로 4×4 블록마다 BC1 인코딩된다(블록별로 끝점을 자동으로 맞춘다).
        <strong> ‘원본’과 ‘BC1’을 번갈아</strong> 보면, 매끈했던 그라데이션이 압축 후 작은
        면(facet)들로 쪼개지는 게 보인다 — 각 4×4 블록이 자기 선분 위 4색만 쓰기 때문에 블록
        경계에서 색이 살짝 튄다. <strong>‘차이 ×8’</strong>은 오차를 증폭해 보여주는데, 회색
        배경 위로 초록·자홍 틴트가 어른거린다: RGB565가 초록은 6비트(64단계), 빨강·파랑은
        5비트(32단계)로 저장해 채널마다 양자화 격자가 다르기 때문이다. ‘하늘색 램프’ 장면이
        이 <strong>녹색 밴딩</strong>을 가장 선명하게 드러낸다.
      </figcaption>
    </figure>
  );
}
