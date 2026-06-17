import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Mesh } from 'three';
import DemoCanvas from '../DemoCanvas';

function Box({ speed, color }: { speed: number; color: string }) {
  const mesh = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.x += delta * speed;
    mesh.current.rotation.y += delta * speed * 0.6;
  });
  return (
    <mesh ref={mesh}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/**
 * 챕터 데모의 표준 형태 예시:
 * React state로 파라미터를 들고 → 컨트롤(UI)과 3D 장면이 함께 반응.
 * 새 데모를 만들 때 이 구조를 복사해서 시작하면 됩니다.
 */
export default function RotatingBox() {
  const [speed, setSpeed] = useState(0.8);
  const [color, setColor] = useState('#4f9dde');

  return (
    <figure className="demo">
      <DemoCanvas>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <Box speed={speed} color={color} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <div className="demo-controls">
        <label>
          회전 속도: {speed.toFixed(2)}
          <input
            type="range"
            min={0}
            max={3}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </label>
        <label>
          색상
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      </div>

      <figcaption>드래그로 카메라 회전, 두 손가락으로 확대/축소. 슬라이더로 속도·색을 바꿔보세요.</figcaption>
    </figure>
  );
}
