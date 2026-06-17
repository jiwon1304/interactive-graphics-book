import { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider, ToggleControl } from '../../controls';

// 전체 화면 쿼드를 카메라와 무관하게 채운다.
// planeGeometry(2,2)의 position은 이미 -1..1을 채우므로 그대로 클립공간으로 보낸다.
const vertexShader = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  in vec2 vUv;
  out vec4 outColor;

  uniform vec2  uResolution;
  uniform float uYaw;
  uniform float uPitch;
  uniform float uK;          // 스무스 민 폭
  uniform float uLightAngle; // 광원 회전 (라디안)
  uniform float uSoftShadow; // 0/1
  uniform float uAO;         // 0/1
  uniform float uHeatmap;    // 0/1 : 스텝 수 시각화
  uniform vec3  uBg;         // 배경(테마)
  uniform vec3  uAccent;     // 강조색(테마)

  const int   MAX_STEPS = 96;
  const float EPS  = 0.001;
  const float FAR  = 30.0;

  // ---- SDF 프리미티브 ----
  float sdSphere(vec3 p, vec3 c, float r) { return length(p - c) - r; }

  float sdBox(vec3 p, vec3 c, vec3 b) {
    vec3 q = abs(p - c) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  }

  float sdPlane(vec3 p, float h) { return p.y - h; } // n=(0,1,0)

  // 다항식 smooth-min (Inigo Quilez)
  float smin(float a, float b, float k) {
    if (k <= 0.0001) return min(a, b);
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
  }

  // 씬: 구 + 박스의 smooth-union, 그리고 바닥 평면.
  // map()은 (거리, 재질ID) 반환. id<0 = 바닥.
  vec2 mapScene(vec3 p) {
    float ds = sdSphere(p, vec3(-0.55, 0.0, 0.0), 0.95);
    float db = sdBox(p, vec3(0.6, -0.05, 0.0), vec3(0.7, 0.7, 0.7));
    float obj = smin(ds, db, uK);
    float plane = sdPlane(p, -0.85);
    if (plane < obj) return vec2(plane, -1.0);
    return vec2(obj, 1.0);
  }

  float mapDist(vec3 p) { return mapScene(p).x; }

  // 4-탭(테트라헤드론) 법선
  vec3 calcNormal(vec3 p) {
    const vec2 e = vec2(1.0, -1.0) * 0.0008;
    return normalize(
      e.xyy * mapDist(p + e.xyy) +
      e.yyx * mapDist(p + e.yyx) +
      e.yxy * mapDist(p + e.yxy) +
      e.xxx * mapDist(p + e.xxx)
    );
  }

  // 소프트 섀도우: res = min(res, k*h/t)
  float softShadow(vec3 ro, vec3 rd, float k) {
    float res = 1.0;
    float t = 0.02;
    for (int i = 0; i < 48; i++) {
      vec3 p = ro + rd * t;
      float h = mapDist(p);
      if (h < 0.001) return 0.0;
      res = min(res, k * h / t);
      t += clamp(h, 0.02, 0.3);
      if (t > 12.0) break;
    }
    return clamp(res, 0.0, 1.0);
  }

  // 간이 앰비언트 오클루전 (법선 방향으로 표면 거리 샘플)
  float calcAO(vec3 p, vec3 n) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 5; i++) {
      float hr = 0.01 + 0.12 * float(i) / 4.0;
      float dd = mapDist(p + n * hr);
      occ += (hr - dd) * sca;
      sca *= 0.7;
    }
    return clamp(1.0 - 1.5 * occ, 0.0, 1.0);
  }

  // 스텝 수 → viridis 근사 램프
  vec3 heatRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 a = vec3(0.27, 0.00, 0.33);
    vec3 b = vec3(0.13, 0.57, 0.55);
    vec3 c = vec3(0.99, 0.91, 0.14);
    return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, (t - 0.5) * 2.0);
  }

  void main() {
    // 화면 좌표 → NDC (종횡비 보정)
    vec2 uv = (vUv * 2.0 - 1.0);
    uv.x *= uResolution.x / uResolution.y;

    // 직접 구동하는 오빗 카메라 (yaw/pitch로 원점 주위를 도는 구면 좌표)
    float cp = cos(uPitch), sp = sin(uPitch);
    float cy = cos(uYaw),   sy = sin(uYaw);
    float radius = 4.2;
    vec3 ro = vec3(radius * cp * sy, radius * sp, radius * cp * cy);
    vec3 target = vec3(0.0, -0.1, 0.0);

    // 카메라 기저
    vec3 fwd = normalize(target - ro);
    vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, fwd);
    vec3 rd = normalize(uv.x * right + uv.y * up + 1.6 * fwd);

    // 스피어 트레이싱
    float t = 0.0;
    int steps = 0;
    float matId = 0.0;
    bool hit = false;
    for (int i = 0; i < MAX_STEPS; i++) {
      steps = i + 1;
      vec3 p = ro + rd * t;
      vec2 m = mapScene(p);
      if (m.x < EPS) { hit = true; matId = m.y; break; }
      t += m.x;
      if (t > FAR) break;
    }

    // 스텝 히트맵 모드: 반복 횟수를 색으로
    if (uHeatmap > 0.5) {
      float f = float(steps) / float(MAX_STEPS);
      outColor = vec4(heatRamp(f), 1.0);
      return;
    }

    // 배경: 위/아래 살짝 그라데이션
    vec3 col = mix(uBg * 0.92, uBg, clamp(uv.y * 0.5 + 0.5, 0.0, 1.0));

    if (hit) {
      vec3 p = ro + rd * t;
      vec3 n = calcNormal(p);

      // 회전하는 광원
      vec3 lpos = vec3(3.0 * cos(uLightAngle), 3.2, 3.0 * sin(uLightAngle));
      vec3 L = normalize(lpos - p);
      float diff = max(dot(n, L), 0.0);

      // 소프트 섀도우
      float sh = 1.0;
      if (uSoftShadow > 0.5) {
        sh = softShadow(p + n * 0.02, L, 12.0);
      }

      // AO
      float ao = 1.0;
      if (uAO > 0.5) ao = calcAO(p, n);

      // 재질색: 물체=강조색, 바닥=중성 회색
      vec3 base = matId < 0.0 ? vec3(0.62) : uAccent;

      // 스펙큘러 (Blinn-Phong)
      vec3 V = normalize(ro - p);
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(n, H), 0.0), 48.0) * (matId < 0.0 ? 0.2 : 0.6);

      vec3 ambient = base * 0.18 * ao;
      vec3 lit = base * diff * sh * ao + vec3(spec) * sh;
      col = ambient + lit;

      // 약한 림/하늘 보강
      col += base * 0.06 * clamp(0.5 + 0.5 * n.y, 0.0, 1.0) * ao;
    }

    // 감마
    col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
    outColor = vec4(col, 1.0);
  }
`;

interface SceneUniforms {
  uResolution: { value: THREE.Vector2 };
  uYaw: { value: number };
  uPitch: { value: number };
  uK: { value: number };
  uLightAngle: { value: number };
  uSoftShadow: { value: number };
  uAO: { value: number };
  uHeatmap: { value: number };
  uBg: { value: THREE.Vector3 };
  uAccent: { value: THREE.Vector3 };
}

interface FullscreenRaymarchProps {
  k: number;
  lightAngle: number;
  softShadow: boolean;
  ao: boolean;
  heatmap: boolean;
  yawRef: React.RefObject<number>;
  pitchRef: React.RefObject<number>;
}

const _scratch = new THREE.Color();
// 매 프레임 호출되므로 할당 없이 전달받은 Vector3에 결과를 써넣는다.
function readCssColorInto(out: THREE.Vector3, varName: string, fallback: string): void {
  let v = fallback;
  if (typeof document !== 'undefined') {
    v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
  }
  _scratch.set(v).convertSRGBToLinear();
  out.set(_scratch.r, _scratch.g, _scratch.b);
}

/** 전체 화면 쿼드 + 레이마칭 셰이더. 반드시 <Canvas> 내부에서 렌더. */
function FullscreenRaymarch({
  k,
  lightAngle,
  softShadow,
  ao,
  heatmap,
  yawRef,
  pitchRef,
}: FullscreenRaymarchProps) {
  const { size } = useThree();

  const uniforms = useMemo<SceneUniforms>(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uYaw: { value: 0 },
      uPitch: { value: 0.35 },
      uK: { value: 0.5 },
      uLightAngle: { value: 0 },
      uSoftShadow: { value: 1 },
      uAO: { value: 1 },
      uHeatmap: { value: 0 },
      uBg: { value: new THREE.Vector3(0.96, 0.96, 0.97) },
      uAccent: { value: new THREE.Vector3(0.18, 0.52, 0.81) },
    }),
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader,
        fragmentShader,
        // SceneUniforms는 IUniform 호환이지만 인덱스 시그니처가 없어 캐스팅한다.
        uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
        depthTest: false,
        depthWrite: false,
      }),
    [uniforms],
  );

  useFrame(() => {
    uniforms.uResolution.value.set(size.width, size.height);
    uniforms.uYaw.value = yawRef.current ?? 0;
    uniforms.uPitch.value = pitchRef.current ?? 0.35;
    uniforms.uK.value = k;
    uniforms.uLightAngle.value = lightAngle;
    uniforms.uSoftShadow.value = softShadow ? 1 : 0;
    uniforms.uAO.value = ao ? 1 : 0;
    uniforms.uHeatmap.value = heatmap ? 1 : 0;
    readCssColorInto(uniforms.uBg.value, '--surface', '#f5f6f8');
    readCssColorInto(uniforms.uAccent.value, '--accent', '#2f86cf');
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * 레이마칭의 결과물 — GLSL3 풀스크린 셰이더로 구+박스 smooth-union을 실시간 렌더.
 * OrbitControls 대신 직접 yaw/pitch 유니폼을 드래그로 구동한다.
 */
export default function RaymarchScene() {
  const [k, setK] = useState(0.5);
  const [lightDeg, setLightDeg] = useState(40);
  const [softShadow, setSoftShadow] = useState(true);
  const [ao, setAO] = useState(true);
  const [heatmap, setHeatmap] = useState(false);

  // 드래그 오빗 상태는 ref로 (리렌더 없이 매 프레임 반영)
  const yaw = useRef(0.6);
  const pitch = useRef(0.35);
  const dragging = useRef(false);
  const last = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    yaw.current += dx * 0.008;
    // 위/아래를 너무 넘기지 않도록 클램프
    pitch.current = Math.max(-1.2, Math.min(1.3, pitch.current - dy * 0.008));
  };
  const onUp = () => {
    dragging.current = false;
  };

  return (
    <figure className="demo">
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ touchAction: 'none', cursor: 'grab' }}
      >
        {/* 셰이더가 직접 조명을 계산하므로 DemoCanvas 기본 조명은 끈다. */}
        <DemoCanvas lights={false} animate cameraPosition={[0, 0, 5]} height={400}>
          <FullscreenRaymarch
            k={k}
            lightAngle={(lightDeg * Math.PI) / 180}
            softShadow={softShadow}
            ao={ao}
            heatmap={heatmap}
            yawRef={yaw}
            pitchRef={pitch}
          />
        </DemoCanvas>
      </div>

      <ControlPanel>
        <Slider
          label="스무스 민 k"
          value={k}
          min={0}
          max={1.2}
          step={0.01}
          onChange={setK}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          label="광원 회전"
          value={lightDeg}
          min={0}
          max={360}
          step={1}
          onChange={setLightDeg}
          unit="°"
        />
        <ToggleControl label="소프트 섀도우" checked={softShadow} onChange={setSoftShadow} />
        <ToggleControl label="앰비언트 오클루전" checked={ao} onChange={setAO} />
        <ToggleControl label="스텝 히트맵" checked={heatmap} onChange={setHeatmap} />
      </ControlPanel>

      <figcaption>
        삼각형 메시 없이, 프래그먼트 셰이더 안에서 픽셀마다 스피어 트레이싱으로 그린 장면입니다. 구와
        박스는 스무스 민으로 부드럽게 융합돼 있습니다.
        <br />
        <strong>직접 해보세요:</strong> 드래그로 카메라를 돌려 보세요. <strong>스텝 히트맵</strong>을 켜면
        실루엣 가장자리(스치는 광선)가 노랗게 — 즉 가장 많은 스텝을 먹는 곳이 보입니다. k를 올려 두 도형이
        녹아 붙는 모습, 소프트 섀도우와 AO를 껐다 켜 음영이 얼마나 풍부해지는지도 확인해 보세요.
      </figcaption>
    </figure>
  );
}
