import { useMemo, useState, type CSSProperties } from 'react';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider } from '../../controls';
import { Axes } from '../../three';

const DEG = Math.PI / 180;

/** 방위각/고도각(도)으로 단위 회전축 n̂을 만든다. */
function axisFromSpherical(azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const az = azimuthDeg * DEG;
  const el = elevationDeg * DEG;
  const cosEl = Math.cos(el);
  // Y가 위쪽인 좌표계: 고도각이 +90°면 축이 +Y를 향함.
  return new THREE.Vector3(
    cosEl * Math.cos(az),
    Math.sin(el),
    cosEl * Math.sin(az),
  ).normalize();
}

interface GizmoProps {
  /** r3f 쿼터니언 튜플 [x, y, z, w] */
  quat: [number, number, number, number];
}

/** 회전이 한눈에 보이도록 세 색 화살표를 묶은 기즈모. quaternion으로 회전. */
function Gizmo({ quat }: GizmoProps) {
  return (
    <group quaternion={quat}>
      <Arrow dir={[1, 0, 0]} color="#e5484d" />
      <Arrow dir={[0, 1, 0]} color="#46a758" />
      <Arrow dir={[0, 0, 1]} color="#4f9dde" />
    </group>
  );
}

interface ArrowProps {
  dir: [number, number, number];
  color: string;
}

/** 원점에서 dir 방향으로 뻗는 굵은 화살표(막대 + 원뿔). */
function Arrow({ dir, color }: ArrowProps) {
  const { position, quaternion } = useMemo(() => {
    const d = new THREE.Vector3(...dir).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    return { position: d.multiplyScalar(0.6), quaternion: q };
  }, [dir]);
  return (
    <group quaternion={[quaternion.x, quaternion.y, quaternion.z, quaternion.w]}>
      <mesh position={[position.x, position.y, position.z]}>
        <cylinderGeometry args={[0.04, 0.04, 1.2, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[position.x * 2, position.y * 2, position.z * 2]}>
        <coneGeometry args={[0.12, 0.3, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

const monoCell: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.92rem',
};

/**
 * 축-각 → 쿼터니언 구성 데모.
 * 방위각/고도각으로 단위 축 n̂을, 슬라이더로 회전각 θ를 정한다.
 * q = (cos(θ/2), sin(θ/2)·n̂) 의 각 항을 실시간 숫자로 보여주고,
 * 같은 쿼터니언을 그대로 기즈모에 적용해 "숫자 = 회전"임을 증명한다.
 */
export default function AxisAngleToQuaternion() {
  const [azimuth, setAzimuth] = useState(35);
  const [elevation, setElevation] = useState(30);
  const [theta, setTheta] = useState(90);

  const axis = useMemo(
    () => axisFromSpherical(azimuth, elevation),
    [azimuth, elevation],
  );

  // q.x,q.y,q.z = sin(θ/2)·n̂,  q.w = cos(θ/2)
  const { quatTuple, w, s } = useMemo(() => {
    const half = (theta * DEG) / 2;
    const s = Math.sin(half);
    const w = Math.cos(half);
    const q = new THREE.Quaternion().setFromAxisAngle(axis, theta * DEG);
    const tuple: [number, number, number, number] = [q.x, q.y, q.z, q.w];
    return { quatTuple: tuple, w, s };
  }, [axis, theta]);

  // 원점을 지나는 축 선분 (양쪽으로 뻗음)
  const axisLine = useMemo<[number, number, number][]>(() => {
    const a = axis.clone().multiplyScalar(2.4);
    return [
      [-a.x, -a.y, -a.z],
      [a.x, a.y, a.z],
    ];
  }, [axis]);

  const fmt = (v: number) => (v >= 0 ? ' ' : '') + v.toFixed(3);

  return (
    <figure className="demo">
      <DemoCanvas animate={false} cameraPosition={[3.5, 2.5, 4]}>
        <Axes length={1.8} />
        <Line points={axisLine} color="#a06be8" lineWidth={3} />
        <Gizmo quat={quatTuple} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <Slider
          label="축 방위각 (azimuth)"
          value={azimuth}
          min={-180}
          max={180}
          step={1}
          onChange={setAzimuth}
          unit="°"
        />
        <Slider
          label="축 고도각 (elevation)"
          value={elevation}
          min={-90}
          max={90}
          step={1}
          onChange={setElevation}
          unit="°"
        />
        <Slider
          label="회전각 θ"
          value={theta}
          min={0}
          max={360}
          step={1}
          onChange={setTheta}
          unit="°"
        />
      </ControlPanel>

      <div
        style={{
          marginTop: '0.9rem',
          padding: '0.8rem 1rem',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--surface)',
          color: 'var(--text)',
          lineHeight: 1.7,
        }}
      >
        <div style={{ color: 'var(--muted)', marginBottom: '0.4rem' }}>
          q = ( cos(θ/2), &nbsp;sin(θ/2)·n̂ )
        </div>
        <div style={monoCell}>
          n̂ = ({fmt(axis.x)}, {fmt(axis.y)}, {fmt(axis.z)}) &nbsp; (단위벡터)
        </div>
        <div style={monoCell}>
          θ/2 = {(theta / 2).toFixed(1)}° &nbsp; cos(θ/2) = {fmt(w)} &nbsp; sin(θ/2) ={' '}
          {fmt(s)}
        </div>
        <div style={{ ...monoCell, marginTop: '0.3rem' }}>
          <span style={{ color: 'var(--accent)' }}>w</span> = cos(θ/2) = {fmt(w)}
        </div>
        <div style={monoCell}>
          (<span style={{ color: '#e5484d' }}>x</span>,
          <span style={{ color: '#46a758' }}>y</span>,
          <span style={{ color: '#4f9dde' }}>z</span>) = sin(θ/2)·n̂ = ({fmt(quatTuple[0])},{' '}
          {fmt(quatTuple[1])}, {fmt(quatTuple[2])})
        </div>
        <div style={{ ...monoCell, marginTop: '0.3rem', color: 'var(--muted)' }}>
          |q| = {Math.hypot(w, s).toFixed(3)} (항상 1 — 단위 쿼터니언)
        </div>
      </div>

      <figcaption>
        보라색 선이 회전축 n̂입니다. θ를 0→360°로 천천히 끌어보세요. 패널의{' '}
        <strong>cos(θ/2)</strong>·<strong>sin(θ/2)</strong> 숫자가 어떻게 움직이는지,
        그리고 그 숫자가 그대로 기즈모를 축 둘레로 돌리는지 확인하세요.
      </figcaption>
    </figure>
  );
}
