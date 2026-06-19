import { useEffect, useMemo, useRef, useState } from 'react';
import { ControlPanel, Slider, SelectControl, type SelectOption } from '../../controls';
import {
  setupCanvas,
  readTheme,
  observeTheme,
  blitImage,
  quantize565,
  reconstructZ,
  clamp,
  type RGB,
} from './tc2d';

// ---------------------------------------------------------------------------
// 그림 4 (인터랙티브): 노멀맵 압축 — BC1-RGB vs BC5+Z 재구성.
//
// 절차적 범프(bumpy) 노멀 필드를 만들어 세 방식으로 저장·복원한 뒤, 같은 조명으로
// 라이팅한다. 광원 방향을 슬라이더로 돌리며 하이라이트가 어떻게 망가지는지 본다.
//   (a) 원본 노멀
//   (b) BC1-RGB: 노멀 (x,y,z)를 RGB565 색으로 우겨넣음 → 녹색 틴트 + 블록 하이라이트
//   (c) BC5: x,y 두 채널만 8비트로 저장하고 z=√(1−x²−y²)로 복원 → 매끈
// ---------------------------------------------------------------------------

type Mode = 'original' | 'bc1' | 'bc5';
const MODES: ReadonlyArray<SelectOption<Mode>> = [
  { value: 'original', label: '원본 노멀 (비압축)' },
  { value: 'bc1', label: 'BC1-RGB (노멀을 색처럼)' },
  { value: 'bc5', label: 'BC5 (XY 저장 + Z 복원)' },
];

const N = 64; // 노멀 필드 해상도

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// 절차적 노멀 필드: 몇 개의 가우시안 범프 합의 기울기에서 노멀을 만든다.
function makeNormals(): Vec3[] {
  const bumps = [
    { x: 0.32, y: 0.36, a: 1.0, s: 0.16 },
    { x: 0.68, y: 0.42, a: 0.85, s: 0.13 },
    { x: 0.5, y: 0.7, a: 0.9, s: 0.18 },
    { x: 0.22, y: 0.72, a: 0.6, s: 0.1 },
  ];
  const height = (u: number, v: number): number => {
    let hgt = 0;
    for (const b of bumps) {
      const dx = u - b.x;
      const dy = v - b.y;
      hgt += b.a * Math.exp(-(dx * dx + dy * dy) / (2 * b.s * b.s));
    }
    return hgt;
  };
  const out: Vec3[] = [];
  const eps = 1 / N;
  const scale = 1.6; // 범프 가파름
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / (N - 1);
      const v = y / (N - 1);
      const hx = (height(u + eps, v) - height(u - eps, v)) / (2 * eps);
      const hy = (height(u, v + eps) - height(u, v - eps)) / (2 * eps);
      // 노멀 = normalize(-dh/dx, -dh/dy, 1)
      let nx = -hx * scale * 0.04;
      let ny = -hy * scale * 0.04;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      out.push({ x: nx, y: ny, z: nz });
    }
  }
  return out;
}

// 노멀(-1..1) → RGB(0..255) 인코딩
const nToColor = (n: Vec3): RGB => [
  Math.round((n.x * 0.5 + 0.5) * 255),
  Math.round((n.y * 0.5 + 0.5) * 255),
  Math.round((n.z * 0.5 + 0.5) * 255),
];
const colorToN = (c: RGB): Vec3 => {
  let x = (c[0] / 255) * 2 - 1;
  let y = (c[1] / 255) * 2 - 1;
  let z = (c[2] / 255) * 2 - 1;
  const l = Math.hypot(x, y, z) || 1;
  x /= l;
  y /= l;
  z /= l;
  return { x, y, z };
};

// 8비트 채널 양자화(BC4/BC5의 채널 정밀도 근사)
const q8 = (v: number): number => clamp(Math.round(v), 0, 255);

function decodeNormal(n: Vec3, mode: Mode): Vec3 {
  if (mode === 'original') return n;
  if (mode === 'bc1') {
    // 노멀을 RGB로 보고 565로 양자화 → 모든 채널 손실, 특히 적·청 5비트
    const c = quantize565(nToColor(n));
    return colorToN(c);
  }
  // BC5: x,y만 8비트로 저장하고 z를 재구성
  const x = (q8((n.x * 0.5 + 0.5) * 255) / 255) * 2 - 1;
  const y = (q8((n.y * 0.5 + 0.5) * 255) / 255) * 2 - 1;
  const z = reconstructZ(x, y);
  return { x, y, z };
}

export default function NormalBC5() {
  const [mode, setMode] = useState<Mode>('bc1');
  const [lightAng, setLightAng] = useState(35); // 광원 방위각(도)
  const ref = useRef<HTMLCanvasElement>(null);
  const normals = useMemo(() => makeNormals(), []);

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

      const side = Math.min(w, h) - 8;
      const ox = (w - side) / 2;
      const oy = (h - side) / 2;

      // 광원 방향(약간 비스듬히 위에서)
      const a = (lightAng * Math.PI) / 180;
      const L: Vec3 = { x: Math.cos(a) * 0.6, y: Math.sin(a) * 0.6, z: 0.65 };
      const Ll = Math.hypot(L.x, L.y, L.z);
      L.x /= Ll;
      L.y /= Ll;
      L.z /= Ll;

      const img = ctx.createImageData(N, N);
      for (let i = 0; i < N * N; i++) {
        const nd = decodeNormal(normals[i], mode);
        const diff = Math.max(0, nd.x * L.x + nd.y * L.y + nd.z * L.z);
        // 간단한 Lambert + 약한 ambient, 약간 채색
        const shade = clamp(0.12 + 0.88 * diff, 0, 1);
        const r = Math.round(235 * shade);
        const g = Math.round(225 * shade);
        const b = Math.round(205 * shade);
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = 255;
      }
      blitImage(ctx, img, ox, oy, side, side);
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(canvas);
    const stop = observeTheme(run);
    return () => {
      ro.disconnect();
      stop();
    };
  }, [normals, mode, lightAng]);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 380, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 300, display: 'block' }} />
      </div>
      <ControlPanel>
        <SelectControl<Mode> label="저장 방식" value={mode} options={MODES} onChange={setMode} />
        <Slider
          label="광원 방향"
          value={lightAng}
          min={0}
          max={360}
          step={1}
          onChange={setLightAng}
          unit="°"
        />
      </ControlPanel>
      <figcaption>
        이 범프 표면은 노멀맵으로 라이팅했다(높이가 아니라 픽셀별 노멀로 음영을 준다).
        <strong> 광원 방향</strong>을 돌려 하이라이트가 표면을 쓸고 가게 한 뒤 저장 방식을
        바꿔 보라. <strong>BC1-RGB</strong>는 노멀의 (x,y,z)를 그냥 색처럼 RGB565에 우겨넣는데,
        노멀은 길이가 1이어야 하는 ‘방향’이라 색 양자화가 방향을 비틀어 하이라이트가 계단처럼
        부서지고 전체에 녹색 끼가 돈다(초록만 6비트라 X·Z와 정밀도가 안 맞는다). <strong>BC5</strong>는
        반대로 <strong>x·y 두 채널만 8비트로</strong> 저장하고 z는 <em>z=√(1−x²−y²)</em>로
        그 자리에서 복원한다 — 저장 비트를 두 채널에 몰아주니 같은 용량에서 방향이 훨씬
        정확하고, 하이라이트가 매끈하다. 노멀맵에 BC5를 쓰는 이유가 이 한 장에 있다.
      </figcaption>
    </figure>
  );
}
