import { useMemo, useState } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ScreenQuad, useFBO } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import {
  ControlPanel,
  Slider,
  ColorControl,
  ToggleControl,
  SelectControl,
  type SelectOption,
} from '../../controls';
import ToonShape from '../cel-shading-ramp/ToonShape';
import { lightDirFromAngles, hexToSRGB, type ShapeKind } from '../cel-shading-ramp/shared';
import { makeBeautyMaterial, ND_VERT, ND_FRAG } from './outline';

type Channels = 'depth' | 'normal' | 'both';

const CHANNEL_OPTIONS: ReadonlyArray<SelectOption<Channels>> = [
  { value: 'depth', label: '깊이만 (실루엣·오클루전)' },
  { value: 'normal', label: '노멀만 (크리스·내부선)' },
  { value: 'both', label: '둘 다' },
];

const SHAPE_OPTIONS: ReadonlyArray<SelectOption<ShapeKind>> = [
  { value: 'sphere', label: '구' },
  { value: 'torus', label: '토러스' },
  { value: 'knot', label: '매듭' },
];

const EDGE_VERT = /* glsl */ `
  in vec2 position;
  out vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const EDGE_FRAG = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  out vec4 frag;

  uniform sampler2D uBeauty;
  uniform sampler2D uND;
  uniform vec2  uResolution;
  uniform float uDepthT;
  uniform float uNormalT;
  uniform float uThickness;   // 커널 반경(px)
  uniform float uChannels;    // 0 깊이, 1 노멀, 2 둘다
  uniform vec3  uLineColor;
  uniform float uShowBeauty;

  void main() {
    vec2 px = uThickness / uResolution;
    vec4 l = texture(uND, vUv - vec2(px.x, 0.0));
    vec4 r = texture(uND, vUv + vec2(px.x, 0.0));
    vec4 u = texture(uND, vUv + vec2(0.0, px.y));
    vec4 d = texture(uND, vUv - vec2(0.0, px.y));

    // 깊이 불연속(중심 차분) — 실루엣/오클루전 경계에서 큼
    float dDepth = abs(l.a - r.a) + abs(u.a - d.a);

    // 노멀 불연속 — 크리스(접힌 모서리)에서 큼
    vec3 nl = l.rgb * 2.0 - 1.0;
    vec3 nr = r.rgb * 2.0 - 1.0;
    vec3 nu = u.rgb * 2.0 - 1.0;
    vec3 nd = d.rgb * 2.0 - 1.0;
    float dNormal = (1.0 - dot(nl, nr)) * 0.5 + (1.0 - dot(nu, nd)) * 0.5;

    float eDepth = step(uDepthT, dDepth);
    float eNormal = step(uNormalT, dNormal);

    float edge;
    if (uChannels < 0.5) edge = eDepth;
    else if (uChannels < 1.5) edge = eNormal;
    else edge = max(eDepth, eNormal);

    vec3 base = (uShowBeauty > 0.5) ? texture(uBeauty, vUv).rgb : vec3(0.93);
    frag = vec4(mix(base, uLineColor, edge), 1.0);
  }
`;

interface Props {
  channels: Channels;
  depthT: number;
  normalT: number;
  thickness: number;
  lineColor: string;
  showBeauty: boolean;
  azimuth: number;
  shape: ShapeKind;
}

const DEPTH_SCALE = 6.0;

function Scene({ channels, depthT, normalT, thickness, lineColor, showBeauty, azimuth, shape }: Props) {
  const { gl, camera } = useThree();
  const beautyFBO = useFBO();
  const ndFBO = useFBO();
  const scene = useMemo(() => new THREE.Scene(), []);
  const beauty = useMemo(() => makeBeautyMaterial('#cf7f3a'), []);
  const ndMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: ND_VERT,
        fragmentShader: ND_FRAG,
        uniforms: { uDepthScale: { value: DEPTH_SCALE } },
        side: THREE.DoubleSide,
      }),
    [],
  );
  const edgeMat = useMemo(
    () =>
      new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: EDGE_VERT,
        fragmentShader: EDGE_FRAG,
        uniforms: {
          uBeauty: { value: null },
          uND: { value: null },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uDepthT: { value: 0.03 },
          uNormalT: { value: 0.2 },
          uThickness: { value: 1 },
          uChannels: { value: 2 },
          uLineColor: { value: new THREE.Vector3(...hexToSRGB('#10131a')) },
          uShowBeauty: { value: 1 },
        },
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  const channelCode = channels === 'depth' ? 0 : channels === 'normal' ? 1 : 2;

  useFrame(() => {
    (beauty.uniforms.uLightDir.value as THREE.Vector3).copy(lightDirFromAngles(azimuth, 28));

    const u = edgeMat.uniforms;
    u.uBeauty.value = beautyFBO.texture;
    u.uND.value = ndFBO.texture;
    (u.uResolution.value as THREE.Vector2).set(ndFBO.width, ndFBO.height);
    u.uDepthT.value = depthT;
    u.uNormalT.value = normalT;
    u.uThickness.value = thickness;
    u.uChannels.value = channelCode;
    (u.uLineColor.value as THREE.Vector3).set(...hexToSRGB(lineColor));
    u.uShowBeauty.value = showBeauty ? 1 : 0;

    const prevColor = gl.getClearColor(new THREE.Color());
    const prevAlpha = gl.getClearAlpha();

    // 1) beauty 패스 → 흰 배경 위 toon
    gl.setClearColor(0xffffff, 1);
    gl.setRenderTarget(beautyFBO);
    gl.clear();
    gl.render(scene, camera);

    // 2) G-buffer 패스 → 노멀·깊이
    scene.overrideMaterial = ndMat;
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(ndFBO);
    gl.clear();
    gl.render(scene, camera);
    scene.overrideMaterial = null;

    gl.setRenderTarget(null);
    gl.setClearColor(prevColor, prevAlpha);
  });

  return (
    <>
      {createPortal(
        <ToonShape shape={shape}>
          <primitive object={beauty} attach="material" />
        </ToonShape>,
        scene,
      )}
      <ScreenQuad>
        <primitive object={edgeMat} attach="material" />
      </ScreenQuad>
    </>
  );
}

/**
 * 위젯 3 — 이미지 기반 에지 검출(후처리).
 * 장면을 노멀·깊이 G-buffer로 한 번, beauty로 한 번 렌더한 뒤, 풀스크린 패스에서 이웃 픽셀과
 * 비교해 불연속을 찾는다. 깊이 불연속 = 실루엣/오클루전, 노멀 불연속 = 크리스(내부선).
 * inverted-hull이 못 그리는 내부선을 잡아낸다.
 */
export default function EdgeDetect() {
  const [channels, setChannels] = useState<Channels>('both');
  const [depthT, setDepthT] = useState(0.03);
  const [normalT, setNormalT] = useState(0.2);
  const [thickness, setThickness] = useState(1);
  const [lineColor, setLineColor] = useState('#10131a');
  const [showBeauty, setShowBeauty] = useState(true);
  const [azimuth, setAzimuth] = useState(40);
  const [shape, setShape] = useState<ShapeKind>('knot');

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={360}>
        <Scene
          channels={channels}
          depthT={depthT}
          normalT={normalT}
          thickness={thickness}
          lineColor={lineColor}
          showBeauty={showBeauty}
          azimuth={azimuth}
          shape={shape}
        />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <SelectControl label="에지 채널" value={channels} options={CHANNEL_OPTIONS} onChange={setChannels} />
        <Slider
          label="깊이 임계"
          value={depthT}
          min={0.005}
          max={0.15}
          step={0.005}
          onChange={setDepthT}
          format={(v) => v.toFixed(3)}
        />
        <Slider
          label="노멀 임계"
          value={normalT}
          min={0.02}
          max={1}
          step={0.02}
          onChange={setNormalT}
          format={(v) => v.toFixed(2)}
        />
        <Slider label="선 두께 (커널 px)" value={thickness} min={0.5} max={3} step={0.1} onChange={setThickness} />
        <ColorControl label="선 색" value={lineColor} onChange={setLineColor} />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
        <ToggleControl label="beauty 위에 합성" checked={showBeauty} onChange={setShowBeauty} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 채널을 "깊이만"으로 두면 바깥 실루엣과 가려짐 경계만, "노멀만"으로
        두면 표면이 접히는 <em>내부선</em>만 나타납니다. inverted-hull은 전자만 그릴 수 있습니다. 임계를
        낮추면 더 약한 불연속까지 선이 되고, "beauty 위에 합성"을 끄면 순수 라인아트가 됩니다.
      </figcaption>
    </figure>
  );
}
