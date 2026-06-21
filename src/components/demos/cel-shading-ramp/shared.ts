// 셀 셰이딩 챕터 위젯 공용 유틸: 색 변환, GLSL3 정점 셰이더, 작은 수식 헬퍼.
import * as THREE from 'three';

const _scratch = new THREE.Color();

/** '#rrggbb'(sRGB) → 선형 공간 RGB. 셰이딩 전에 선형화한다. */
export function hexToLinearRGB(hex: string): [number, number, number] {
  _scratch.set(hex).convertSRGBToLinear();
  return [_scratch.r, _scratch.g, _scratch.b];
}

/** '#rrggbb'(sRGB) → 0..1 sRGB RGB (이미 sRGB라 변환 없이 정규화만). */
export function hexToSRGB(hex: string): [number, number, number] {
  _scratch.set(hex);
  return [_scratch.r, _scratch.g, _scratch.b];
}

/**
 * 월드 법선 + 월드 좌표를 프래그먼트로 넘기는 공용 정점 셰이더(GLSL3).
 * GLSL3: 정점은 in/out, 프래그먼트는 out vec4 fragColor.
 */
export const VERTEX_SHADER = /* glsl */ `
  out vec3 vWorldNormal;
  out vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

/**
 * 프래그먼트 셰이더 공통 머리말: varying/uniform 선언 + N·L 계산 헬퍼.
 * 셀 셰이딩은 선형 공간에서 굳이 다루지 않아도 의도가 더 잘 보여, sRGB 표시색을
 * 그대로 다룬다(밴드 경계가 또렷하게 보이도록). gamma 변환 없이 출력.
 */
export const FRAG_HEADER = /* glsl */ `
  precision highp float;

  in vec3 vWorldNormal;
  in vec3 vWorldPos;
  out vec4 fragColor;

  uniform vec3 uLightDir;   // 표면 → 광원 방향(정규화)

  // N·L 을 [0,1]로 clamp(순수 Lambert diffuse 항)
  float lambertNdotL() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uLightDir);
    return clamp(dot(N, L), 0.0, 1.0);
  }

  // raw N·L (음수 포함). half-Lambert 등 remap용.
  float rawNdotL() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uLightDir);
    return dot(N, L);
  }
`;

/** 방위각(도) + 고도(도) → 정규화된 광원 방향 벡터. */
export function lightDirFromAngles(azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const y = Math.sin(el);
  const r = Math.cos(el);
  return new THREE.Vector3(r * Math.cos(az), y, r * Math.sin(az)).normalize();
}

/** 공통 도형 선택 타입. */
export type ShapeKind = 'sphere' | 'torus' | 'knot';
