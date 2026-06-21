// 윤곽선 챕터 위젯 공용 셰이더/머티리얼.
// beauty(단순 3밴드 toon) + inverted-hull 아웃라인(object/screen 두께) + G-buffer(노멀·깊이).
import * as THREE from 'three';
import { FRAG_HEADER, VERTEX_SHADER, hexToSRGB } from '../cel-shading-ramp/shared';

/**
 * 윤곽선이 주인공이라 라이팅은 단순한 3밴드 toon으로 둔다.
 * (VERTEX_SHADER가 vWorldNormal/vWorldPos를, FRAG_HEADER가 uLightDir·N·L 헬퍼를 제공.)
 */
export const BEAUTY_FRAG = /* glsl */ `
  ${FRAG_HEADER}
  uniform vec3 uBase;
  void main() {
    float x = lambertNdotL();
    float band = clamp(floor(x * 3.0), 0.0, 2.0); // 0,1,2
    float q = band / 2.0;                          // 0, 0.5, 1
    vec3 col = uBase * (0.40 + 0.60 * q);
    fragColor = vec4(col, 1.0);
  }
`;

export function makeBeautyMaterial(baseHex: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERTEX_SHADER,
    fragmentShader: BEAUTY_FRAG,
    uniforms: {
      uLightDir: { value: new THREE.Vector3(1, 0.6, 0.5) },
      uBase: { value: new THREE.Vector3(...hexToSRGB(baseHex)) },
    },
  });
}

/** object-space 법선 extrude: p' = p + n·width. 거리·스케일에 따라 화면 두께가 변한다. */
export const OUTLINE_VERT_OBJECT = /* glsl */ `
  uniform float uWidth;
  void main() {
    vec3 p = position + normal * uWidth;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

/**
 * 화면공간 일정 두께: 클립공간에서 법선 방향으로 (uWidth 픽셀)만큼 민다.
 * clip.w를 곱해 원근 분할(÷w)을 상쇄하므로, 거리와 무관하게 화면 두께가 일정해진다.
 */
export const OUTLINE_VERT_SCREEN = /* glsl */ `
  uniform float uWidth;       // 픽셀
  uniform vec2  uResolution;  // 드로잉 버퍼 해상도(px)
  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec3 vn = normalize(normalMatrix * normal);
    vec3 cn = (projectionMatrix * vec4(vn, 0.0)).xyz;
    vec2 dir = normalize(cn.xy + 1e-6);
    clip.xy += dir * (uWidth * 2.0 / uResolution) * clip.w;
    gl_Position = clip;
  }
`;

export const OUTLINE_FRAG = /* glsl */ `
  precision highp float;
  out vec4 fragColor;
  uniform vec3 uColor;
  void main() { fragColor = vec4(uColor, 1.0); }
`;

/** 후처리용 G-buffer: rgb=뷰공간 법선(0.5+0.5), a=정규화 뷰 깊이. */
export const ND_VERT = /* glsl */ `
  out vec3 vViewN;
  out float vDepth;
  void main() {
    vec4 vp = modelViewMatrix * vec4(position, 1.0);
    vViewN = normalize(normalMatrix * normal);
    vDepth = -vp.z;
    gl_Position = projectionMatrix * vp;
  }
`;

export const ND_FRAG = /* glsl */ `
  precision highp float;
  in vec3 vViewN;
  in float vDepth;
  out vec4 fragColor;
  uniform float uDepthScale;
  void main() {
    fragColor = vec4(vViewN * 0.5 + 0.5, clamp(vDepth / uDepthScale, 0.0, 1.0));
  }
`;
