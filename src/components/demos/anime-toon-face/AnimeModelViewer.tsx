import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider, ColorControl, ToggleControl } from '../../controls';
import { lightDirFromAngles, hexToSRGB } from '../cel-shading-ramp/shared';
import { OUTLINE_VERT_OBJECT, OUTLINE_FRAG } from '../toon-outline/outline';

// ── 애니 toon 머티리얼 ──────────────────────────────────────────────
// 정점: 월드 법선을 모델 중심에서의 반경 방향으로 lerp(uSmooth) → "구면 법선 평활화".
const TOON_VERT = /* glsl */ `
  uniform float uSmooth;
  uniform vec3  uCenter;
  out vec3 vWN;
  out vec3 vWP;
  out vec2 vUv;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWP = wp.xyz;
    vec3 n = normalize(mat3(modelMatrix) * normal);
    vec3 radial = normalize(wp.xyz - uCenter);
    vWN = normalize(mix(n, radial, uSmooth));
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const TOON_FRAG = /* glsl */ `
  precision highp float;
  in vec3 vWN;
  in vec3 vWP;
  in vec2 vUv;
  out vec4 fragColor;

  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3  uColor;
  uniform vec3  uLightDir;
  uniform vec3  uShadowTint;
  uniform float uThreshold;
  uniform float uSoft;
  uniform vec3  uRimColor;
  uniform float uRimPower;
  uniform float uRimInt;

  void main() {
    vec3 N = normalize(vWN);
    vec3 base = (uHasMap > 0.5) ? texture(uMap, vUv).rgb : uColor;

    float ndl = dot(N, normalize(uLightDir)) * 0.5 + 0.5; // half-Lambert
    float lit = (uSoft > 0.5)
      ? smoothstep(uThreshold - 0.06, uThreshold + 0.06, ndl)
      : step(uThreshold, ndl);
    vec3 shade = base * mix(uShadowTint, vec3(1.0), lit);

    vec3 V = normalize(cameraPosition - vWP);
    float rim = pow(1.0 - max(0.0, dot(N, V)), uRimPower) * uRimInt;
    float backlit = smoothstep(0.6, 0.0, max(0.0, dot(N, normalize(uLightDir))));

    fragColor = vec4(shade + uRimColor * rim * backlit, 1.0);
  }
`;

interface SharedParams {
  azimuth: number;
  threshold: number;
  soft: boolean;
  shadowTint: string;
  rimColor: string;
  rimPower: number;
  rimInt: number;
  smooth: number;
  outlineWidth: number;
}

function makeToonMaterial(map: THREE.Texture | null, color: THREE.Color, center: THREE.Vector3) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: TOON_VERT,
    fragmentShader: TOON_FRAG,
    uniforms: {
      uMap: { value: map },
      uHasMap: { value: map ? 1 : 0 },
      uColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
      uLightDir: { value: new THREE.Vector3(1, 0.6, 0.6) },
      uShadowTint: { value: new THREE.Vector3(0.55, 0.5, 0.62) },
      uThreshold: { value: 0.5 },
      uSoft: { value: 1 },
      uRimColor: { value: new THREE.Vector3(1, 0.95, 0.85) },
      uRimPower: { value: 3 },
      uRimInt: { value: 0.8 },
      uSmooth: { value: 0 },
      uCenter: { value: center.clone() },
    },
  });
}

function makeOutlineMaterial() {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: OUTLINE_VERT_OBJECT,
    fragmentShader: OUTLINE_FRAG,
    uniforms: {
      uWidth: { value: 0.01 },
      uColor: { value: new THREE.Vector3(...hexToSRGB('#16121c')) },
    },
    side: THREE.BackSide,
  });
}

interface Processed {
  group: THREE.Group;
  toon: THREE.ShaderMaterial[];
  outline: THREE.ShaderMaterial[];
}

/** 임의 Object3D를 받아 중심·스케일 정규화하고, 메시마다 toon+아웃라인을 입힌다. */
function processObject(root: THREE.Object3D): Processed {
  // 중심·스케일 정규화
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.4 / maxDim;
  root.position.sub(center).multiplyScalar(scale);
  root.scale.setScalar(scale);

  const group = new THREE.Group();
  group.add(root);

  const toon: THREE.ShaderMaterial[] = [];
  const outline: THREE.ShaderMaterial[] = [];
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });

  const worldCenter = new THREE.Vector3(0, 0, 0); // 정규화 후 중심 ≈ 원점

  for (const mesh of meshes) {
    const geo = mesh.geometry as THREE.BufferGeometry;
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    if (!geo.getAttribute('uv')) {
      // uv 없으면 0으로 채워(맵 미사용 메시) 셰이더 컴파일 보장
      const n = geo.getAttribute('position').count;
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const map = (src as THREE.MeshStandardMaterial).map ?? null;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    const color = (src as THREE.MeshStandardMaterial).color ?? new THREE.Color(0.8, 0.8, 0.85);

    const tm = makeToonMaterial(map, color, worldCenter);
    mesh.material = tm;
    toon.push(tm);

    const om = makeOutlineMaterial();
    const outlineMesh = new THREE.Mesh(geo, om);
    mesh.add(outlineMesh); // 같은 변환 공유
    outline.push(om);
  }

  return { group, toon, outline };
}

/** 폴백: 코·눈이 있는 간단한 머리 프록시(법선 평활화 효과가 보이도록). */
function buildFallback(): THREE.Object3D {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffd9b8') });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a2f45') });

  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), skin);
  head.scale.set(0.92, 1.08, 0.95);
  g.add(head);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 24), skin);
  nose.position.set(0, -0.1, 0.95);
  g.add(nose);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 24), dark);
    eye.position.set(sx * 0.34, 0.12, 0.86);
    g.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.06), dark);
    brow.position.set(sx * 0.34, 0.36, 0.9);
    g.add(brow);
  }
  return g;
}

function Model({ params, processed }: { params: SharedParams; processed: Processed }) {
  useFrame(() => {
    const dir = lightDirFromAngles(params.azimuth, 18);
    const tint = hexToSRGB(params.shadowTint);
    const rim = hexToSRGB(params.rimColor);
    for (const m of processed.toon) {
      const u = m.uniforms;
      (u.uLightDir.value as THREE.Vector3).copy(dir);
      (u.uShadowTint.value as THREE.Vector3).set(...tint);
      (u.uRimColor.value as THREE.Vector3).set(...rim);
      u.uThreshold.value = params.threshold;
      u.uSoft.value = params.soft ? 1 : 0;
      u.uRimPower.value = params.rimPower;
      u.uRimInt.value = params.rimInt;
      u.uSmooth.value = params.smooth;
    }
    for (const m of processed.outline) {
      m.uniforms.uWidth.value = params.outlineWidth;
      m.visible = params.outlineWidth > 0.0001;
    }
  });
  return <primitive object={processed.group} />;
}

/**
 * 위젯 — 내 모델로 보는 애니 toon (Bring-Your-Own-Model).
 * .glb를 드롭/선택하면 모든 메시에 toon 램프 + 림 + inverted-hull 아웃라인을 입힌다.
 * "구면 법선 평활화"로 얼굴 그림자가 깔끔해지는 트릭을 직접 만질 수 있다.
 * 저작권 자산은 저장소에 포함하지 않으며, 파일은 전적으로 브라우저 안에서만 처리된다(업로드 없음).
 */
export default function AnimeModelViewer() {
  const [processed, setProcessed] = useState<Processed | null>(null);
  const [fileName, setFileName] = useState<string>('(내장 프록시 머리)');
  const [error, setError] = useState<string>('');

  const [azimuth, setAzimuth] = useState(40);
  const [threshold, setThreshold] = useState(0.5);
  const [soft, setSoft] = useState(true);
  const [shadowTint, setShadowTint] = useState('#8d84a0');
  const [rimColor, setRimColor] = useState('#fff1da');
  const [rimPower, setRimPower] = useState(3);
  const [rimInt, setRimInt] = useState(0.8);
  const [smooth, setSmooth] = useState(0);
  const [outlineWidth, setOutlineWidth] = useState(0.01);

  const disposeRef = useRef<Processed | null>(null);

  function setProcessedDisposing(p: Processed) {
    // 이전 자원 정리
    const prev = disposeRef.current;
    if (prev) {
      prev.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          (m.geometry as THREE.BufferGeometry)?.dispose?.();
          const mat = m.material as THREE.Material | THREE.Material[];
          (Array.isArray(mat) ? mat : [mat]).forEach((x) => x?.dispose?.());
        }
      });
    }
    disposeRef.current = p;
    setProcessed(p);
  }

  // 최초 폴백 로드
  useEffect(() => {
    setProcessedDisposing(processObject(buildFallback()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const loader = new GLTFLoader();
      const gltf = await loader.parseAsync(buf, '');
      setProcessedDisposing(processObject(gltf.scene));
      setFileName(file.name);
    } catch (err) {
      setError('이 파일을 불러오지 못했습니다. 자체 포함(.glb) 모델을 권장합니다. ' + String(err));
    }
  }

  const params: SharedParams = {
    azimuth, threshold, soft, shadowTint, rimColor, rimPower, rimInt, smooth, outlineWidth,
  };

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0.3, 3.4]} height={420}>
        {processed && <Model params={params} processed={processed} />}
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem' }}>
          {/* 파일 입력은 프리미티브가 없어 직접 사용(브라우저 로컬 처리, 업로드 없음) */}
          <label
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--bg)',
              background: 'var(--accent)',
              borderRadius: 999,
              padding: '0.35rem 0.9rem',
              cursor: 'pointer',
            }}
          >
            .glb 모델 불러오기
            <input type="file" accept=".glb,.gltf,model/gltf-binary" onChange={onFile} style={{ display: 'none' }} />
          </label>
          <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{fileName}</span>
        </div>
        {error && <p style={{ color: '#c0392b', fontSize: '0.82rem', margin: 0 }}>{error}</p>}

        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
        <Slider label="그림자 경계(threshold)" value={threshold} min={0.1} max={0.9} step={0.01} onChange={setThreshold} format={(v) => v.toFixed(2)} />
        <Slider label="구면 법선 평활화" value={smooth} min={0} max={1} step={0.01} onChange={setSmooth} format={(v) => v.toFixed(2)} />
        <Slider label="아웃라인 두께" value={outlineWidth} min={0} max={0.04} step={0.001} onChange={setOutlineWidth} format={(v) => v.toFixed(3)} />
        <Slider label="림 세기" value={rimInt} min={0} max={2} step={0.05} onChange={setRimInt} format={(v) => v.toFixed(2)} />
        <Slider label="림 power" value={rimPower} min={1} max={8} step={0.1} onChange={setRimPower} format={(v) => v.toFixed(1)} />
        <ColorControl label="그림자 틴트" value={shadowTint} onChange={setShadowTint} />
        <ColorControl label="림 색" value={rimColor} onChange={setRimColor} />
        <ToggleControl label="그림자 경계 부드럽게" checked={soft} onChange={setSoft} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 기본은 내장 머리 프록시입니다. <strong>"구면 법선 평활화"</strong>를
        올려 보세요 — 코·눈두덩의 울퉁불퉁한 그림자가, 법선을 머리 중심의 구면 방향으로 끌어당길수록
        매끈한 한 덩어리로 정리됩니다(애니 얼굴 셰이딩의 핵심 트릭). 합법적으로 보유한 .glb 캐릭터
        모델이 있다면 "불러오기"로 올려 같은 파이프라인을 적용해 보세요 — 파일은 브라우저 안에서만
        처리되며 어디에도 전송·저장되지 않습니다.
      </figcaption>
    </figure>
  );
}
