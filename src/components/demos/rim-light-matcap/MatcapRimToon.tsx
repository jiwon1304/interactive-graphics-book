import { useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import {
  ControlPanel,
  Slider,
  ColorControl,
  SelectControl,
  type SelectOption,
} from '../../controls';
import ToonShape from '../cel-shading-ramp/ToonShape';
import { lightDirFromAngles, hexToSRGB, type ShapeKind } from '../cel-shading-ramp/shared';
import { makeMatcap, MATCAP_LABELS, type MatcapKind } from './matcaps';

const SHAPE_OPTIONS: ReadonlyArray<SelectOption<ShapeKind>> = [
  { value: 'sphere', label: '구' },
  { value: 'torus', label: '토러스' },
  { value: 'knot', label: '매듭' },
];

const MATCAP_OPTIONS: ReadonlyArray<SelectOption<MatcapKind>> = (
  Object.keys(MATCAP_LABELS) as MatcapKind[]
).map((k) => ({ value: k, label: MATCAP_LABELS[k] }));

const vertexShader = /* glsl */ `
  out vec3 vViewN;
  out vec3 vWorldN;
  out vec3 vWorldP;
  void main() {
    vViewN = normalize(normalMatrix * normal);
    vWorldN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldP = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  in vec3 vViewN;
  in vec3 vWorldN;
  in vec3 vWorldP;
  out vec4 fragColor;

  uniform sampler2D uMatcap;
  uniform vec3  uTint;
  uniform vec3  uRimColor;
  uniform float uPower;
  uniform float uIntensity;
  uniform vec3  uLightDir;

  void main() {
    vec2 uv = normalize(vViewN).xy * 0.5 + 0.5;
    vec3 base = texture(uMatcap, uv).rgb * uTint;

    vec3 N = normalize(vWorldN);
    vec3 V = normalize(cameraPosition - vWorldP);
    float rim = pow(1.0 - max(0.0, dot(N, V)), uPower);
    float lit = max(0.0, dot(N, normalize(uLightDir)));
    float mask = smoothstep(0.6, 0.0, lit); // 역광쪽

    fragColor = vec4(base + uRimColor * (rim * uIntensity * mask), 1.0);
  }
`;

interface Props {
  kind: MatcapKind;
  tint: string;
  rimColor: string;
  power: number;
  intensity: number;
  azimuth: number;
  shape: ShapeKind;
}

function Scene({ kind, tint, rimColor, power, intensity, azimuth, shape }: Props) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          uMatcap: { value: makeMatcap('clay') },
          uTint: { value: new THREE.Vector3(1, 1, 1) },
          uRimColor: { value: new THREE.Vector3(...hexToSRGB('#ffe8c0')) },
          uPower: { value: 3 },
          uIntensity: { value: 1 },
          uLightDir: { value: new THREE.Vector3(1, 0.5, 0.6) },
        },
      }),
    [],
  );

  useEffect(() => {
    const tex = makeMatcap(kind);
    const prev = material.uniforms.uMatcap.value as THREE.Texture | null;
    material.uniforms.uMatcap.value = tex;
    prev?.dispose();
  }, [kind, material]);

  useFrame(() => {
    const u = material.uniforms;
    (u.uTint.value as THREE.Vector3).set(...hexToSRGB(tint));
    (u.uRimColor.value as THREE.Vector3).set(...hexToSRGB(rimColor));
    u.uPower.value = power;
    u.uIntensity.value = intensity;
    (u.uLightDir.value as THREE.Vector3).copy(lightDirFromAngles(azimuth, 22));
  });

  return (
    <ToonShape shape={shape}>
      <primitive object={material} attach="material" />
    </ToonShape>
  );
}

/**
 * 위젯 — matcap + 림을 겹친 최종 룩.
 * matcap(뷰공간 재질 캡처)을 base로 깔고, 그 위에 월드공간 프레넬 림을 역광쪽에 더한다.
 * "조명 없는 base + 조명 의존 accent"라는 NPR의 흔한 레이어링.
 */
export default function MatcapRimToon() {
  const [kind, setKind] = useState<MatcapKind>('clay');
  const [tint, setTint] = useState('#ffd9c2');
  const [rimColor, setRimColor] = useState('#ffe8c0');
  const [power, setPower] = useState(3.5);
  const [intensity, setIntensity] = useState(1.1);
  const [azimuth, setAzimuth] = useState(210);
  const [shape, setShape] = useState<ShapeKind>('knot');

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={360}>
        <Scene kind={kind} tint={tint} rimColor={rimColor} power={power} intensity={intensity} azimuth={azimuth} shape={shape} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <SelectControl label="matcap base" value={kind} options={MATCAP_OPTIONS} onChange={setKind} />
        <ColorControl label="base 틴트" value={tint} onChange={setTint} />
        <ColorControl label="림 색" value={rimColor} onChange={setRimColor} />
        <Slider label="림 power" value={power} min={1} max={8} step={0.1} onChange={setPower} format={(v) => v.toFixed(1)} />
        <Slider label="림 세기" value={intensity} min={0} max={2} step={0.05} onChange={setIntensity} format={(v) => v.toFixed(2)} />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> matcap이 재질의 큰 그림(밝기 분포·질감)을 한 번에 주고, 그 위에
        역광 림이 윤곽을 분리합니다. base는 조명과 무관(뷰공간)하고 림만 광원을 따르므로, 방위각을
        돌리면 재질감은 고정된 채 가장자리 빛만 이동합니다 — 캐릭터 셰이딩에서 흔한 레이어링입니다.
      </figcaption>
    </figure>
  );
}
