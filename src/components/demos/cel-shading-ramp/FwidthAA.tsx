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

type EdgeMode = 'hard' | 'fixed' | 'fwidth';
const EDGE_OPTIONS: ReadonlyArray<SelectOption<EdgeMode>> = [
  { value: 'hard', label: 'hard step (계단)' },
  { value: 'fixed', label: 'smoothstep 고정폭' },
  { value: 'fwidth', label: 'smoothstep + fwidth' },
];
const EDGE_INDEX: Record<EdgeMode, number> = { hard: 0, fixed: 1, fwidth: 2 };

const LIT = 0.92;
const SHADOW = 0.18;

const fragmentShader = /* glsl */ `
  ${FRAG_HEADER}

  uniform int   uMode;       // 0 hard, 1 fixed-width smoothstep, 2 fwidth smoothstep
  uniform float uThreshold;  // 경계 임계
  uniform float uFixedW;     // 고정 폭(반폭)
  uniform float uLit;
  uniform float uShadow;

  void main() {
    float x = lambertNdotL();
    float t = uThreshold;
    float s;

    if (uMode == 0) {
      s = step(t, x);
    } else if (uMode == 1) {
      // 고정 폭: N·L 값 공간에서 일정 → 화면에서는 곡률/줌에 따라 들쭉날쭉
      float w = uFixedW;
      s = smoothstep(t - w, t + w, x);
    } else {
      // fwidth: 한 픽셀당 x의 변화율 → 화면공간 약 1픽셀 폭으로 일정
      float w = fwidth(x);
      s = smoothstep(t - w, t + w, x);
    }

    float v = mix(uShadow, uLit, s);
    fragColor = vec4(vec3(v), 1.0);
  }
`;

function Shaded({
  mode,
  threshold,
  fixedW,
  azimuth,
  shape,
}: {
  mode: EdgeMode;
  threshold: number;
  fixedW: number;
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
          uMode: { value: 0 },
          uThreshold: { value: 0.5 },
          uFixedW: { value: 0.03 },
          uLit: { value: LIT },
          uShadow: { value: SHADOW },
        },
      }),
    [],
  );

  useFrame(() => {
    const u = material.uniforms;
    u.uMode.value = EDGE_INDEX[mode];
    u.uThreshold.value = threshold;
    u.uFixedW.value = fixedW;
    (u.uLightDir.value as THREE.Vector3).copy(lightDirFromAngles(azimuth, 18));
  });

  return (
    <ToonShape shape={shape}>
      <primitive object={material} attach="material" />
    </ToonShape>
  );
}

/**
 * 위젯 6 — fwidth 경계 안티앨리어싱.
 * hard step / 고정폭 smoothstep / fwidth smoothstep 세 방식을 바꾸며, 카메라를
 * 줌인/아웃했을 때 경계의 품질(계단·일정폭)을 비교 — 과정 위젯.
 */
export default function FwidthAA() {
  const [mode, setMode] = useState<EdgeMode>('hard');
  const [threshold, setThreshold] = useState(0.5);
  const [fixedW, setFixedW] = useState(0.03);
  const [azimuth, setAzimuth] = useState(40);
  const [shape, setShape] = useState<ShapeKind>('sphere');

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={380}>
        <Shaded mode={mode} threshold={threshold} fixedW={fixedW} azimuth={azimuth} shape={shape} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <SelectControl label="경계 방식" value={mode} options={EDGE_OPTIONS} onChange={setMode} />
        <Slider label="경계 임계" value={threshold} min={0.1} max={0.9} step={0.01} onChange={setThreshold} format={(v) => v.toFixed(2)} />
        <Slider
          label="고정폭(반폭)"
          value={fixedW}
          min={0.005}
          max={0.12}
          step={0.005}
          onChange={setFixedW}
          format={(v) => v.toFixed(3)}
        />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 먼저 "hard step"에서 경계를 보세요 — 비스듬한 면이나 줌아웃
        시 들쭉날쭉한 계단(aliasing)이 보입니다. "smoothstep 고정폭"은 매끈해지지만 폭이 N·L 값
        공간에서 일정해서, 곡률이 완만한 곳·줌인 시 경계가 너무 넓어지거나 가늘어집니다. "fwidth"는
        한 픽셀당 N·L 변화율로 폭을 잡아 <strong>화면공간에서 약 1픽셀 폭</strong>으로 일정합니다 —
        두 손가락/휠로 줌인·아웃해도 경계 두께가 유지됩니다.
      </figcaption>
    </figure>
  );
}
