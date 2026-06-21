import { useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
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
import {
  makeBeautyMaterial,
  OUTLINE_VERT_OBJECT,
  OUTLINE_FRAG,
} from './outline';

const SHAPE_OPTIONS: ReadonlyArray<SelectOption<ShapeKind>> = [
  { value: 'sphere', label: '구' },
  { value: 'torus', label: '토러스' },
  { value: 'knot', label: '매듭' },
];

interface Props {
  width: number;
  color: string;
  azimuth: number;
  hullOnly: boolean;
  shape: ShapeKind;
}

function Scene({ width, color, azimuth, hullOnly, shape }: Props) {
  const beauty = useMemo(() => makeBeautyMaterial('#d98a3d'), []);
  const outline = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: OUTLINE_VERT_OBJECT,
        fragmentShader: OUTLINE_FRAG,
        uniforms: {
          uWidth: { value: 0.03 },
          uColor: { value: new THREE.Vector3(...hexToSRGB('#1a1320')) },
        },
        side: THREE.BackSide,
      }),
    [],
  );

  useFrame(() => {
    outline.uniforms.uWidth.value = width;
    (outline.uniforms.uColor.value as THREE.Vector3).set(...hexToSRGB(color));
    // hullOnly: 부푼 셸을 앞면(FrontSide)으로 채워 "법선 따라 부푼 복제본"임을 드러낸다.
    outline.side = hullOnly ? THREE.FrontSide : THREE.BackSide;
    (beauty.uniforms.uLightDir.value as THREE.Vector3).copy(lightDirFromAngles(azimuth, 28));
  });

  return (
    <group>
      {!hullOnly && (
        <ToonShape shape={shape}>
          <primitive object={beauty} attach="material" />
        </ToonShape>
      )}
      <ToonShape shape={shape}>
        <primitive object={outline} attach="material" />
      </ToonShape>
    </group>
  );
}

/**
 * 위젯 1 — Inverted-hull 아웃라인.
 * 같은 메시를 법선 방향으로 width만큼 부풀려 한 번 더 그리되, 백페이스만 남긴다(BackSide).
 * 부푼 셸의 뒷면은 원본 실루엣 바깥으로만 비어져 나오므로 테두리가 된다. "셸만 보기"로
 * 그 정체(부푼 복제본)를 드러낸다 — 과정 위젯.
 */
export default function InvertedHull() {
  const [width, setWidth] = useState(0.03);
  const [color, setColor] = useState('#1a1320');
  const [azimuth, setAzimuth] = useState(40);
  const [hullOnly, setHullOnly] = useState(false);
  const [shape, setShape] = useState<ShapeKind>('knot');

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={360}>
        <Scene width={width} color={color} azimuth={azimuth} hullOnly={hullOnly} shape={shape} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <Slider
          label="두께 width (object 단위)"
          value={width}
          min={0}
          max={0.08}
          step={0.002}
          onChange={setWidth}
          format={(v) => v.toFixed(3)}
        />
        <ColorControl label="선 색" value={color} onChange={setColor} />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
        <ToggleControl label="부푼 셸만 보기" checked={hullOnly} onChange={setHullOnly} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> width를 올리면 테두리가 두꺼워집니다. "부푼 셸만 보기"를 켜면
        아웃라인의 정체 — 법선을 따라 균일하게 부풀린 메시 복제본 — 이 보입니다. 평소엔 이 복제본의
        <em>백페이스</em>만 그려, 원본 뒤로 비어져 나온 가장자리만 테두리로 남습니다.
      </figcaption>
    </figure>
  );
}
