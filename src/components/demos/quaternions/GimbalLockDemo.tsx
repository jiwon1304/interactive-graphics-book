import { useMemo, useState } from 'react';
import { OrbitControls, Html } from '@react-three/drei';
import DemoCanvas from '../../DemoCanvas';
import {
  ControlPanel,
  Slider,
  ToggleControl,
  SelectControl,
  type SelectOption,
} from '../../controls';

// 자유롭게 회전(보통)할지, 짐벌 락 자세로 바로 점프할지 고르는 프리셋.
type Preset = 'free' | 'locked';
const PRESET_OPTIONS: ReadonlyArray<SelectOption<Preset>> = [
  { value: 'free', label: '자유 회전' },
  { value: 'locked', label: '짐벌 락 자세로 점프 (가운데 90°)' },
];

const DEG = Math.PI / 180;

// 링 색: 평상시 / 짐벌 락으로 정렬되어 빨갛게 강조될 때.
const RING_OUTER = '#46a758'; // Y / yaw (바깥)
const RING_MIDDLE = '#e5a23b'; // X / pitch (가운데)
const RING_INNER = '#4f9dde'; // Z / roll (안쪽)
const RING_LOCKED = '#e5484d';

interface RingProps {
  radius: number;
  color: string;
  /** 토러스를 어느 축 평면에 눕힐지: 'x'면 X축을 법선으로 하는 링 등 */
  plane: 'x' | 'y' | 'z';
}

/** 한 개의 짐벌 링(토러스). 부모 <group> 회전을 그대로 물려받습니다. */
function Ring({ radius, color, plane }: RingProps) {
  // torusGeometry는 XY 평면에 그려지므로(법선 = Z), 원하는 평면으로 눕힙니다.
  const rotation = useMemo<[number, number, number]>(() => {
    if (plane === 'x') return [0, Math.PI / 2, 0]; // 법선이 X축
    if (plane === 'y') return [Math.PI / 2, 0, 0]; // 법선이 Y축
    return [0, 0, 0]; // 법선이 Z축
  }, [plane]);
  return (
    <mesh rotation={rotation}>
      <torusGeometry args={[radius, 0.035, 16, 96]} />
      <meshStandardMaterial color={color} metalness={0.1} roughness={0.5} />
    </mesh>
  );
}

interface GimbalProps {
  yaw: number; // Y, 바깥 링 (도)
  pitch: number; // X, 가운데 링 (도)
  roll: number; // Z, 안쪽 링 (도)
  highlight: boolean;
  locked: boolean;
}

/**
 * 세 겹의 중첩된 짐벌. group 안에 group을 넣어 자식 링이 부모 회전을 상속합니다.
 * 회전 순서: yaw(Y) → pitch(X) → roll(Z) (외재적으로 보면 Y·X·Z).
 */
function Gimbal({ yaw, pitch, roll, highlight, locked }: GimbalProps) {
  // 짐벌 락이면 바깥(Y)·안쪽(Z) 링이 사실상 같은 축을 돈다 → 둘 다 강조.
  const lockedColor = highlight && locked;
  const outerColor = lockedColor ? RING_LOCKED : RING_OUTER;
  const innerColor = lockedColor ? RING_LOCKED : RING_INNER;

  return (
    // 바깥 링: Y축(yaw) 회전
    <group rotation={[0, yaw * DEG, 0]}>
      <Ring radius={2.0} color={outerColor} plane="y" />
      {/* 가운데 링: X축(pitch) 회전 — 바깥 회전을 상속 */}
      <group rotation={[pitch * DEG, 0, 0]}>
        <Ring radius={1.6} color={RING_MIDDLE} plane="x" />
        {/* 안쪽 링: Z축(roll) 회전 — 위 두 회전을 모두 상속 */}
        <group rotation={[0, 0, roll * DEG]}>
          <Ring radius={1.2} color={innerColor} plane="z" />
          {/* 최종 자세를 보여주는 화살표(원뿔) */}
          <mesh position={[0, 0.55, 0]}>
            <coneGeometry args={[0.28, 1.1, 24]} />
            <meshStandardMaterial color="#e6e8ee" metalness={0.2} roughness={0.4} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.09, 0.09, 1.1, 16]} />
            <meshStandardMaterial color="#9aa3b2" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/**
 * 짐벌 락 데모 — 오일러 각의 근본적 약점을 손으로 느끼게 한다.
 * 가운데(pitch) 링을 ±90°로 돌리면 바깥(yaw)·안쪽(roll) 축이 평행해져
 * 자유도 하나를 잃는다. 그 순간을 빨간색과 라벨로 알려준다.
 */
export default function GimbalLockDemo() {
  const [yaw, setYaw] = useState(20);
  const [pitch, setPitch] = useState(0);
  const [roll, setRoll] = useState(-15);
  const [highlight, setHighlight] = useState(true);
  const [preset, setPreset] = useState<Preset>('free');

  // 가운데 각이 ±90°에 가까우면 짐벌 락.
  const lockedness = Math.abs(Math.abs(pitch) - 90); // 0이면 완전 락
  const locked = lockedness < 6;

  function applyPreset(next: Preset) {
    setPreset(next);
    if (next === 'locked') setPitch(90);
  }

  return (
    <figure className="demo">
      <DemoCanvas animate={false} cameraPosition={[4, 3, 5]}>
        <Gimbal
          yaw={yaw}
          pitch={pitch}
          roll={roll}
          highlight={highlight}
          locked={locked}
        />
        {locked && highlight && (
          <Html center position={[0, 2.6, 0]} distanceFactor={9}>
            <div
              style={{
                whiteSpace: 'nowrap',
                background: '#e5484d',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(0,0,0,.35)',
              }}
            >
              짐벌 락! 자유도 1 손실
            </div>
          </Html>
        )}
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <SelectControl
          label="프리셋"
          value={preset}
          options={PRESET_OPTIONS}
          onChange={applyPreset}
        />
        <Slider
          label="요 (yaw, Y · 바깥 링)"
          value={yaw}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => {
            setYaw(v);
            setPreset('free');
          }}
          unit="°"
        />
        <Slider
          label="피치 (pitch, X · 가운데 링)"
          value={pitch}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => {
            setPitch(v);
            setPreset('free');
          }}
          unit="°"
        />
        <Slider
          label="롤 (roll, Z · 안쪽 링)"
          value={roll}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => {
            setRoll(v);
            setPreset('free');
          }}
          unit="°"
        />
        <ToggleControl
          label="두 자유도 정렬 강조"
          checked={highlight}
          onChange={setHighlight}
        />
      </ControlPanel>

      <figcaption>
        피치(가운데 링)를 <strong>±90°</strong>로 돌려보세요. 바깥(요)·안쪽(롤) 링의 회전축이
        겹쳐 빨갛게 변하고, 두 슬라이더를 아무리 움직여도 화살표는 <em>같은 한 축</em>으로만 돕니다.
        세 회전축 중 두 축이 같은 방향이 되어 독립성을 잃는 — 자유도 손실을 직접 확인해 보세요.
      </figcaption>
    </figure>
  );
}
