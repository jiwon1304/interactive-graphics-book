import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 그림자 데모 공용 장면: 바닥 + 떠 있는 물체들 + 그림자 드리우는 directional light.
 * three.js 내장 shadow map을 사용(ShadowConfig가 렌더러를 켠다).
 * bias/normalBias/mapSize/lightAngle를 prop으로 받아 light.shadow에 매 프레임 반영.
 */
interface ShadowSceneProps {
  bias: number;
  normalBias?: number;
  mapSize: number;
  lightAngle: number; // 광원 방위각(도)
  spin?: boolean;
}

export default function ShadowScene({
  bias,
  normalBias = 0,
  mapSize,
  lightAngle,
  spin = true,
}: ShadowSceneProps) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const light = lightRef.current;
    if (light) {
      light.shadow.bias = bias;
      light.shadow.normalBias = normalBias;
      if (light.shadow.mapSize.x !== mapSize) {
        light.shadow.mapSize.set(mapSize, mapSize);
        // 해상도가 바뀌면 기존 맵을 폐기해 다음 프레임에 새 크기로 재생성
        if (light.shadow.map) {
          light.shadow.map.dispose();
          light.shadow.map = null as unknown as THREE.WebGLRenderTarget;
        }
      }
      const a = (lightAngle * Math.PI) / 180;
      light.position.set(Math.cos(a) * 5, 5.5, Math.sin(a) * 5);
    }
    if (spin && groupRef.current) groupRef.current.rotation.y += delta * 0.3;
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        ref={lightRef}
        position={[5, 5.5, 2]}
        intensity={2.2}
        castShadow
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />

      {/* 바닥(그림자를 받음) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#c9ccd2" />
      </mesh>

      {/* 떠 있는 물체들(그림자를 드리움) — bias 효과가 잘 보이게 사면/곡면 섞음 */}
      <group ref={groupRef}>
        <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
          <torusKnotGeometry args={[0.7, 0.26, 160, 24]} />
          <meshStandardMaterial color="#3b7fd1" />
        </mesh>
        <mesh position={[1.9, -0.4, 1.2]} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#e08a3c" />
        </mesh>
        <mesh position={[-1.8, -0.3, -1]} castShadow receiveShadow>
          <sphereGeometry args={[0.65, 48, 48]} />
          <meshStandardMaterial color="#3aa86b" />
        </mesh>
      </group>
    </>
  );
}
