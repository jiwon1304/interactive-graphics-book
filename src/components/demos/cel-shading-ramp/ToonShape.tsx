import type { ReactNode } from 'react';
import type { ShapeKind } from './shared';

/**
 * 공용 도형 지오메트리 + 머티리얼 슬롯.
 * 셀 셰이딩 위젯들이 같은 도형 풀(구/토러스/매듭)을 공유하도록 한다.
 * children에 머티리얼(<primitive .../>)을 넣어 쓴다.
 */
export default function ToonShape({
  shape,
  children,
}: {
  shape: ShapeKind;
  children: ReactNode;
}) {
  return (
    <mesh>
      {shape === 'sphere' && <sphereGeometry args={[1.3, 128, 128]} />}
      {shape === 'torus' && <torusGeometry args={[0.95, 0.42, 96, 192]} />}
      {shape === 'knot' && <torusKnotGeometry args={[0.85, 0.3, 220, 32]} />}
      {children}
    </mesh>
  );
}
