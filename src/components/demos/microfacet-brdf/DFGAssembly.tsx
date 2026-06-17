import { useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider, SelectControl, type SelectOption } from '../../controls';
import { hexToLinearRGB } from './shared';
import { VERTEX_SHADER, BRDF_COMMON } from './microfacet.glsl';

// 조립 단계 프리셋: 어떤 항을 켤지 결정.
type Stage = 'D' | 'DG' | 'DGF';
const STAGE_OPTIONS: ReadonlyArray<SelectOption<Stage>> = [
  { value: 'D', label: 'D만 (분포)' },
  { value: 'DG', label: 'D × G (분포 × 기하)' },
  { value: 'DGF', label: 'D × G × F (완성)' },
];
const STAGE_FLAGS: Record<Stage, [number, number, number]> = {
  D: [1, 0, 0],
  DG: [1, 1, 0],
  DGF: [1, 1, 1],
};

const fragmentShader = /* glsl */ `
  ${BRDF_COMMON}

  uniform float uUseD;
  uniform float uUseG;
  uniform float uUseF;

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

    // 실제 항 계산
    float D = distributionGGX(NdotH, alpha);
    float G = geometrySmith(NdotV, NdotL, k);
    vec3  F0 = mix(vec3(0.04), uBaseColor, uMetalness);
    vec3  F  = fresnelSchlick(VdotH, F0);

    // 항을 끄면 1.0로 대체 → 각 항의 기여가 나타났다 사라지는 걸 본다.
    float Dt = mix(1.0, D, uUseD);
    float Gt = mix(1.0, G, uUseG);
    vec3  Ft = mix(vec3(1.0), F, uUseF);

    // 분모는 항상 유지(D 단독도 화면에 담기게 bounded).
    vec3 specular = (Dt * Gt * Ft) / max(4.0 * NdotL * NdotV, 1e-4);

    // 조립 과정에 집중하기 위해 디퓨즈는 약하게만(형태가 보이도록).
    vec3 ambientDiff = uBaseColor * 0.05;
    vec3 Lo = specular * NdotL + ambientDiff;

    vec3 color = pow(Lo, vec3(1.0 / 2.2));
    fragColor = vec4(color, 1.0);
  }
`;

interface SphereProps {
  baseColor: string;
  roughness: number;
  metalness: number;
  azimuth: number;
  flags: [number, number, number];
}

function AssemblySphere({ baseColor, roughness, metalness, azimuth, flags }: SphereProps) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX_SHADER,
        fragmentShader,
        uniforms: {
          uBaseColor: { value: new THREE.Vector3(0.95, 0.78, 0.25) },
          uRoughness: { value: 0.3 },
          uMetalness: { value: 1.0 },
          uLightDir: { value: new THREE.Vector3(1, 0.6, 1).normalize() },
          uCameraPos: { value: new THREE.Vector3() },
          uUseD: { value: 1 },
          uUseG: { value: 0 },
          uUseF: { value: 0 },
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
    u.uUseD.value = flags[0];
    u.uUseG.value = flags[1];
    u.uUseF.value = flags[2];
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
 * 위젯 F — D·G·F 조립.
 * 단계 프리셋으로 스펙큘러 = D × G × F를 한 항씩 켜며 하이라이트가 조립되는 과정을 본다.
 * 항이 꺼지면 1.0로 대체되므로 각 항의 "기여 모양"이 눈에 들어온다.
 */
export default function DFGAssembly() {
  const [stage, setStage] = useState<Stage>('D');
  const [roughness, setRoughness] = useState(0.3);
  const [metalness, setMetalness] = useState(1.0);
  const [azimuth, setAzimuth] = useState(45);
  // 색은 이 위젯의 초점이 아니므로 금색으로 고정(자유 조정은 위젯 G에서).
  const baseColor = '#f2c63f';

  const flags = STAGE_FLAGS[stage];

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={360}>
        <AssemblySphere
          baseColor={baseColor}
          roughness={roughness}
          metalness={metalness}
          azimuth={azimuth}
          flags={flags}
        />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <SelectControl label="조립 단계" value={stage} options={STAGE_OPTIONS} onChange={setStage} />
        <Slider label="거칠기" value={roughness} min={0.02} max={1} step={0.01} onChange={setRoughness} format={(v) => v.toFixed(2)} />
        <Slider label="금속성" value={metalness} min={0} max={1} step={0.01} onChange={setMetalness} format={(v) => v.toFixed(2)} />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 조립 단계를 <code>D</code> → <code>D×G</code> →
        <code>D×G×F</code>로 한 칸씩 올려보세요. 항을 끄면 1.0로 대체되므로, G를 더하면 가장자리가
        정돈되고(가림 손실), F를 더하면 윤곽이 금속색으로 물들며 grazing 림이 밝아지는 변화를 또렷이
        볼 수 있습니다. 하이라이트는 <em>D·G·F를 곱해 조립한 결과</em>입니다.
        <span style={{ marginLeft: 4 }}>
          색은 금색 금속으로 고정했습니다 — 자유로운 색 조정은 아래 마지막 위젯에서.
        </span>
      </figcaption>
    </figure>
  );
}
