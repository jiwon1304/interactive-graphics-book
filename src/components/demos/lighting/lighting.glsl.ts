// 조명 챕터 위젯들이 공유하는 GLSL3 셰이더 조각.
// GLSL3 규칙: 정점은 in/out, 프래그먼트는 out vec4 선언, gl_FragColor 금지.

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

/** 공용 헤더(varying/uniform 선언). 프래그먼트 셰이더 본문 앞에 붙인다. */
export const FRAG_HEADER = /* glsl */ `
  precision highp float;

  in vec3 vWorldNormal;
  in vec3 vWorldPos;
  out vec4 fragColor;

  // sRGB <-> 선형 변환(근사). three가 출력은 sRGB로 인코딩하므로
  // 셰이딩은 선형에서 하고 마지막에 굳이 인코딩하지 않는다(아래 데모는 학습용 근사).
  vec3 toSRGB(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
`;
