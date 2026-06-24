import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * <Canvas> 내부에서 렌더러의 shadow map을 구성한다.
 * DemoCanvas는 shadows prop을 노출하지 않으므로, 여기서 gl.shadowMap을 직접 켠다.
 * type 변경 시 needsUpdate=true로 다음 프레임에 그림자 맵을 다시 빌드한다.
 */
export type ShadowKind = 'hard' | 'soft';

const TYPE_MAP: Record<ShadowKind, THREE.ShadowMapType> = {
  hard: THREE.BasicShadowMap,
  soft: THREE.PCFShadowMap,
};

export default function ShadowConfig({ kind }: { kind: ShadowKind }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = TYPE_MAP[kind];
    gl.shadowMap.needsUpdate = true;
  }, [gl, kind]);
  return null;
}
