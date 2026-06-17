import { useMemo, useState, type CSSProperties } from 'react';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import {
  ControlPanel,
  Slider,
  SelectControl,
  type SelectOption,
} from '../../controls';
import { Axes } from '../../three';

const DEG = Math.PI / 180;

type AxisKind = 'x' | 'y' | 'z';
const AXIS_OPTIONS: ReadonlyArray<SelectOption<AxisKind>> = [
  { value: 'x', label: 'X축' },
  { value: 'y', label: 'Y축' },
  { value: 'z', label: 'Z축' },
];

const AXIS_VEC: Record<AxisKind, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

type Order = 'AB' | 'BA';
const ORDER_OPTIONS: ReadonlyArray<SelectOption<Order>> = [
  { value: 'AB', label: 'A∘B (B를 먼저, 그다음 A)' },
  { value: 'BA', label: 'B∘A (A를 먼저, 그다음 B)' },
];

interface GizmoProps {
  quat: [number, number, number, number];
}

function Gizmo({ quat }: GizmoProps) {
  return (
    <group quaternion={quat}>
      <Arrow dir="x" color="#e5484d" />
      <Arrow dir="y" color="#46a758" />
      <Arrow dir="z" color="#4f9dde" />
      {/* 자세를 비대칭으로 만들어 회전을 읽기 쉽게 하는 작은 판 */}
      <mesh position={[0.45, 0.45, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.08]} />
        <meshStandardMaterial color="#e6e8ee" metalness={0.1} roughness={0.5} />
      </mesh>
    </group>
  );
}

interface ArrowProps {
  dir: AxisKind;
  color: string;
}

function Arrow({ dir, color }: ArrowProps) {
  const { pos, rot } = useMemo(() => {
    const rotation: Record<AxisKind, [number, number, number]> = {
      x: [0, 0, -Math.PI / 2],
      y: [0, 0, 0],
      z: [Math.PI / 2, 0, 0],
    };
    const position: Record<AxisKind, [number, number, number]> = {
      x: [0.6, 0, 0],
      y: [0, 0.6, 0],
      z: [0, 0, 0.6],
    };
    return { pos: position[dir], rot: rotation[dir] };
  }, [dir]);
  return (
    <group position={pos} rotation={rot}>
      <mesh>
        <cylinderGeometry args={[0.04, 0.04, 1.2, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <coneGeometry args={[0.12, 0.28, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

const monoRow: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.9rem',
};

function fmtQuat(q: THREE.Quaternion): string {
  const f = (v: number) => (v >= 0 ? ' ' : '') + v.toFixed(3);
  return `(${f(q.x)}, ${f(q.y)}, ${f(q.z)}, ${f(q.w)})`;
}

/**
 * 해밀턴 곱 샌드박스 — 합성은 순서에 의존한다(비가환).
 * 두 회전 A, B를 (축 + 각)으로 정의하고, A∘B와 B∘A를 비교한다.
 * 같은 두 회전을 순서만 바꿔 적용해도 기즈모의 최종 자세가 달라지고,
 * 패널의 쿼터니언 곱 숫자도 실제로 다르다(q_A·q_B ≠ q_B·q_A).
 */
export default function HamiltonProductSandbox() {
  const [axisA, setAxisA] = useState<AxisKind>('x');
  const [angleA, setAngleA] = useState(90);
  const [axisB, setAxisB] = useState<AxisKind>('y');
  const [angleB, setAngleB] = useState(90);
  const [order, setOrder] = useState<Order>('AB');

  const qA = useMemo(
    () => new THREE.Quaternion().setFromAxisAngle(AXIS_VEC[axisA], angleA * DEG),
    [axisA, angleA],
  );
  const qB = useMemo(
    () => new THREE.Quaternion().setFromAxisAngle(AXIS_VEC[axisB], angleB * DEG),
    [axisB, angleB],
  );

  // q_A * q_B 는 "먼저 B, 그다음 A"를 점에 적용하는 합성(A∘B).
  const qAB = useMemo(
    () => new THREE.Quaternion().multiplyQuaternions(qA, qB),
    [qA, qB],
  );
  const qBA = useMemo(
    () => new THREE.Quaternion().multiplyQuaternions(qB, qA),
    [qA, qB],
  );

  const active = order === 'AB' ? qAB : qBA;
  const activeTuple: [number, number, number, number] = [
    active.x,
    active.y,
    active.z,
    active.w,
  ];

  // 두 순서가 실제로 다른지 (단위 쿼터니언 사이 각도, 부호 보정).
  const dot = Math.abs(
    qAB.x * qBA.x + qAB.y * qBA.y + qAB.z * qBA.z + qAB.w * qBA.w,
  );
  const diffDeg = (2 * Math.acos(Math.min(1, dot))) / DEG;
  const commutes = diffDeg < 0.5;

  return (
    <figure className="demo">
      <DemoCanvas animate={false} cameraPosition={[4, 3, 5]}>
        <Axes length={1.8} />
        <Gizmo quat={activeTuple} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <SelectControl label="회전 A 축" value={axisA} options={AXIS_OPTIONS} onChange={setAxisA} />
        <Slider
          label="회전 A 각도"
          value={angleA}
          min={-180}
          max={180}
          step={1}
          onChange={setAngleA}
          unit="°"
        />
        <SelectControl label="회전 B 축" value={axisB} options={AXIS_OPTIONS} onChange={setAxisB} />
        <Slider
          label="회전 B 각도"
          value={angleB}
          min={-180}
          max={180}
          step={1}
          onChange={setAngleB}
          unit="°"
        />
        <SelectControl label="적용 순서" value={order} options={ORDER_OPTIONS} onChange={setOrder} />
      </ControlPanel>

      <div
        style={{
          marginTop: '0.9rem',
          padding: '0.8rem 1rem',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--surface)',
          color: 'var(--text)',
          lineHeight: 1.8,
        }}
      >
        <div style={{ color: 'var(--muted)', marginBottom: '0.3rem' }}>
          쿼터니언 (x, y, z, w)
        </div>
        <div style={monoRow}>q_A = {fmtQuat(qA)}</div>
        <div style={monoRow}>q_B = {fmtQuat(qB)}</div>
        <div
          style={{
            ...monoRow,
            marginTop: '0.3rem',
            color: order === 'AB' ? 'var(--accent)' : 'var(--text)',
            fontWeight: order === 'AB' ? 700 : 400,
          }}
        >
          q_A · q_B = {fmtQuat(qAB)} &nbsp;(A∘B)
        </div>
        <div
          style={{
            ...monoRow,
            color: order === 'BA' ? 'var(--accent)' : 'var(--text)',
            fontWeight: order === 'BA' ? 700 : 400,
          }}
        >
          q_B · q_A = {fmtQuat(qBA)} &nbsp;(B∘A)
        </div>
        <div style={{ marginTop: '0.4rem', color: commutes ? '#46a758' : '#e5484d', fontWeight: 600 }}>
          {commutes
            ? '두 순서가 같음 (이 경우엔 가환 — 같은 축이거나 0°)'
            : `두 순서가 다름! 자세 차이 ≈ ${diffDeg.toFixed(0)}° (비가환)`}
        </div>
      </div>

      <figcaption>
        "적용 순서"를 <strong>A∘B</strong>와 <strong>B∘A</strong>로 번갈아 바꿔 보세요. 대개 기즈모의
        최종 자세가 눈에 띄게 달라집니다. 패널의 <code>q_A·q_B</code>와 <code>q_B·q_A</code> 숫자도 실제로
        다릅니다 — 회전 합성은 <em>순서에 의존(비가환)</em>합니다. 단, 두 축을 같게 하면 가환이 됩니다.
      </figcaption>
    </figure>
  );
}
