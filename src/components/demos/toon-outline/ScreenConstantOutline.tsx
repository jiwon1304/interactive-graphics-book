import { useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import {
  ControlPanel,
  Slider,
  SelectControl,
  type SelectOption,
} from '../../controls';
import ToonShape from '../cel-shading-ramp/ToonShape';
import { lightDirFromAngles, hexToSRGB, type ShapeKind } from '../cel-shading-ramp/shared';
import {
  makeBeautyMaterial,
  OUTLINE_VERT_OBJECT,
  OUTLINE_VERT_SCREEN,
  OUTLINE_FRAG,
} from './outline';

type Mode = 'object' | 'screen';

const MODE_OPTIONS: ReadonlyArray<SelectOption<Mode>> = [
  { value: 'object', label: 'object 공간 (n·width)' },
  { value: 'screen', label: '화면공간 일정 (clip.w 보정)' },
];

const SHAPE_OPTIONS: ReadonlyArray<SelectOption<ShapeKind>> = [
  { value: 'sphere', label: '구' },
  { value: 'torus', label: '토러스' },
  { value: 'knot', label: '매듭' },
];

function Scene({ mode, t, shape }: { mode: Mode; t: number; shape: ShapeKind }) {
  const { size, gl } = useThree();
  const beauty = useMemo(() => makeBeautyMaterial('#3a7fcf'), []);
  const objMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: OUTLINE_VERT_OBJECT,
        fragmentShader: OUTLINE_FRAG,
        uniforms: {
          uWidth: { value: 0.03 },
          uColor: { value: new THREE.Vector3(...hexToSRGB('#11141a')) },
        },
        side: THREE.BackSide,
      }),
    [],
  );
  const screenMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: OUTLINE_VERT_SCREEN,
        fragmentShader: OUTLINE_FRAG,
        uniforms: {
          uWidth: { value: 3 },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uColor: { value: new THREE.Vector3(...hexToSRGB('#11141a')) },
        },
        side: THREE.BackSide,
      }),
    [],
  );

  useFrame(() => {
    // 같은 슬라이더 t(0..1)를 두 모드에 맞는 단위로 매핑 — 모드를 바꿔도 굵기 체감이 비슷하게.
    objMat.uniforms.uWidth.value = t * 0.06;
    screenMat.uniforms.uWidth.value = t * 6.0;
    const dpr = gl.getPixelRatio();
    (screenMat.uniforms.uResolution.value as THREE.Vector2).set(size.width * dpr, size.height * dpr);
    (beauty.uniforms.uLightDir.value as THREE.Vector3).copy(lightDirFromAngles(40, 28));
  });

  const outline = mode === 'object' ? objMat : screenMat;

  return (
    <group>
      <ToonShape shape={shape}>
        <primitive object={beauty} attach="material" />
      </ToonShape>
      <ToonShape shape={shape}>
        <primitive object={outline} attach="material" />
      </ToonShape>
    </group>
  );
}

/**
 * 위젯 2 — 화면공간 일정 두께.
 * object 공간 extrude는 카메라가 멀어지면 테두리도 함께 얇아진다(원근 분할 때문). clip.w를
 * 곱해 ÷w를 상쇄하면 거리와 무관하게 화면 두께가 일정해진다. 줌인/아웃하며 두 모드를 비교.
 */
export default function ScreenConstantOutline() {
  const [mode, setMode] = useState<Mode>('object');
  const [t, setT] = useState(0.5);
  const [shape, setShape] = useState<ShapeKind>('torus');

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={360}>
        <Scene mode={mode} t={t} shape={shape} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <SelectControl label="두께 모드" value={mode} options={MODE_OPTIONS} onChange={setMode} />
        <Slider
          label="굵기"
          value={t}
          min={0}
          max={1}
          step={0.01}
          onChange={setT}
          format={(v) => v.toFixed(2)}
        />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 마우스 휠(또는 핀치)로 줌인/아웃하면서 두 모드를 비교하세요.
        <em>object 공간</em>은 멀어질수록 테두리가 얇아지고 가까이서는 굵어집니다 — 원근 분할의
        직접적 결과입니다. <em>화면공간 일정</em>은 clip.w를 곱해 그 분할을 상쇄하므로, 거리가 변해도
        테두리 두께가 유지됩니다.
      </figcaption>
    </figure>
  );
}
