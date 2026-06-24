import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { SCENE_OBJECTS, FLOOR, type SceneObject } from './scene';

const MAX_LIGHTS = 24;

// 시드형 색·위치(SSR에서도 안정적이도록 결정적 함수).
function lightColor(i: number): THREE.Color {
  const hue = (i * 0.61803398875) % 1; // 황금비로 색상환을 고르게
  const c = new THREE.Color();
  c.setHSL(hue, 0.85, 0.55);
  return c;
}
function lightBasePos(i: number): [number, number, number] {
  const a = i * 2.39996; // 황금각
  const r = 2.2 + 1.4 * ((i % 5) / 5);
  return [Math.cos(a) * r, 0.4 + 0.9 * Math.sin(i * 1.7), Math.sin(a) * r];
}

function SceneMesh({ obj }: { obj: SceneObject }) {
  const s = obj.scale ?? 1;
  return (
    <mesh position={obj.position} rotation={obj.rotation ?? [0, 0, 0]} scale={s}>
      {obj.kind === 'box' && <boxGeometry args={[1.3, 1.3, 1.3]} />}
      {obj.kind === 'sphere' && <sphereGeometry args={[0.9, 48, 48]} />}
      {obj.kind === 'torus' && <torusGeometry args={[0.6, 0.26, 24, 48]} />}
      <meshStandardMaterial color={obj.albedo} roughness={0.55} metalness={0.0} />
    </mesh>
  );
}

function MovingLight({ index, animate, showGizmo }: { index: number; animate: boolean; showGizmo: boolean }) {
  const ref = useRef<THREE.PointLight>(null);
  const base = useMemo(() => lightBasePos(index), [index]);
  const color = useMemo(() => lightColor(index), [index]);
  useFrame(({ clock }) => {
    if (!ref.current || !animate) return;
    const t = clock.elapsedTime * 0.5 + index;
    ref.current.position.set(
      base[0] + Math.cos(t) * 0.5,
      base[1] + Math.sin(t * 1.3) * 0.4,
      base[2] + Math.sin(t) * 0.5,
    );
  });
  return (
    <pointLight ref={ref} position={base} color={color} intensity={6} distance={6} decay={2}>
      {showGizmo && (
        <mesh>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
    </pointLight>
  );
}

/**
 * 위젯 3 — "지오메트리 1회 + 라이트 N"을 눈으로.
 * 같은 장면에 점광원을 1~24개까지 더한다. 디퍼드에서는 이 광원들이 G-buffer 위에서
 * 화면공간으로 누적되며, 지오메트리는 다시 그려지지 않는다.
 * "과정": 광원이 하나씩 늘 때 색이 어떻게 겹쳐 쌓이는지(accumulation)를 직접 본다.
 */
export default function ManyLights() {
  const [count, setCount] = useState(8);
  const [animate, setAnimate] = useState(true);
  const [showGizmo, setShowGizmo] = useState(true);
  const lights = Array.from({ length: count }, (_, i) => i);
  return (
    <figure className="demo">
      <DemoCanvas lights={false} animate={animate} cameraPosition={[0, 1.6, 6.5]} height={380}>
        <ambientLight intensity={0.08} />
        {lights.map((i) => (
          <MovingLight key={i} index={i} animate={animate} showGizmo={showGizmo} />
        ))}
        {SCENE_OBJECTS.map((o, i) => (
          <SceneMesh key={i} obj={o} />
        ))}
        <mesh position={[0, FLOOR.y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[14, 14]} />
          <meshStandardMaterial color={FLOOR.albedo} roughness={0.9} />
        </mesh>
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>
      <ControlPanel>
        <Slider label="광원 수" value={count} min={1} max={MAX_LIGHTS} step={1} onChange={setCount} />
        <ToggleControl label="광원 애니메이션" checked={animate} onChange={setAnimate} />
        <ToggleControl label="광원 위치 표시" checked={showGizmo} onChange={setShowGizmo} />
      </ControlPanel>
      <figcaption>
        광원 수를 끌어올려 보세요. 디퍼드에서 이 점광원들은 지오메트리를 다시 그리지 않고 G-buffer
        위에서 화면공간으로 누적됩니다 — 각 광원은 자기가 닿는 화면 영역의 픽셀만 셰이딩하면 되죠.
        이 데모는 three.js 표준 라이팅(포워드)으로 그리지만, "광원이 많아질수록 화면이 색으로
        뒤덮이는" 결과는 디퍼드가 저렴하게 만들고 싶어 하는 바로 그 장면입니다. 광원이 24개여도
        오브젝트는 여전히 한 번씩만 그려진다는 점에 주목하세요.
      </figcaption>
    </figure>
  );
}
