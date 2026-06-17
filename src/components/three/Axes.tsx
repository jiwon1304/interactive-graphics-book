import { Line } from '@react-three/drei';

/**
 * 색으로 구분된 X(빨강)/Y(초록)/Z(파랑) 좌표축.
 * three의 axesHelper와 달리 굵기(선 두께)를 지정할 수 있어 모바일에서도 잘 보입니다.
 * 반드시 <Canvas> 내부에서 사용하세요.
 */
interface AxesProps {
  /** 원점에서 양의 방향으로 뻗는 축 길이 */
  length?: number;
  /** 선 두께(px) */
  lineWidth?: number;
}

export default function Axes({ length = 2, lineWidth = 2 }: AxesProps) {
  return (
    <group>
      <Line points={[[0, 0, 0], [length, 0, 0]]} color="#e5484d" lineWidth={lineWidth} />
      <Line points={[[0, 0, 0], [0, length, 0]]} color="#46a758" lineWidth={lineWidth} />
      <Line points={[[0, 0, 0], [0, 0, length]]} color="#4f9dde" lineWidth={lineWidth} />
    </group>
  );
}
