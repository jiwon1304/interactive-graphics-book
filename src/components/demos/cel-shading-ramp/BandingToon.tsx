import { useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import {
  ControlPanel,
  Slider,
  SelectControl,
  type SelectOption,
} from '../../controls';
import { useCanvas2D } from '../microfacet-brdf/shared';
import ToonShape from './ToonShape';
import {
  VERTEX_SHADER,
  FRAG_HEADER,
  lightDirFromAngles,
  type ShapeKind,
} from './shared';

const SHAPE_OPTIONS: ReadonlyArray<SelectOption<ShapeKind>> = [
  { value: 'sphere', label: '구' },
  { value: 'torus', label: '토러스' },
  { value: 'knot', label: '매듭' },
];

const fragmentShader = /* glsl */ `
  ${FRAG_HEADER}

  uniform float uBands;  // 밴드 수 N

  void main() {
    float ndl = lambertNdotL();
    // floor(N·L * N) / (N-1) : N개의 계단으로 양자화, 최댓값이 1이 되도록 N-1로 나눔.
    float n = uBands;
    float q = floor(ndl * n);
    q = min(q, n - 1.0);
    float v = q / (n - 1.0);
    fragColor = vec4(vec3(v), 1.0);
  }
`;

function Shaded({ bands, azimuth, shape }: { bands: number; azimuth: number; shape: ShapeKind }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX_SHADER,
        fragmentShader,
        uniforms: {
          uLightDir: { value: new THREE.Vector3(1, 0.5, 0.6) },
          uBands: { value: 4 },
        },
      }),
    [],
  );

  useFrame(() => {
    const u = material.uniforms;
    u.uBands.value = bands;
    (u.uLightDir.value as THREE.Vector3).copy(lightDirFromAngles(azimuth, 25));
  });

  return (
    <ToonShape shape={shape}>
      <primitive object={material} attach="material" />
    </ToonShape>
  );
}

/** 연속 → 계단 막대. 왼쪽은 연속 N·L 그라디언트, 오른쪽은 N단 계단. */
function BandBar({ bands }: { bands: number }) {
  const ref = useCanvas2D(
    96,
    ({ ctx, width, height, colors }) => {
      const padL = 8;
      const padR = 8;
      const barW = width - padL - padR;
      const barTop = 22;
      const barH = height - barTop - 20;

      // 연속 그라디언트(위 절반)
      const contH = barH * 0.42;
      for (let x = 0; x < barW; x++) {
        const t = x / (barW - 1);
        const g = Math.round(t * 255);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(padL + x, barTop, 1, contH);
      }

      // 계단(아래 절반): floor(t*N)/(N-1)
      const stepTop = barTop + contH + 6;
      const stepH = barH - contH - 6;
      const n = bands;
      for (let x = 0; x < barW; x++) {
        const t = x / (barW - 1);
        let q = Math.floor(t * n);
        if (q > n - 1) q = n - 1;
        const v = q / (n - 1);
        const g = Math.round(v * 255);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(padL + x, stepTop, 1, stepH);
      }

      // 밴드 경계 눈금
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const x = padL + t * barW;
        ctx.beginPath();
        ctx.moveTo(x, stepTop);
        ctx.lineTo(x, stepTop + stepH);
        ctx.stroke();
      }

      // 라벨
      ctx.fillStyle = colors.muted;
      ctx.font =
        '12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('연속 N·L', padL, barTop - 8);
      ctx.fillText(`양자화 (N=${n})`, padL, stepTop + stepH + 15);
    },
    [bands],
  );

  return <canvas ref={ref} style={{ display: 'block', width: '100%' }} />;
}

/**
 * 위젯 2 — Quantized banding.
 * floor(N·L · N) / (N-1) 으로 음영을 N개의 띠로 끊는다. 옆 막대에서 연속
 * 그라디언트가 같은 규칙으로 계단이 되는 과정을 같이 보인다 — 과정 위젯.
 */
export default function BandingToon() {
  const [bands, setBands] = useState(4);
  const [azimuth, setAzimuth] = useState(40);
  const [shape, setShape] = useState<ShapeKind>('sphere');

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={340}>
        <Shaded bands={bands} azimuth={azimuth} shape={shape} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <BandBar bands={bands} />

      <ControlPanel>
        <Slider
          label="밴드 수 (N)"
          value={bands}
          min={2}
          max={8}
          step={1}
          onChange={(v) => setBands(Math.round(v))}
          format={(v) => `${Math.round(v)}`}
        />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 밴드 수 N을 2에서 8까지 올려 보세요. N=2면 명/암 두 면
        (위 위젯의 hard step과 같습니다). N을 키울수록 띠가 촘촘해지며 연속 음영에 가까워집니다.
        막대는 같은 규칙을 1차원에서 보여줍니다 — 위는 연속 N·L, 아래는 N단 계단.
      </figcaption>
    </figure>
  );
}
