import type { ReactNode } from 'react';
import type { ShapeKind } from './shared';

/**
 * 조명 위젯들이 공유하는 도형 풀(구/토러스/매듭) + 머티리얼 슬롯.
 * children에 머티리얼(<primitive .../> 또는 표준 머티리얼)을 넣어 쓴다.
 */
export default function LightShape({
  shape,
  children,
}: {
  shape: ShapeKind;
  children: ReactNode;
}) {
  return (
    <mesh castShadow receiveShadow>
      {shape === 'sphere' && <sphereGeometry args={[1.3, 128, 128]} />}
      {shape === 'torus' && <torusGeometry args={[0.95, 0.42, 96, 192]} />}
      {shape === 'knot' && <torusKnotGeometry args={[0.85, 0.3, 220, 32]} />}
      {children}
    </mesh>
  );
}
