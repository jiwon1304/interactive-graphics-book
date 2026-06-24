// G-buffer 채널 시각화용 셰이더.
// 진짜 MRT 디퍼드 파이프라인 대신, 같은 지오메트리를 "어떤 채널을 출력할지"만 바꿔
// albedo / normal / depth(+ 합성 라이팅)를 한 머티리얼에서 흑백·컬러로 보여준다.
// (개념 전달용 근사 — 실제 디퍼드는 이 값들을 텍스처로 기록한 뒤 2차 패스에서 읽는다.)

export const VERTEX = /* glsl */ `
  out vec3 vWorldNormal;
  out vec3 vWorldPos;
  out float vViewDepth; // 카메라로부터의 거리(뷰공간 -z)

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 viewPos = viewMatrix * worldPos;
    vViewDepth = -viewPos.z;
    gl_Position = projectionMatrix * viewPos;
  }
`;

export const FRAGMENT = /* glsl */ `
  precision highp float;

  in vec3 vWorldNormal;
  in vec3 vWorldPos;
  in float vViewDepth;

  uniform int   uChannel;    // 0=lit, 1=albedo, 2=normal, 3=depth
  uniform vec3  uAlbedo;     // 이 오브젝트의 기본색(선형)
  uniform float uNear;       // depth 정규화 범위
  uniform float uFar;
  uniform vec3  uLightDir;   // lit 모드용

  out vec4 fragColor;

  void main() {
    vec3 N = normalize(vWorldNormal);

    if (uChannel == 1) {
      // albedo: 기본색을 그대로(감마 보정만)
      fragColor = vec4(pow(uAlbedo, vec3(1.0 / 2.2)), 1.0);
      return;
    }
    if (uChannel == 2) {
      // world normal을 [0,1] 색으로 인코딩 (n*0.5+0.5)
      fragColor = vec4(N * 0.5 + 0.5, 1.0);
      return;
    }
    if (uChannel == 3) {
      // 뷰공간 깊이를 near..far로 정규화 → 가까울수록 밝게
      float d = clamp((vViewDepth - uNear) / (uFar - uNear), 0.0, 1.0);
      float g = 1.0 - d;
      fragColor = vec4(vec3(g), 1.0);
      return;
    }

    // lit: 디퍼드 라이팅 패스가 G-buffer로 만들어낼 최종 결과(단일 광원 Lambert)
    vec3 L = normalize(uLightDir);
    float ndl = max(dot(N, L), 0.0);
    vec3 col = uAlbedo * (0.15 + 0.85 * ndl);
    fragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
  }
`;
