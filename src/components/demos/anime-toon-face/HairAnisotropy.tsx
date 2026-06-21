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
import ToonShape from '../cel-shading-ramp/ToonShape';
import {
  VERTEX_SHADER,
  FRAG_HEADER,
  lightDirFromAngles,
  hexToSRGB,
  type ShapeKind,
} from '../cel-shading-ramp/shared';

const SHAPE_OPTIONS: ReadonlyArray<SelectOption<ShapeKind>> = [
  { value: 'sphere', label: '구(머리)' },
  { value: 'torus', label: '토러스' },
  { value: 'knot', label: '매듭' },
];

const fragmentShader = /* glsl */ `
  ${FRAG_HEADER}

  uniform vec3  uBase;
  uniform vec3  uSpecColor;
  uniform float uExp;        // 하이라이트 날카로움
  uniform float uShift;      // 띠 위치 이동
  uniform float uIntensity;
  uniform float uToon;       // 1 = 띠를 하드하게(step)
  uniform float uSecond;     // 1 = 보조 띠 추가

  // Kajiya–Kay: 머리카락 접선 T 기준의 비등방 스페큘러.
  float strandSpec(vec3 T, vec3 H, float e) {
    float dotTH = dot(T, H);
    float sinTH = sqrt(max(0.0, 1.0 - dotTH * dotTH));
    return pow(sinTH, e);
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);

    // 머리카락 흐름(대략 세로) → 접선은 N과 up의 외적(머리를 두르는 가로 띠)
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 T = normalize(cross(N, up) + 1e-5);

    // 접선을 법선 쪽으로 기울여 띠 위치를 이동(angel ring 트릭)
    vec3 T1 = normalize(T + N * uShift);
    float s1 = strandSpec(T1, H, uExp);

    float spec = s1;
    if (uSecond > 0.5) {
      vec3 T2 = normalize(T + N * (uShift - 0.35));
      spec = max(spec, strandSpec(T2, H, uExp * 1.6) * 0.6);
    }

    if (uToon > 0.5) spec = smoothstep(0.45, 0.5, spec); // 또렷한 띠

    // 본체: 2밴드 toon
    float ndl = lambertNdotL();
    float band = step(0.5, ndl);
    vec3 body = uBase * (0.5 + 0.5 * band);

    // 스페큘러는 빛 받는 쪽에서만
    float lit = step(0.04, ndl);
    vec3 col = body + uSpecColor * (spec * uIntensity * lit);
    fragColor = vec4(col, 1.0);
  }
`;

interface Props {
  base: string;
  spec: string;
  exp: number;
  shift: number;
  intensity: number;
  toon: boolean;
  second: boolean;
  azimuth: number;
  shape: ShapeKind;
}

function Scene(p: Props) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX_SHADER,
        fragmentShader,
        uniforms: {
          uLightDir: { value: new THREE.Vector3(1, 0.5, 0.6) },
          uBase: { value: new THREE.Vector3(...hexToSRGB('#54506e')) },
          uSpecColor: { value: new THREE.Vector3(...hexToSRGB('#dcd3ff')) },
          uExp: { value: 40 },
          uShift: { value: 0.2 },
          uIntensity: { value: 1 },
          uToon: { value: 1 },
          uSecond: { value: 1 },
        },
      }),
    [],
  );

  useFrame(() => {
    const u = material.uniforms;
    (u.uBase.value as THREE.Vector3).set(...hexToSRGB(p.base));
    (u.uSpecColor.value as THREE.Vector3).set(...hexToSRGB(p.spec));
    u.uExp.value = p.exp;
    u.uShift.value = p.shift;
    u.uIntensity.value = p.intensity;
    u.uToon.value = p.toon ? 1 : 0;
    u.uSecond.value = p.second ? 1 : 0;
    (u.uLightDir.value as THREE.Vector3).copy(lightDirFromAngles(p.azimuth, 30));
  });

  return (
    <ToonShape shape={p.shape}>
      <primitive object={material} attach="material" />
    </ToonShape>
  );
}

/**
 * 위젯 — 애니 머리카락 하이라이트(Kajiya–Kay 비등방 + angel ring).
 * 머리카락은 가닥 방향(접선) 기준의 비등방 스페큘러로, 머리를 두르는 띠가 생긴다. 접선을 법선쪽으로
 * 기울여 띠를 이동하고, toon-step으로 또렷하게, 보조 띠를 더해 만화풍 "천사 고리"를 만든다.
 */
export default function HairAnisotropy() {
  const [base, setBase] = useState('#54506e');
  const [spec, setSpec] = useState('#dcd3ff');
  const [exp, setExp] = useState(40);
  const [shift, setShift] = useState(0.2);
  const [intensity, setIntensity] = useState(1);
  const [toon, setToon] = useState(true);
  const [second, setSecond] = useState(true);
  const [azimuth, setAzimuth] = useState(40);
  const [shape, setShape] = useState<ShapeKind>('sphere');

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={360}>
        <Scene base={base} spec={spec} exp={exp} shift={shift} intensity={intensity} toon={toon} second={second} azimuth={azimuth} shape={shape} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <Slider label="하이라이트 날카로움 (exp)" value={exp} min={4} max={120} step={1} onChange={setExp} />
        <Slider label="띠 위치 shift" value={shift} min={-0.6} max={0.6} step={0.01} onChange={setShift} format={(v) => v.toFixed(2)} />
        <Slider label="세기" value={intensity} min={0} max={2} step={0.05} onChange={setIntensity} format={(v) => v.toFixed(2)} />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
        <ColorControl label="머리 색" value={base} onChange={setBase} />
        <ColorControl label="하이라이트 색" value={spec} onChange={setSpec} />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
        <ToggleControl label="또렷한 띠(toon step)" checked={toon} onChange={setToon} />
        <ToggleControl label="보조 띠(angel ring)" checked={second} onChange={setSecond} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> shift로 띠를 머리 위아래로 옮기고, exp로 가늘기를 조절하세요.
        "또렷한 띠"를 끄면 부드러운 비등방 하이라이트(실사 머리카락), 켜면 만화풍의 또렷한 띠가 됩니다.
        "보조 띠"가 두 줄의 "천사 고리"를 만듭니다 — 애니 머리카락의 상징입니다.
      </figcaption>
    </figure>
  );
}
