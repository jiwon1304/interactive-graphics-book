import { useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../DemoCanvas';
import {
  ControlPanel,
  Slider,
  ColorControl,
  ToggleControl,
  SelectControl,
  type SelectOption,
} from '../controls';

// 표시(보기) 모드: 전체 BRDF 또는 개별 항(D/G/F)만 흑백으로 시각화.
type ViewMode = 'full' | 'D' | 'G' | 'F';
const VIEW_OPTIONS: ReadonlyArray<SelectOption<ViewMode>> = [
  { value: 'full', label: '전체 BRDF' },
  { value: 'D', label: '분포항 D (GGX)' },
  { value: 'G', label: '기하감쇠 G (Smith)' },
  { value: 'F', label: '프레넬 F (Schlick)' },
];

const MODE_INDEX: Record<ViewMode, number> = { full: 0, D: 1, G: 2, F: 3 };

// '#rrggbb' → 선형 공간 RGB. type=color 입력은 sRGB이므로 셰이딩 전에 선형화.
const _scratchColor = new THREE.Color();
function hexToLinearRGB(hex: string): [number, number, number] {
  // type=color 입력은 sRGB이므로 셰이딩 전에 선형 공간으로 변환
  _scratchColor.set(hex).convertSRGBToLinear();
  return [_scratchColor.r, _scratchColor.g, _scratchColor.b];
}

const vertexShader = /* glsl */ `
  out vec3 vWorldNormal;
  out vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  in vec3 vWorldNormal;
  in vec3 vWorldPos;

  out vec4 fragColor;

  uniform vec3  uBaseColor;   // 선형 공간 알베도
  uniform float uRoughness;
  uniform float uMetalness;
  uniform vec3  uLightDir;    // 표면 → 광원 방향 (정규화됨)
  uniform vec3  uCameraPos;
  uniform int   uViewMode;    // 0=full, 1=D, 2=G, 3=F
  uniform float uShowDiffuse; // 1.0 = 디퓨즈 포함, 0.0 = 스펙큘러만

  const float PI = 3.14159265359;

  // GGX / Trowbridge–Reitz 법선 분포 함수
  float distributionGGX(float NdotH, float alpha) {
    float a2 = alpha * alpha;
    float d  = NdotH * NdotH * (a2 - 1.0) + 1.0;
    return a2 / (PI * d * d);
  }

  // Schlick–GGX 단일 방향 항 (직접광 k 사용)
  float geometrySchlickGGX(float NdotX, float k) {
    return NdotX / (NdotX * (1.0 - k) + k);
  }

  // Smith: 마스킹(시선) + 섀도잉(광원)
  float geometrySmith(float NdotV, float NdotL, float k) {
    return geometrySchlickGGX(NdotV, k) * geometrySchlickGGX(NdotL, k);
  }

  // Schlick 프레넬
  vec3 fresnelSchlick(float VdotH, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - VdotH, 0.0, 1.0), 5.0);
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(V + L);

    float NdotL = max(dot(N, L), 1e-4);
    float NdotV = max(dot(N, V), 1e-4);
    float NdotH = max(dot(N, H), 0.0);
    float VdotH = max(dot(V, H), 0.0);

    // 거칠기 perceptual remap: alpha = roughness^2, 0 근처는 클램프
    float roughness = max(uRoughness, 0.02);
    float alpha = roughness * roughness;
    float k = (roughness + 1.0) * (roughness + 1.0) / 8.0; // 직접광용 k

    // Cook–Torrance 항들
    float D = distributionGGX(NdotH, alpha);
    float G = geometrySmith(NdotV, NdotL, k);
    vec3  F0 = mix(vec3(0.04), uBaseColor, uMetalness);
    vec3  F  = fresnelSchlick(VdotH, F0);

    // 개별 항 흑백 시각화 모드
    if (uViewMode == 1) {
      // D는 거칠기가 작을 때 값이 매우 커지므로 톤매핑으로 압축
      float d = D / (1.0 + D);
      fragColor = vec4(vec3(d), 1.0);
      return;
    }
    if (uViewMode == 2) {
      fragColor = vec4(vec3(G), 1.0);
      return;
    }
    if (uViewMode == 3) {
      // 금속 색조가 섞이므로 휘도로 환원해 흑백 표시
      float f = dot(F, vec3(0.299, 0.587, 0.114));
      fragColor = vec4(vec3(f), 1.0);
      return;
    }

    // 스펙큘러 (Cook–Torrance)
    vec3 numerator   = D * G * F;
    float denominator = 4.0 * NdotL * NdotV;
    vec3 specular = numerator / max(denominator, 1e-4);

    // 디퓨즈 (Lambert), 에너지/금속 보존
    vec3 kd = (1.0 - F) * (1.0 - uMetalness) * uShowDiffuse;
    vec3 diffuse = kd * uBaseColor / PI;

    // 단일 직접광, 광원 복사휘도 = 1
    vec3 Lo = (diffuse + specular) * NdotL;

    // 작은 ambient로 그림자 영역이 완전히 검게 죽지 않게
    Lo += uBaseColor * 0.03 * (1.0 - uMetalness);

    // 감마 보정 (선형 → sRGB)
    vec3 color = pow(Lo, vec3(1.0 / 2.2));
    fragColor = vec4(color, 1.0);
  }
`;

interface ShadedSphereProps {
  baseColor: string;
  roughness: number;
  metalness: number;
  azimuth: number; // 광원 방위각 (도)
  viewMode: ViewMode;
  showDiffuse: boolean;
}

/** 커스텀 GLSL3 셰이더로 직접 음영 계산하는 구. 반드시 <Canvas> 내부에서 렌더. */
function ShadedSphere({
  baseColor,
  roughness,
  metalness,
  azimuth,
  viewMode,
  showDiffuse,
}: ShadedSphereProps) {
  // 재질은 한 번만 생성하고, 매 프레임 uniform 값만 갱신한다.
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uBaseColor: { value: new THREE.Vector3(0.8, 0.1, 0.1) },
        uRoughness: { value: 0.3 },
        uMetalness: { value: 0.0 },
        uLightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
        uCameraPos: { value: new THREE.Vector3() },
        uViewMode: { value: 0 },
        uShowDiffuse: { value: 1.0 },
      },
    });
  }, []);

  useFrame(({ camera }) => {
    const u = material.uniforms;
    const [r, g, b] = hexToLinearRGB(baseColor);
    (u.uBaseColor.value as THREE.Vector3).set(r, g, b);
    u.uRoughness.value = roughness;
    u.uMetalness.value = metalness;
    u.uViewMode.value = MODE_INDEX[viewMode];
    u.uShowDiffuse.value = showDiffuse ? 1.0 : 0.0;

    // 방위각으로 수평 회전하는 광원 (약간 위에서 비춤)
    const phi = (azimuth * Math.PI) / 180;
    (u.uLightDir.value as THREE.Vector3)
      .set(Math.cos(phi), 0.6, Math.sin(phi))
      .normalize();

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
 * 마이크로패싯 BRDF (Cook–Torrance) 인터랙티브 데모.
 * roughness/metalness/광원 방위각을 조절하고, 표시 모드로 D·G·F 항을 분해해 본다.
 */
export default function MicrofacetBRDF() {
  const [baseColor, setBaseColor] = useState('#c81e1e');
  const [roughness, setRoughness] = useState(0.3);
  const [metalness, setMetalness] = useState(0.0);
  const [azimuth, setAzimuth] = useState(45);
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  const [showDiffuse, setShowDiffuse] = useState(true);

  const diffuseDisabled = viewMode !== 'full';

  return (
    <figure className="demo">
      {/* 셰이더가 직접 조명을 계산하므로 DemoCanvas의 기본 조명은 끈다. */}
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]}>
        <ShadedSphere
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
        <SelectControl
          label="표시 모드"
          value={viewMode}
          options={VIEW_OPTIONS}
          onChange={setViewMode}
        />
        <Slider
          label="거칠기 (roughness)"
          value={roughness}
          min={0.02}
          max={1}
          step={0.01}
          onChange={setRoughness}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          label="금속성 (metalness)"
          value={metalness}
          min={0}
          max={1}
          step={0.01}
          onChange={setMetalness}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          label="광원 방위각"
          value={azimuth}
          min={0}
          max={360}
          step={1}
          onChange={setAzimuth}
          unit="°"
        />
        <ColorControl label="기본색 (albedo / F0)" value={baseColor} onChange={setBaseColor} />
        <ToggleControl
          label="디퓨즈 포함"
          checked={showDiffuse}
          onChange={setShowDiffuse}
        />
      </ControlPanel>

      <figcaption>
        드래그로 카메라 회전, 두 손가락으로 확대/축소. 거칠기·금속성·광원 방위각을 바꿔 하이라이트가
        어떻게 변하는지 보세요. 표시 모드를 <strong>D·G·F</strong>로 바꾸면 각 항이 구 표면에서 어떻게
        분포하는지 흑백으로 확인할 수 있습니다.
      </figcaption>
    </figure>
  );
}
