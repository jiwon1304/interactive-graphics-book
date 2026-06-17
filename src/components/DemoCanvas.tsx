import { Suspense, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { StandardLights, Axes, GroundGrid } from './three';

interface DemoCanvasProps {
  children: ReactNode;
  /** 캔버스 CSS 높이(px). 모바일을 고려해 기본 360 */
  height?: number;
  /** true=매 프레임 렌더(애니메이션), false=변화가 있을 때만 렌더(배터리 절약) */
  animate?: boolean;
  /** 카메라 초기 위치 */
  cameraPosition?: [number, number, number];
  /** 표준 조명 세트(ambient + key/fill)를 자동 추가. 기본 true */
  lights?: boolean;
  /** X/Y/Z 좌표축 표시 */
  axes?: boolean;
  /** 바닥 기준 격자 표시 */
  grid?: boolean;
}

/**
 * 모든 3D 데모가 공유하는 래퍼.
 * - dpr 상한을 2로 제한해 모바일 고해상도에서 픽셀 과다 렌더를 방지
 * - frameloop를 'demand'로 두면 상호작용이 없을 때 GPU를 쉬게 함
 * - touch-action 처리는 .demo-canvas CSS(global.css)에서 담당
 * - lights/axes/grid 옵션으로 공통 장면 요소를 반복 작성 없이 켤 수 있음
 */
export default function DemoCanvas({
  children,
  height = 360,
  animate = true,
  cameraPosition = [3, 2, 4],
  lights = true,
  axes = false,
  grid = false,
}: DemoCanvasProps) {
  return (
    <div className="demo-canvas" style={{ height }}>
      <Canvas
        dpr={[1, 2]}
        frameloop={animate ? 'always' : 'demand'}
        camera={{ position: cameraPosition, fov: 50 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          {lights && <StandardLights />}
          {axes && <Axes />}
          {grid && <GroundGrid />}
          {children}
        </Suspense>
      </Canvas>
    </div>
  );
}
