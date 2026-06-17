import { Grid } from '@react-three/drei';

/**
 * 바닥 기준 격자. 물체의 위치·크기를 가늠하는 보조선 역할.
 * drei의 <Grid/>를 사용해 카메라 거리에 따라 자연스럽게 페이드됩니다.
 * 반드시 <Canvas> 내부에서 사용하세요.
 */
interface GroundGridProps {
  /** 격자 전체 한 변의 크기 */
  size?: number;
  /** 바닥 높이(Y). 기본은 원점 약간 아래 */
  y?: number;
}

export default function GroundGrid({ size = 12, y = -1 }: GroundGridProps) {
  return (
    <Grid
      position={[0, y, 0]}
      args={[size, size]}
      cellSize={0.5}
      cellThickness={0.6}
      cellColor="#6f7785"
      sectionSize={2.5}
      sectionThickness={1}
      sectionColor="#4f9dde"
      fadeDistance={size * 1.6}
      fadeStrength={1}
      followCamera={false}
      infiniteGrid={false}
    />
  );
}
