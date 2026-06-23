import { useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, ToggleControl, SelectControl, type SelectOption } from '../../controls';
import ToonShape from '../cel-shading-ramp/ToonShape';
import type { ShapeKind } from '../cel-shading-ramp/shared';
import { makeMatcap, matcapDataURL, MATCAP_LABELS, type MatcapKind } from './matcaps';

const SHAPE_OPTIONS: ReadonlyArray<SelectOption<ShapeKind>> = [
  { value: 'sphere', label: '구' },
  { value: 'torus', label: '토러스' },
  { value: 'knot', label: '매듭' },
];

const MATCAP_OPTIONS: ReadonlyArray<SelectOption<MatcapKind>> = (
  Object.keys(MATCAP_LABELS) as MatcapKind[]
).map((k) => ({ value: k, label: MATCAP_LABELS[k] }));

// 뷰공간 법선을 프래그먼트로 — matcap UV는 화면을 향한 법선의 xy.
const vertexShader = /* glsl */ `
  out vec3 vViewN;
  void main() {
    vViewN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  in vec3 vViewN;
  out vec4 fragColor;
  uniform sampler2D uMatcap;
  uniform float uShowUV;

  void main() {
    vec2 uv = normalize(vViewN).xy * 0.5 + 0.5;
    if (uShowUV > 0.5) {
      fragColor = vec4(uv, 0.0, 1.0); // 법선.xy → UV 매핑 시각화
      return;
    }
    fragColor = texture(uMatcap, uv);
  }
`;

function Scene({ kind, showUV, shape }: { kind: MatcapKind; showUV: boolean; shape: ShapeKind }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          uMatcap: { value: makeMatcap('matte') },
          uShowUV: { value: 0 },
        },
      }),
    [],
  );

  useEffect(() => {
    const tex = makeMatcap(kind);
    const prev = material.uniforms.uMatcap.value as THREE.Texture | null;
    material.uniforms.uMatcap.value = tex;
    prev?.dispose();
  }, [kind, material]);

  useFrame(() => {
    material.uniforms.uShowUV.value = showUV ? 1 : 0;
  });

  return (
    <ToonShape shape={shape}>
      <primitive object={material} attach="material" />
    </ToonShape>
  );
}

/**
 * 위젯 — matcap(material capture).
 * 라이팅을 계산하지 않고, "정면 구를 그 재질로 찍은 사진"(matcap)을 뷰공간 법선의 xy로 인덱싱해
 * 그대로 칠한다. 조명·BRDF 없이도 복잡한 룩이 공짜. "UV 매핑 보기"로 법선→UV 대응을 드러낸다.
 */
export default function Matcap() {
  const [kind, setKind] = useState<MatcapKind>('toon2');
  const [showUV, setShowUV] = useState(false);
  const [shape, setShape] = useState<ShapeKind>('knot');
  const [preview, setPreview] = useState('');

  useEffect(() => {
    setPreview(matcapDataURL(kind));
  }, [kind]);

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={360}>
        <Scene kind={kind} showUV={showUV} shape={shape} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <SelectControl label="matcap" value={kind} options={MATCAP_OPTIONS} onChange={setKind} />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
        <ToggleControl label="법선 → UV 매핑 보기" checked={showUV} onChange={setShowUV} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>원본 matcap →</span>
          {preview && (
            <img
              src={preview}
              width={64}
              height={64}
              alt="matcap 원본 텍스처"
              style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}
            />
          )}
        </div>
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> matcap 종류를 바꾸면 같은 도형이 무광·금속·toon 등 전혀 다른
        재질로 보입니다 — 라이팅 계산은 한 줄도 없습니다. "법선 → UV 매핑 보기"를 켜면, 화면을 향한
        법선의 xy가 그대로 텍스처 좌표가 됨을 알 수 있습니다(가장자리 = 원의 테두리). 단점도 보입니다:
        matcap은 <em>뷰공간</em> 기준이라, 카메라를 돌리면 하이라이트가 뷰공간에 고정돼 카메라와 함께 회전합니다.
      </figcaption>
    </figure>
  );
}
