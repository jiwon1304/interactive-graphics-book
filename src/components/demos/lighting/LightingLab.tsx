import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider, ColorControl, ToggleControl, SelectControl, type SelectOption } from '../../controls';
import { hexToLinearRGB, type ShapeKind } from './shared';
import LightShape from './LightShape';
import { VERTEX_SHADER, FRAG_HEADER } from './lighting.glsl';

const SHAPE_OPTIONS: ReadonlyArray<SelectOption<ShapeKind>> = [
  { value: 'sphere', label: '구' },
  { value: 'torus', label: '토러스' },
  { value: 'knot', label: '매듭' },
];

const fragmentShader = /* glsl */ `
  ${FRAG_HEADER}

  uniform vec3  uBaseColor;
  uniform vec3  uCameraPos;
  uniform float uShininess;

  uniform float uAmbient;
  uniform float uUseDiffuse;
  uniform float uUseSpecular;

  // 광원 1: directional(흰색), 광원 2: point(컬러, 감쇠)
  uniform vec3  uDirLightDir;     // 표면 → 광원(정규화)
  uniform vec3  uDirLightColor;
  uniform float uDirOn;

  uniform vec3  uPointPos;        // 월드 위치
  uniform vec3  uPointColor;
  uniform float uPointOn;
  uniform float uKc;
  uniform float uKl;
  uniform float uKq;

  vec3 shadeLight(vec3 N, vec3 V, vec3 L, vec3 lightColor) {
    float NdotL = max(dot(N, L), 0.0);
    vec3 diffuse = uBaseColor * NdotL * uUseDiffuse;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), uShininess) * step(0.0, NdotL) * uUseSpecular;
    return lightColor * (diffuse + vec3(spec));
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);

    vec3 color = uBaseColor * uAmbient;  // ambient 항

    if (uDirOn > 0.5) {
      color += shadeLight(N, V, normalize(uDirLightDir), uDirLightColor);
    }
    if (uPointOn > 0.5) {
      vec3 toL = uPointPos - vWorldPos;
      float d = length(toL);
      vec3 L = toL / max(d, 1e-4);
      float att = 1.0 / (uKc + uKl * d + uKq * d * d);
      color += shadeLight(N, V, L, uPointColor) * att;
    }

    fragColor = vec4(toSRGB(color), 1.0);
  }
`;

interface LabUniforms {
  baseColor: string;
  shininess: number;
  ambient: number;
  useDiffuse: boolean;
  useSpecular: boolean;
  dirOn: boolean;
  dirDeg: number;
  pointOn: boolean;
  pointColor: string;
  kc: number;
  kl: number;
  kq: number;
}

function LabMaterial(props: LabUniforms) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const tRef = useRef(0);

  const uniforms = useMemo(
    () => ({
      uBaseColor: { value: new THREE.Vector3(0.7, 0.7, 0.72) },
      uCameraPos: { value: new THREE.Vector3() },
      uShininess: { value: 32 },
      uAmbient: { value: 0.06 },
      uUseDiffuse: { value: 1 },
      uUseSpecular: { value: 1 },
      uDirLightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
      uDirLightColor: { value: new THREE.Vector3(1, 1, 1) },
      uDirOn: { value: 1 },
      uPointPos: { value: new THREE.Vector3(2, 1.2, 2) },
      uPointColor: { value: new THREE.Vector3(1, 0.4, 0.2) },
      uPointOn: { value: 1 },
      uKc: { value: 1 },
      uKl: { value: 0.09 },
      uKq: { value: 0.05 },
    }),
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX_SHADER,
        fragmentShader,
        uniforms,
      }),
    [uniforms],
  );

  useFrame(({ camera }, delta) => {
    tRef.current += delta;
    const u = uniforms;
    const [r, g, b] = hexToLinearRGB(props.baseColor);
    u.uBaseColor.value.set(r, g, b);
    u.uShininess.value = props.shininess;
    u.uAmbient.value = props.ambient;
    u.uUseDiffuse.value = props.useDiffuse ? 1 : 0;
    u.uUseSpecular.value = props.useSpecular ? 1 : 0;

    u.uDirOn.value = props.dirOn ? 1 : 0;
    const phi = (props.dirDeg * Math.PI) / 180;
    u.uDirLightDir.value.set(Math.cos(phi), 0.6, Math.sin(phi)).normalize();

    u.uPointOn.value = props.pointOn ? 1 : 0;
    const [pr, pg, pb] = hexToLinearRGB(props.pointColor);
    u.uPointColor.value.set(pr, pg, pb);
    // point light가 물체 둘레를 천천히 돈다 → 감쇠가 보이게
    const a = tRef.current * 0.5;
    u.uPointPos.value.set(Math.cos(a) * 2.6, 1.4, Math.sin(a) * 2.6);
    u.uKc.value = props.kc;
    u.uKl.value = props.kl;
    u.uKq.value = props.kq;

    u.uCameraPos.value.copy(camera.position);
  });

  return <primitive object={material} ref={matRef} attach="material" />;
}

export default function LightingLab() {
  const [shape, setShape] = useState<ShapeKind>('knot');
  const [baseColor, setBaseColor] = useState('#b9bcc4');
  const [shininess, setShininess] = useState(40);
  const [ambient, setAmbient] = useState(0.06);
  const [useDiffuse, setUseDiffuse] = useState(true);
  const [useSpecular, setUseSpecular] = useState(true);
  const [dirOn, setDirOn] = useState(true);
  const [dirDeg, setDirDeg] = useState(40);
  const [pointOn, setPointOn] = useState(true);
  const [pointColor, setPointColor] = useState('#ff6a33');
  const [kq, setKq] = useState(0.05);

  return (
    <figure className="demo">
      <DemoCanvas cameraPosition={[0, 0.8, 4.4]}>
        <LightShape shape={shape}>
          <LabMaterial
            baseColor={baseColor}
            shininess={shininess}
            ambient={ambient}
            useDiffuse={useDiffuse}
            useSpecular={useSpecular}
            dirOn={dirOn}
            dirDeg={dirDeg}
            pointOn={pointOn}
            pointColor={pointColor}
            kc={1}
            kl={0.09}
            kq={kq}
          />
        </LightShape>
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>
      <ControlPanel>
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
        <ColorControl label="물체 색" value={baseColor} onChange={setBaseColor} />
        <Slider label="shininess" value={shininess} min={1} max={128} step={1} onChange={setShininess} />
        <Slider label="ambient" value={ambient} min={0} max={0.4} step={0.01} onChange={setAmbient} />
        <ToggleControl label="diffuse 항" checked={useDiffuse} onChange={setUseDiffuse} />
        <ToggleControl label="specular 항" checked={useSpecular} onChange={setUseSpecular} />
        <ToggleControl label="① directional 광원" checked={dirOn} onChange={setDirOn} />
        <Slider label="① 방향" value={dirDeg} min={-180} max={180} step={1} onChange={setDirDeg} unit="°" />
        <ToggleControl label="② point 광원(회전)" checked={pointOn} onChange={setPointOn} />
        <ColorControl label="② point 색" value={pointColor} onChange={setPointColor} />
        <Slider label="② 감쇠 Kq" value={kq} min={0} max={0.3} step={0.005} onChange={setKq} />
      </ControlPanel>
      <figcaption>
        종합 조명 실험실. 최종색 = ambient + (directional 기여) + (point 기여)로, 두 광원이 선형으로
        합산된다. 항 토글로 ambient·diffuse·specular 각각의 기여를 분리해 보고, point 광원을 켜면 물체
        둘레를 도는 컬러 광원이 가까울 때 밝고 멀어질 때 Kq에 따라 빠르게 어두워지는 거리 감쇠를 볼 수
        있다. 한 광원만 켜서 그 기여를 따로 본 뒤, 둘을 더했을 때의 합을 확인해 보세요.
      </figcaption>
    </figure>
  );
}
