import { useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, SelectControl, type SelectOption } from '../../controls';
import { SCENE_OBJECTS, FLOOR, type SceneObject } from './scene';
import { VERTEX, FRAGMENT } from './gbuffer.glsl';

type Channel = 'lit' | 'albedo' | 'normal' | 'depth';
const CHANNEL_OPTIONS: ReadonlyArray<SelectOption<Channel>> = [
  { value: 'lit', label: '최종 결과 (합성)' },
  { value: 'albedo', label: 'G-buffer · albedo (색)' },
  { value: 'normal', label: 'G-buffer · normal (법선)' },
  { value: 'depth', label: 'G-buffer · depth (깊이)' },
];
const CHANNEL_INDEX: Record<Channel, number> = { lit: 0, albedo: 1, normal: 2, depth: 3 };

// sRGB hex → 선형 RGB(대략)
function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return srgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))) as [
    number,
    number,
    number,
  ];
}

function ChannelMesh({ obj, channel }: { obj: SceneObject; channel: Channel }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uChannel: { value: 0 },
          uAlbedo: { value: new THREE.Vector3(0.8, 0.3, 0.3) },
          uNear: { value: 2.0 },
          uFar: { value: 9.0 },
          uLightDir: { value: new THREE.Vector3(0.6, 0.8, 0.5).normalize() },
        },
      }),
    [],
  );

  useFrame(() => {
    const [r, g, b] = hexToLinear(obj.albedo);
    (material.uniforms.uAlbedo.value as THREE.Vector3).set(r, g, b);
    material.uniforms.uChannel.value = CHANNEL_INDEX[channel];
  });

  const s = obj.scale ?? 1;
  return (
    <mesh position={obj.position} rotation={obj.rotation ?? [0, 0, 0]} scale={s}>
      {obj.kind === 'box' && <boxGeometry args={[1.3, 1.3, 1.3]} />}
      {obj.kind === 'sphere' && <sphereGeometry args={[0.9, 48, 48]} />}
      {obj.kind === 'torus' && <torusGeometry args={[0.6, 0.26, 24, 48]} />}
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function FloorMesh({ channel }: { channel: Channel }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uChannel: { value: 0 },
          uAlbedo: { value: new THREE.Vector3(0.3, 0.32, 0.35) },
          uNear: { value: 2.0 },
          uFar: { value: 9.0 },
          uLightDir: { value: new THREE.Vector3(0.6, 0.8, 0.5).normalize() },
        },
      }),
    [],
  );
  useFrame(() => {
    const [r, g, b] = hexToLinear(FLOOR.albedo);
    (material.uniforms.uAlbedo.value as THREE.Vector3).set(r, g, b);
    material.uniforms.uChannel.value = CHANNEL_INDEX[channel];
  });
  return (
    <mesh position={[0, FLOOR.y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[12, 12]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * 위젯 1 — G-buffer 채널 뷰어.
 * 같은 장면(지오메트리는 단 한 번 그려짐)을 albedo·normal·depth 채널로 갈아 끼워 본다.
 * "과정": 디퍼드의 1차 패스가 화면 픽셀마다 어떤 정보를 저장하는지를, 채널을 토글하며 직접 본다.
 */
export default function GBufferChannels() {
  const [channel, setChannel] = useState<Channel>('lit');
  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 1.4, 6]} height={380}>
        {SCENE_OBJECTS.map((o, i) => (
          <ChannelMesh key={i} obj={o} channel={channel} />
        ))}
        <FloorMesh channel={channel} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>
      <ControlPanel>
        <SelectControl label="표시 채널" value={channel} options={CHANNEL_OPTIONS} onChange={setChannel} />
      </ControlPanel>
      <figcaption>
        지오메트리는 단 한 번만 래스터화됩니다. 디퍼드의 1차 패스는 그때 각 화면 픽셀의 <strong>색
        (albedo)</strong>, <strong>법선(normal)</strong>, <strong>깊이(depth)</strong>를 텍스처에
        기록해 둡니다. 채널을 바꿔 보세요 — normal은 표면 방향을 RGB로 인코딩한 것이고(법선
        <code>n</code>을 <code>n·0.5+0.5</code>로), depth는 가까울수록 밝습니다. 조명은 아직
        하나도 계산되지 않았습니다. 이 버퍼들만 있으면 조명은 나중에 화면공간에서 풀 수 있습니다.
      </figcaption>
    </figure>
  );
}
