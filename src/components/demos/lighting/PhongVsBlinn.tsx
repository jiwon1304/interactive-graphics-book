import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import {
  ControlPanel,
  Slider,
  SelectControl,
  ToggleControl,
  type SelectOption,
} from '../../controls';
import { hexToLinearRGB, type ShapeKind } from './shared';
import LightShape from './LightShape';
import { VERTEX_SHADER, FRAG_HEADER } from './lighting.glsl';

type Model = 'lambert' | 'phong' | 'blinn';
const MODEL_OPTIONS: ReadonlyArray<SelectOption<Model>> = [
  { value: 'lambert', label: 'Lambert (diffuse만)' },
  { value: 'phong', label: 'Phong (reflect 벡터)' },
  { value: 'blinn', label: 'Blinn-Phong (half 벡터)' },
];
const MODEL_FLAG: Record<Model, number> = { lambert: 0, phong: 1, blinn: 2 };

const SHAPE_OPTIONS: ReadonlyArray<SelectOption<ShapeKind>> = [
  { value: 'sphere', label: '구' },
  { value: 'torus', label: '토러스' },
  { value: 'knot', label: '매듭' },
];

const fragmentShader = /* glsl */ `
  ${FRAG_HEADER}

  uniform vec3  uBaseColor;
  uniform vec3  uLightDir;   // 표면 → 광원
  uniform vec3  uCameraPos;
  uniform float uShininess;
  uniform float uAmbient;
  uniform int   uModel;      // 0=lambert 1=phong 2=blinn
  uniform float uShowCutoff; // 1이면 Phong specular=0 영역을 빨갛게 표시

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 L = normalize(uLightDir);

    float NdotL = max(dot(N, L), 0.0);
    vec3 diffuse = uBaseColor * NdotL;

    float spec = 0.0;
    bool cutoff = false;
    if (uModel == 1) {
      // Phong: R = reflect(-L, N), spec = (R·V)^s
      vec3 R = reflect(-L, N);
      float RdotV = dot(R, V);
      cutoff = (RdotV <= 0.0);              // 90°를 넘으면 specular가 끊긴다
      spec = pow(max(RdotV, 0.0), uShininess);
    } else if (uModel == 2) {
      // Blinn-Phong: H = normalize(L+V), spec = (N·H)^s
      vec3 H = normalize(L + V);
      spec = pow(max(dot(N, H), 0.0), uShininess);
    }
    // specular는 빛이 닿는 면에서만
    spec *= step(0.0, dot(N, L));

    vec3 color = uBaseColor * uAmbient + diffuse + vec3(spec);

    if (uShowCutoff > 0.5 && cutoff && NdotL > 0.0) {
      // Phong cutoff 영역: 빛은 닿지만 R·V<0이라 하이라이트가 0인 곳
      color = mix(color, vec3(0.85, 0.15, 0.15), 0.45);
    }

    fragColor = vec4(toSRGB(color), 1.0);
  }
`;

interface MatProps {
  model: Model;
  shininess: number;
  ambient: number;
  baseColor: string;
  lightDeg: number;
  showCutoff: boolean;
}

function ShadedMaterial({ model, shininess, ambient, baseColor, lightDeg, showCutoff }: MatProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uBaseColor: { value: new THREE.Vector3(0.2, 0.5, 0.85) },
      uLightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
      uCameraPos: { value: new THREE.Vector3() },
      uShininess: { value: 32 },
      uAmbient: { value: 0.08 },
      uModel: { value: 2 },
      uShowCutoff: { value: 0 },
    }),
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX_SHADER,
        fragmentShader,
        uniforms,
      }),
    [uniforms],
  );

  useFrame(({ camera }) => {
    const u = uniforms;
    const [r, g, b] = hexToLinearRGB(baseColor);
    u.uBaseColor.value.set(r, g, b);
    u.uShininess.value = shininess;
    u.uAmbient.value = ambient;
    u.uModel.value = MODEL_FLAG[model];
    u.uShowCutoff.value = showCutoff ? 1 : 0;
    const phi = (lightDeg * Math.PI) / 180;
    u.uLightDir.value.set(Math.cos(phi), 0.55, Math.sin(phi)).normalize();
    u.uCameraPos.value.copy(camera.position);
    if (matRef.current) matRef.current.needsUpdate = false;
  });

  return <primitive object={material} ref={matRef} attach="material" />;
}

export default function PhongVsBlinn() {
  const [model, setModel] = useState<Model>('blinn');
  const [shininess, setShininess] = useState(24);
  const [ambient, setAmbient] = useState(0.08);
  const [lightDeg, setLightDeg] = useState(40);
  const [shape, setShape] = useState<ShapeKind>('sphere');
  const [baseColor] = useState('#3b7fd1');
  const [showCutoff, setShowCutoff] = useState(false);

  return (
    <figure className="demo">
      <DemoCanvas cameraPosition={[0, 0.6, 4]}>
        <LightShape shape={shape}>
          <ShadedMaterial
            model={model}
            shininess={shininess}
            ambient={ambient}
            baseColor={baseColor}
            lightDeg={lightDeg}
            showCutoff={showCutoff}
          />
        </LightShape>
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>
      <ControlPanel>
        <SelectControl label="모델" value={model} options={MODEL_OPTIONS} onChange={setModel} />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
        <Slider
          label="shininess (광택)"
          value={shininess}
          min={1}
          max={128}
          step={1}
          onChange={setShininess}
        />
        <Slider label="광원 방향" value={lightDeg} min={-180} max={180} step={1} onChange={setLightDeg} unit="°" />
        <Slider label="ambient" value={ambient} min={0} max={0.4} step={0.01} onChange={setAmbient} />
        <ToggleControl
          label="Phong cutoff 영역 표시"
          checked={showCutoff}
          onChange={setShowCutoff}
        />
      </ControlPanel>
      <figcaption>
        같은 장면을 세 모델로. Lambert는 하이라이트가 없고, Phong과 Blinn-Phong은 하이라이트를 더한다.
        shininess를 낮추고(예: 2~8) Phong을 고른 뒤 "cutoff 영역 표시"를 켜면, 빛은 닿지만 반사벡터
        R이 시점에서 90°를 넘어 하이라이트가 갑자기 0이 되는 띠(빨강)가 보인다. Blinn-Phong으로 바꾸면
        이 끊김이 사라진다. 같은 크기 하이라이트를 내려면 Blinn-Phong의 shininess를 Phong보다 크게
        잡아야 한다.
      </figcaption>
    </figure>
  );
}
