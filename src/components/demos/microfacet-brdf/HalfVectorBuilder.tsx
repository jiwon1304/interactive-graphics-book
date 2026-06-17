import { useMemo, useState } from 'react';
import { Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider } from '../../controls';

// 구면 좌표(고도 elev, 방위 azim, 도 단위) → 단위 벡터.
// y가 위(거시 법선 n 방향), elev=90°이면 정확히 위.
function sph(elevDeg: number, azimDeg: number): THREE.Vector3 {
  const elev = (elevDeg * Math.PI) / 180;
  const azim = (azimDeg * Math.PI) / 180;
  const ce = Math.cos(elev);
  return new THREE.Vector3(
    ce * Math.cos(azim),
    Math.sin(elev),
    ce * Math.sin(azim),
  );
}

interface ArrowProps {
  dir: THREE.Vector3; // 정규화된 방향
  length: number;
  color: string;
  label?: string;
}

/** 원점에서 dir 방향으로 뻗는 화살표(선 + 원뿔 화살촉). */
function Arrow({ dir, length, color }: ArrowProps) {
  const tip = useMemo(() => dir.clone().multiplyScalar(length), [dir, length]);
  // 화살촉(cone)의 회전: +Y를 dir로 정렬.
  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return q;
  }, [dir]);
  const coneBase = useMemo(
    () => dir.clone().multiplyScalar(length - 0.16),
    [dir, length],
  );
  return (
    <group>
      <Line points={[[0, 0, 0], [tip.x, tip.y, tip.z]]} color={color} lineWidth={3} />
      <mesh position={coneBase} quaternion={quat}>
        <coneGeometry args={[0.06, 0.18, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

interface SceneProps {
  l: THREE.Vector3;
  v: THREE.Vector3;
  h: THREE.Vector3;
}

function Scene({ l, v, h }: SceneProps) {
  const N = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  // h에 수직인 미세면(작은 disc) 회전.
  const facetQuat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), h);
    return q;
  }, [h]);

  return (
    <group>
      {/* 거시 표면 패치 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <circleGeometry args={[1.4, 48]} />
        <meshStandardMaterial color="#888888" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>

      {/* 거시 법선 n (회색), 광원 l (노랑), 시선 v (하늘), 하프벡터 h (마젠타) */}
      <Arrow dir={N} length={1.25} color="#9aa3b2" />
      <Arrow dir={l} length={1.4} color="#e3a008" />
      <Arrow dir={v} length={1.4} color="#4f9dde" />
      <Arrow dir={h} length={1.55} color="#e5468a" />

      {/* h를 향한 미세면(작은 원판): 이 면만이 l을 v로 반사한다 */}
      <mesh quaternion={facetQuat} position={h.clone().multiplyScalar(0.0)}>
        <circleGeometry args={[0.5, 40]} />
        <meshStandardMaterial
          color="#e5468a"
          transparent
          opacity={0.28}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * 위젯 B — 하프 벡터 만들기.
 * 광원 l과 시선 v의 각도를 바꾸면 h = normalize(l+v)가 실시간으로 이등분 방향에 그려진다.
 * h를 향한 미세면만이 l을 v로 반사하므로, "어떤 미세면이 중요한가"가 곧 h다.
 */
export default function HalfVectorBuilder() {
  const [lElev, setLElev] = useState(55);
  const [lAzim, setLAzim] = useState(45);
  const [vElev, setVElev] = useState(55);
  const [vAzim, setVAzim] = useState(135);

  const l = useMemo(() => sph(lElev, lAzim), [lElev, lAzim]);
  const v = useMemo(() => sph(vElev, vAzim), [vElev, vAzim]);
  const h = useMemo(() => l.clone().add(v).normalize(), [l, v]);

  // n과 h 사이 각도(도).
  const nDotH = Math.min(Math.max(h.y, -1), 1); // n = (0,1,0)
  const angleNH = (Math.acos(nDotH) * 180) / Math.PI;

  return (
    <figure className="demo">
      <DemoCanvas lights cameraPosition={[2.6, 2.0, 2.6]} height={340}>
        <Scene l={l} v={v} h={h} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <Slider label="광원 l 고도" value={lElev} min={5} max={89} step={1} onChange={setLElev} unit="°" />
        <Slider label="광원 l 방위각" value={lAzim} min={0} max={360} step={1} onChange={setLAzim} unit="°" />
        <Slider label="시선 v 고도" value={vElev} min={5} max={89} step={1} onChange={setVElev} unit="°" />
        <Slider label="시선 v 방위각" value={vAzim} min={0} max={360} step={1} onChange={setVAzim} unit="°" />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 광원 <span style={{ color: '#e3a008' }}>l(노랑)</span>과
        시선 <span style={{ color: '#4f9dde' }}>v(하늘)</span>의 각도를 움직이면, 둘의 이등분 방향에
        <span style={{ color: '#e5468a' }}> h(마젠타)</span>가 곧바로 다시 그려집니다. 반투명 원판이
        곧 <em>h를 법선으로 갖는 미세면</em>이며, 이 면만이 l을 정확히 v로 반사합니다. 현재
        <strong> n·h 각도 ≈ {angleNH.toFixed(1)}°</strong> — 이 각이 작을수록 정반사에 가깝습니다.
      </figcaption>
    </figure>
  );
}
