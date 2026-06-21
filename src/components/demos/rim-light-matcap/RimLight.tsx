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
  { value: 'sphere', label: '구' },
  { value: 'torus', label: '토러스' },
  { value: 'knot', label: '매듭' },
];

const fragmentShader = /* glsl */ `
  ${FRAG_HEADER}

  uniform vec3  uBase;       // 본체 색
  uniform vec3  uRimColor;   // 림 색
  uniform float uPower;      // 프레넬 지수(가장자리 집중도)
  uniform float uIntensity;  // 림 세기
  uniform float uLightDriven;// 1 = 광원 반대쪽(역광)에만 림
  uniform float uShowFresnel;// 1 = 프레넬 마스크(흑백)만

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    float fres = 1.0 - max(0.0, dot(N, V));   // 가장자리 → 1
    float rim = pow(fres, uPower);

    if (uShowFresnel > 0.5) {
      fragColor = vec4(vec3(rim), 1.0);
      return;
    }

    // 본체: 3밴드 toon
    float ndl = lambertNdotL();
    float band = clamp(floor(ndl * 3.0), 0.0, 2.0) / 2.0;
    vec3 body = uBase * (0.42 + 0.58 * band);

    // 광원 의존: 빛을 등진 면일수록 림을 강하게(역광 느낌)
    float lit = max(0.0, dot(N, normalize(uLightDir)));
    float mask = mix(1.0, smoothstep(0.6, 0.0, lit), uLightDriven);

    vec3 col = body + uRimColor * (rim * uIntensity * mask);
    fragColor = vec4(col, 1.0);
  }
`;

interface Props {
  base: string;
  rimColor: string;
  power: number;
  intensity: number;
  lightDriven: boolean;
  showFresnel: boolean;
  azimuth: number;
  shape: ShapeKind;
}

function Scene({ base, rimColor, power, intensity, lightDriven, showFresnel, azimuth, shape }: Props) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX_SHADER,
        fragmentShader,
        uniforms: {
          uLightDir: { value: new THREE.Vector3(1, 0.5, 0.6) },
          uBase: { value: new THREE.Vector3(...hexToSRGB('#7088c8')) },
          uRimColor: { value: new THREE.Vector3(...hexToSRGB('#bfe8ff')) },
          uPower: { value: 3 },
          uIntensity: { value: 1 },
          uLightDriven: { value: 1 },
          uShowFresnel: { value: 0 },
        },
      }),
    [],
  );

  useFrame(() => {
    const u = material.uniforms;
    (u.uBase.value as THREE.Vector3).set(...hexToSRGB(base));
    (u.uRimColor.value as THREE.Vector3).set(...hexToSRGB(rimColor));
    u.uPower.value = power;
    u.uIntensity.value = intensity;
    u.uLightDriven.value = lightDriven ? 1 : 0;
    u.uShowFresnel.value = showFresnel ? 1 : 0;
    (u.uLightDir.value as THREE.Vector3).copy(lightDirFromAngles(azimuth, 22));
  });

  return (
    <ToonShape shape={shape}>
      <primitive object={material} attach="material" />
    </ToonShape>
  );
}

/**
 * 위젯 — 림 라이트(프레넬 기반).
 * rim = pow(1 - max(0, N·V), power). 시선과 표면이 스칠수록(가장자리) 1에 가까워져 윤곽이 빛난다.
 * "프레넬 마스크"로 끊기 전의 1-N·V를, "광원 의존"으로 역광 위치에만 림을 거는 동작을 본다.
 */
export default function RimLight() {
  const [base, setBase] = useState('#7088c8');
  const [rimColor, setRimColor] = useState('#bfe8ff');
  const [power, setPower] = useState(3);
  const [intensity, setIntensity] = useState(1);
  const [lightDriven, setLightDriven] = useState(true);
  const [showFresnel, setShowFresnel] = useState(false);
  const [azimuth, setAzimuth] = useState(210);
  const [shape, setShape] = useState<ShapeKind>('knot');

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={360}>
        <Scene
          base={base}
          rimColor={rimColor}
          power={power}
          intensity={intensity}
          lightDriven={lightDriven}
          showFresnel={showFresnel}
          azimuth={azimuth}
          shape={shape}
        />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <Slider label="프레넬 지수 (power)" value={power} min={1} max={8} step={0.1} onChange={setPower} format={(v) => v.toFixed(1)} />
        <Slider label="림 세기" value={intensity} min={0} max={2} step={0.05} onChange={setIntensity} format={(v) => v.toFixed(2)} />
        <ColorControl label="본체 색" value={base} onChange={setBase} />
        <ColorControl label="림 색" value={rimColor} onChange={setRimColor} />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
        <ToggleControl label="광원 의존(역광에만 림)" checked={lightDriven} onChange={setLightDriven} />
        <ToggleControl label="프레넬 마스크(흑백) 보기" checked={showFresnel} onChange={setShowFresnel} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> power를 올리면 빛나는 띠가 윤곽선 쪽으로 가늘게 몰립니다.
        "프레넬 마스크"를 켜면 끊기 전의 <em>1 − N·V</em>(가장자리일수록 흰색)가 보입니다. "광원
        의존"을 켜고 방위각을 돌리면, 림이 빛을 등진 쪽에만 남아 역광(back light) 느낌이 납니다.
      </figcaption>
    </figure>
  );
}
