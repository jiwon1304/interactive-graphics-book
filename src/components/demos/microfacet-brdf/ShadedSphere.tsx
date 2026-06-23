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
import { hexToLinearRGB } from './shared';
import { VERTEX_SHADER, BRDF_COMMON } from './microfacet.glsl';

// 표시 모드: 전체 또는 D/G/F 항을 흑백으로.
type ViewMode = 'full' | 'D' | 'G' | 'F';
const VIEW_OPTIONS: ReadonlyArray<SelectOption<ViewMode>> = [
  { value: 'full', label: '전체 BRDF' },
  { value: 'D', label: '분포항 D (GGX)' },
  { value: 'G', label: '기하감쇠 G (Smith)' },
  { value: 'F', label: '프레넬 F (Schlick)' },
];
const MODE_INDEX: Record<ViewMode, number> = { full: 0, D: 1, G: 2, F: 3 };

const fragmentShader = /* glsl */ `
  ${BRDF_COMMON}

  uniform int   uViewMode;    // 0=full, 1=D, 2=G, 3=F
  uniform float uShowDiffuse; // 1.0 = 디퓨즈 포함

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(V + L);

    float NdotL = max(dot(N, L), 1e-4);
    float NdotV = max(dot(N, V), 1e-4);
    float NdotH = max(dot(N, H), 0.0);
    float VdotH = max(dot(V, H), 0.0);

    float roughness = max(uRoughness, 0.02);
    float alpha = roughness * roughness;
    float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;

    float D = distributionGGX(NdotH, alpha);
    float G = geometrySmith(NdotV, NdotL, k);
    vec3  F0 = mix(vec3(0.04), uBaseColor, uMetalness);
    vec3  F  = fresnelSchlick(VdotH, F0);

    // 개별 항 흑백 시각화
    if (uViewMode == 1) {
      float d = D / (1.0 + D); // 톤매핑으로 큰 값 압축
      fragColor = vec4(vec3(d), 1.0);
      return;
    }
    if (uViewMode == 2) {
      fragColor = vec4(vec3(G), 1.0);
      return;
    }
    if (uViewMode == 3) {
      float f = dot(F, vec3(0.299, 0.587, 0.114));
      fragColor = vec4(vec3(f), 1.0);
      return;
    }

    // 스펙큘러 (Cook–Torrance)
    vec3 specular = (D * G * F) / max(4.0 * NdotL * NdotV, 1e-4);

    // 디퓨즈 (에너지/금속 보존)
    vec3 kd = (1.0 - F) * (1.0 - uMetalness) * uShowDiffuse;
    vec3 diffuse = kd * uBaseColor / PI;

    vec3 Lo = (diffuse + specular) * NdotL;
    Lo += uBaseColor * 0.03 * (1.0 - uMetalness); // 약한 ambient

    vec3 color = pow(Lo, vec3(1.0 / 2.2));
    fragColor = vec4(color, 1.0);
  }
`;

interface SphereProps {
  baseColor: string;
  roughness: number;
  metalness: number;
  azimuth: number;
  viewMode: ViewMode;
  showDiffuse: boolean;
}

function FullSphere({ baseColor, roughness, metalness, azimuth, viewMode, showDiffuse }: SphereProps) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX_SHADER,
        fragmentShader,
        uniforms: {
          uBaseColor: { value: new THREE.Vector3(0.8, 0.1, 0.1) },
          uRoughness: { value: 0.3 },
          uMetalness: { value: 0.0 },
          uLightDir: { value: new THREE.Vector3(1, 0.6, 1).normalize() },
          uCameraPos: { value: new THREE.Vector3() },
          uViewMode: { value: 0 },
          uShowDiffuse: { value: 1.0 },
        },
      }),
    [],
  );

  useFrame(({ camera }) => {
    const u = material.uniforms;
    const [r, g, b] = hexToLinearRGB(baseColor);
    (u.uBaseColor.value as THREE.Vector3).set(r, g, b);
    u.uRoughness.value = roughness;
    u.uMetalness.value = metalness;
    u.uViewMode.value = MODE_INDEX[viewMode];
    u.uShowDiffuse.value = showDiffuse ? 1.0 : 0.0;
    const phi = (azimuth * Math.PI) / 180;
    (u.uLightDir.value as THREE.Vector3).set(Math.cos(phi), 0.6, Math.sin(phi)).normalize();
    (u.uCameraPos.value as THREE.Vector3).copy(camera.position);
  });

  return (
    <mesh>
      <sphereGeometry args={[1.3, 96, 96]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * 위젯 G — 완성된 Cook–Torrance 구(샌드박스).
 * 기본색·거칠기·금속성·광원·디퓨즈 토글을 모두 자유롭게 조절하고,
 * 표시 모드로 D·G·F 항을 구 표면 위에서 흑백으로 확인한다.
 */
export default function ShadedSphere() {
  const [baseColor, setBaseColor] = useState('#c81e1e');
  const [roughness, setRoughness] = useState(0.3);
  const [metalness, setMetalness] = useState(0.0);
  const [azimuth, setAzimuth] = useState(45);
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  const [showDiffuse, setShowDiffuse] = useState(true);

  const diffuseDisabled = viewMode !== 'full';

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={360}>
        <FullSphere
          baseColor={baseColor}
          roughness={roughness}
          metalness={metalness}
          azimuth={azimuth}
          viewMode={viewMode}
          showDiffuse={showDiffuse && !diffuseDisabled}
        />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <SelectControl label="표시 모드" value={viewMode} options={VIEW_OPTIONS} onChange={setViewMode} />
        <Slider label="거칠기 (roughness)" value={roughness} min={0.02} max={1} step={0.01} onChange={setRoughness} format={(v) => v.toFixed(2)} />
        <Slider label="금속성 (metalness)" value={metalness} min={0} max={1} step={0.01} onChange={setMetalness} format={(v) => v.toFixed(2)} />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
        <ColorControl label="기본색 (albedo / F0)" value={baseColor} onChange={setBaseColor} />
        <ToggleControl label="디퓨즈 포함" checked={showDiffuse} onChange={setShowDiffuse} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 이제 모든 파라미터를 자유롭게 조정하세요. 거칠기를 키우면 하이라이트가
        번지고(D), 가장자리가 덜 타며(G), 금속성을 올리면 디퓨즈가 사라지고 반사가 기본색으로
        물듭니다(F). 표시 모드를 <code>D·G·F</code>로 바꾸면 각 항이 구 표면에서 어떻게 분포하는지
        흑백으로 보입니다.
      </figcaption>
    </figure>
  );
}
