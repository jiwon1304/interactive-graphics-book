// 마이크로패싯 BRDF 위젯들이 공유하는 GLSL3 셰이더 조각.
// GLSL3 규칙: 정점은 in/out, 프래그먼트는 out vec4 fragColor 선언, gl_FragColor 금지.

/** 월드 법선 + 월드 좌표를 프래그먼트로 넘기는 공용 정점 셰이더. */
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

/** D/G/F 공용 함수 + 공통 uniform/varying 선언. 프래그먼트 셰이더 본문에서 import해 사용. */
export const BRDF_COMMON = /* glsl */ `
  precision highp float;

  in vec3 vWorldNormal;
  in vec3 vWorldPos;

  out vec4 fragColor;

  uniform vec3  uBaseColor;   // 선형 공간 알베도
  uniform float uRoughness;
  uniform float uMetalness;
  uniform vec3  uLightDir;    // 표면 → 광원 방향 (정규화됨)
  uniform vec3  uCameraPos;

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
`;
