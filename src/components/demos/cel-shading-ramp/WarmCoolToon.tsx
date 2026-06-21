import { useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import {
  ControlPanel,
  Slider,
  ColorControl,
  ToggleControl,
  SelectControl,
  type SelectOption,
} from '../../controls';
import ToonShape from './ToonShape';
import {
  VERTEX_SHADER,
  FRAG_HEADER,
  lightDirFromAngles,
  hexToSRGB,
  type ShapeKind,
} from './shared';

const SHAPE_OPTIONS: ReadonlyArray<SelectOption<ShapeKind>> = [
  { value: 'sphere', label: '구' },
  { value: 'torus', label: '토러스' },
  { value: 'knot', label: '매듭' },
];

const WARM = '#e9a23b';
const COOL = '#4a5fae';

const fragmentShader = /* glsl */ `
  ${FRAG_HEADER}

  uniform vec3  uWarm;     // 하이라이트(따뜻한) 색
  uniform vec3  uCool;     // 그림자(차가운) 색
  uniform float uHueShift; // 1 = 색조 시프트, 0 = 밝기만(회색 보간)
  uniform float uBands;    // 밴드 수(0 = 연속)

  void main() {
    // Gooch 블렌드 인자 t = (1 + N·L)/2  ( = half-Lambert의 비제곱 형태)
    float t = (rawNdotL() + 1.0) * 0.5;

    if (uBands > 1.5) {
      float n = uBands;
      float q = min(floor(t * n), n - 1.0);
      t = q / (n - 1.0);
    }

    vec3 col;
    if (uHueShift > 0.5) {
      // 색조까지: cool ↔ warm 두 극 사이 보간
      col = mix(uCool, uWarm, t);
    } else {
      // 밝기만: 같은 두 색의 휘도만 보간(색조 차이 제거)
      float lc = dot(uCool, vec3(0.299, 0.587, 0.114));
      float lw = dot(uWarm, vec3(0.299, 0.587, 0.114));
      col = vec3(mix(lc, lw, t));
    }
    fragColor = vec4(col, 1.0);
  }
`;

function Shaded({
  warm,
  cool,
  hueShift,
  bands,
  azimuth,
  shape,
}: {
  warm: string;
  cool: string;
  hueShift: boolean;
  bands: number;
  azimuth: number;
  shape: ShapeKind;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX_SHADER,
        fragmentShader,
        uniforms: {
          uLightDir: { value: new THREE.Vector3(1, 0.4, 0.5) },
          uWarm: { value: new THREE.Vector3(...hexToSRGB(WARM)) },
          uCool: { value: new THREE.Vector3(...hexToSRGB(COOL)) },
          uHueShift: { value: 1 },
          uBands: { value: 4 },
        },
      }),
    [],
  );

  useFrame(() => {
    const u = material.uniforms;
    (u.uWarm.value as THREE.Vector3).set(...hexToSRGB(warm));
    (u.uCool.value as THREE.Vector3).set(...hexToSRGB(cool));
    u.uHueShift.value = hueShift ? 1 : 0;
    u.uBands.value = bands;
    (u.uLightDir.value as THREE.Vector3).copy(lightDirFromAngles(azimuth, 20));
  });

  return (
    <ToonShape shape={shape}>
      <primitive object={material} attach="material" />
    </ToonShape>
  );
}

/**
 * 위젯 5 — Warm–cool 색조 시프트(Gooch 계열).
 * 그림자=cool / 하이라이트=warm 두 극 lerp. "밝기만 vs 색조" 토글로 색조가 더해질 때
 * 형태 가독성이 어떻게 달라지는지 직접 비교 — 과정 위젯.
 */
export default function WarmCoolToon() {
  const [warm, setWarm] = useState(WARM);
  const [cool, setCool] = useState(COOL);
  const [hueShift, setHueShift] = useState(true);
  const [bands, setBands] = useState(4);
  const [azimuth, setAzimuth] = useState(60);
  const [shape, setShape] = useState<ShapeKind>('sphere');

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={360}>
        <Shaded
          warm={warm}
          cool={cool}
          hueShift={hueShift}
          bands={bands}
          azimuth={azimuth}
          shape={shape}
        />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <ColorControl label="하이라이트(따뜻한)" value={warm} onChange={setWarm} />
        <ColorControl label="그림자(차가운)" value={cool} onChange={setCool} />
        <ToggleControl label="색조 시프트 (끄면 밝기만)" checked={hueShift} onChange={setHueShift} />
        <Slider
          label="밴드 수 (0 = 연속)"
          value={bands}
          min={0}
          max={8}
          step={1}
          onChange={(v) => setBands(Math.round(v))}
          format={(v) => (v < 1.5 ? '연속' : `${Math.round(v)}`)}
        />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> "색조 시프트"를 껐다 켜 보세요. 끄면 같은 두 색의 휘도만
        보간되어 평범한 회색조 음영이 됩니다. 켜면 그림자 쪽이 차가운 색, 하이라이트 쪽이 따뜻한
        색으로 물들어 표면 방향이 밝기뿐 아니라 색조로도 읽힙니다(Gooch의 핵심). 블렌드 인자
        t=(1+N·L)/2 는 제곱하지 않은 Half-Lambert와 같은 식입니다.
      </figcaption>
    </figure>
  );
}
