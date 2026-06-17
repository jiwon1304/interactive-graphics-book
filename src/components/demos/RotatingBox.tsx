import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Mesh } from 'three';
import DemoCanvas from '../DemoCanvas';
import {
  ControlPanel,
  Slider,
  ColorControl,
  ToggleControl,
  SelectControl,
  type SelectOption,
} from '../controls';

// 선택 가능한 도형들. SelectControl의 제네릭에 그대로 쓰여 타입이 좁혀집니다.
type ShapeKind = 'box' | 'sphere' | 'torus';
const SHAPE_OPTIONS: ReadonlyArray<SelectOption<ShapeKind>> = [
  { value: 'box', label: '정육면체' },
  { value: 'sphere', label: '구' },
  { value: 'torus', label: '원환' },
];

interface SpinningShapeProps {
  shape: ShapeKind;
  speed: number;
  color: string;
  wireframe: boolean;
}

/** 선택된 도형을 회전시키는 메시. 반드시 <Canvas> 내부에서 렌더됨. */
function SpinningShape({ shape, speed, color, wireframe }: SpinningShapeProps) {
  const mesh = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.x += delta * speed;
    mesh.current.rotation.y += delta * speed * 0.6;
  });
  return (
    <mesh ref={mesh}>
      {shape === 'box' && <boxGeometry args={[1.5, 1.5, 1.5]} />}
      {shape === 'sphere' && <sphereGeometry args={[1, 32, 32]} />}
      {shape === 'torus' && <torusGeometry args={[0.8, 0.32, 24, 64]} />}
      <meshStandardMaterial color={color} wireframe={wireframe} />
    </mesh>
  );
}

/**
 * 챕터 데모의 표준 형태 예시:
 * React state로 파라미터를 들고 → 컨트롤(UI)과 3D 장면이 함께 반응.
 * 새 데모를 만들 때 이 구조(controls + three 헬퍼 + DemoCanvas)를 복사해서 시작하세요.
 */
export default function RotatingBox() {
  const [speed, setSpeed] = useState(0.8);
  const [color, setColor] = useState('#4f9dde');
  const [shape, setShape] = useState<ShapeKind>('box');
  const [wireframe, setWireframe] = useState(false);
  const [showAxes, setShowAxes] = useState(false);
  const [showGrid, setShowGrid] = useState(true);

  return (
    <figure className="demo">
      {/* lights는 DemoCanvas가 기본 제공, axes/grid는 토글에 연동 */}
      <DemoCanvas axes={showAxes} grid={showGrid}>
        <SpinningShape shape={shape} speed={speed} color={color} wireframe={wireframe} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <Slider
          label="회전 속도"
          value={speed}
          min={0}
          max={3}
          step={0.05}
          onChange={setSpeed}
          format={(v) => `${v.toFixed(2)}x`}
        />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
        <ColorControl label="색상" value={color} onChange={setColor} />
        <ToggleControl label="와이어프레임" checked={wireframe} onChange={setWireframe} />
        <ToggleControl label="좌표축 표시" checked={showAxes} onChange={setShowAxes} />
        <ToggleControl label="격자 표시" checked={showGrid} onChange={setShowGrid} />
      </ControlPanel>

      <figcaption>
        드래그로 카메라 회전, 두 손가락으로 확대/축소. 슬라이더·드롭다운·토글로 도형과 모양을 바꿔보세요.
      </figcaption>
    </figure>
  );
}
