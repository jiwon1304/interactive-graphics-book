import { useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import {
  ControlPanel,
  Slider,
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

const LIT = '#e8b04a';
const SHADOW = '#5a4a8a';

const fragmentShader = /* glsl */ `
  ${FRAG_HEADER}

  uniform float uThreshold;  // step 임계
  uniform vec3  uLit;        // 밝은 면 색
  uniform vec3  uShadow;     // 어두운 면 색
  uniform float uShowMask;   // 1 = N·L 회색 마스크 오버레이

  void main() {
    float ndl = lambertNdotL();

    if (uShowMask > 0.5) {
      // 연속 N·L 그 자체(흑백). 양자화 전의 raw 입력.
      fragColor = vec4(vec3(ndl), 1.0);
      return;
    }

    // 임계 하나로 명/암 두 면만. s = 0 또는 1.
    float s = step(uThreshold, ndl);
    vec3 col = mix(uShadow, uLit, s);
    fragColor = vec4(col, 1.0);
  }
`;

interface ShadeProps {
  threshold: number;
  azimuth: number;
  showMask: boolean;
}

function Shaded({ threshold, azimuth, showMask, shape }: ShadeProps & { shape: ShapeKind }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX_SHADER,
        fragmentShader,
        uniforms: {
          uLightDir: { value: new THREE.Vector3(1, 0.5, 0.6) },
          uThreshold: { value: 0.5 },
          uLit: { value: new THREE.Vector3(...hexToSRGB(LIT)) },
          uShadow: { value: new THREE.Vector3(...hexToSRGB(SHADOW)) },
          uShowMask: { value: 0 },
        },
      }),
    [],
  );

  useFrame(() => {
    const u = material.uniforms;
    u.uThreshold.value = threshold;
    u.uShowMask.value = showMask ? 1 : 0;
    (u.uLightDir.value as THREE.Vector3).copy(lightDirFromAngles(azimuth, 25));
  });

  return (
    <ToonShape shape={shape}>
      <primitive object={material} attach="material" />
    </ToonShape>
  );
}

/**
 * 위젯 1 — Hard step toon.
 * step(threshold, N·L) 하나로 표면을 명/암 두 면으로 끊는다. 임계를 옮기면
 * 명암 경계(terminator)가 표면 위를 미끄러진다. 마스크 토글로 양자화 전의
 * 연속 N·L(흑백)을 보여 "무엇을 끊고 있는지" 드러낸다 — 과정 위젯.
 */
export default function HardStepToon() {
  const [threshold, setThreshold] = useState(0.5);
  const [azimuth, setAzimuth] = useState(40);
  const [showMask, setShowMask] = useState(false);
  const [shape, setShape] = useState<ShapeKind>('sphere');

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={360}>
        <Shaded threshold={threshold} azimuth={azimuth} showMask={showMask} shape={shape} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <Slider
          label="step 임계 (threshold)"
          value={threshold}
          min={0}
          max={1}
          step={0.01}
          onChange={setThreshold}
          format={(v) => v.toFixed(2)}
        />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
        <ToggleControl label="N·L 마스크(흑백) 보기" checked={showMask} onChange={setShowMask} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 임계 슬라이더를 움직이면 명암 경계가 표면을 가로질러
        이동합니다. 임계가 클수록 빛이 정면으로 맞는 좁은 영역만 밝아집니다. 마스크 토글을 켜면
        끊기 전의 연속 N·L(흑백 그라디언트)이 보입니다 — step은 그 위에 임계선 하나를 긋는 것뿐입니다.
      </figcaption>
    </figure>
  );
}
