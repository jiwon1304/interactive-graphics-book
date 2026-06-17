import { useMemo, useState } from 'react';
import { OrbitControls, Line, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { Axes } from '../../three';
import { slerpNoFlip, toTuple } from './quatMath';

const DEG = Math.PI / 180;

// 목표 자세: 기울어진 축으로 150° 회전. q와 −q는 같은 자세를 나타낸다.
const TARGET_AXIS = new THREE.Vector3(0.4, 1, 0.3).normalize();
const TARGET_ANGLE = 150 * DEG;

// 구 위에서 따라갈 마커 점(로컬 좌표). 회전을 적용해 궤적을 그린다.
const MARKER_LOCAL = new THREE.Vector3(0, 0, 1.3);

interface MarkerProps {
  quat: [number, number, number, number];
}

function Marker({ quat }: MarkerProps) {
  return (
    <group quaternion={quat}>
      <mesh position={[MARKER_LOCAL.x, MARKER_LOCAL.y, MARKER_LOCAL.z]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="#e5484d" emissive="#e5484d" emissiveIntensity={0.4} />
      </mesh>
      {/* 자세를 읽기 쉽게 하는 작은 막대 */}
      <mesh position={[0, 0, 0.65]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.3, 8]} />
        <meshStandardMaterial color="#9aa3b2" />
      </mesh>
    </group>
  );
}

/**
 * 이중 덮개 데모 — q와 −q는 같은 자세, 다른 여정.
 * 같은 목표 자세를 가리키는 두 단위 쿼터니언 q, −q 중 하나로 SLERP한다.
 * +q는 짧은 호, −q는 먼 호(>180°)를 따라간다(부호 미보정 SLERP 사용).
 * 마커 궤적을 구 위에 그려 "도착지는 같지만 경로가 다르다"를 눈으로 본다.
 */
export default function DoubleCoverDemo() {
  const [t, setT] = useState(0.35);
  const [useNeg, setUseNeg] = useState(false);

  // 시작(단위)과 목표(+q). 시작을 살짝 비틀어 dot 부호 효과가 잘 보이게 한다.
  const qStart = useMemo(
    () => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 10 * DEG),
    [],
  );
  const qPos = useMemo(
    () => new THREE.Quaternion().setFromAxisAngle(TARGET_AXIS, TARGET_ANGLE),
    [],
  );
  // −q: 모든 성분 부호 반전. 같은 회전을 나타내지만 보간 경로가 반대.
  const qNeg = useMemo(
    () => new THREE.Quaternion(-qPos.x, -qPos.y, -qPos.z, -qPos.w),
    [qPos],
  );

  const qEnd = useNeg ? qNeg : qPos;

  const dot = useMemo(
    () => qStart.x * qEnd.x + qStart.y * qEnd.y + qStart.z * qEnd.z + qStart.w * qEnd.w,
    [qStart, qEnd],
  );

  // 현재 t에서의 자세
  const current = useMemo(() => toTuple(slerpNoFlip(qStart, qEnd, t)), [qStart, qEnd, t]);

  // 전체 경로 샘플 → 마커 월드 위치들 → 궤적 선
  const path = useMemo<[number, number, number][]>(() => {
    const pts: [number, number, number][] = [];
    const N = 80;
    for (let i = 0; i <= N; i++) {
      const q = slerpNoFlip(qStart, qEnd, i / N);
      const p = MARKER_LOCAL.clone().applyQuaternion(q);
      pts.push([p.x, p.y, p.z]);
    }
    return pts;
  }, [qStart, qEnd]);

  // 실제로 도는 각도(도). +q는 짧은 호, −q는 그 보각으로 360°에서 뺀 먼 호.
  const shortDeg = (2 * Math.acos(Math.min(1, Math.abs(dot)))) / DEG;
  const sweptDeg = useNeg ? 360 - shortDeg : shortDeg;

  return (
    <figure className="demo">
      <DemoCanvas animate={false} cameraPosition={[3, 2, 4]}>
        <Axes length={1.6} />
        <Sphere args={[1.3, 24, 16]}>
          <meshStandardMaterial color="#4f9dde" wireframe transparent opacity={0.18} />
        </Sphere>
        <Line points={path} color={useNeg ? '#e5a23b' : '#46a758'} lineWidth={3} />
        <Marker quat={current} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <Slider
          label="보간 t"
          value={t}
          min={0}
          max={1}
          step={0.005}
          onChange={setT}
          format={(v) => v.toFixed(3)}
        />
        <ToggleControl label="−q 사용 (부호 반전)" checked={useNeg} onChange={setUseNeg} />
      </ControlPanel>

      <div
        style={{
          marginTop: '0.9rem',
          padding: '0.7rem 1rem',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--surface)',
          color: 'var(--text)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.92rem',
          lineHeight: 1.7,
        }}
      >
        <div>
          q<sub>start</sub> · q<sub>end</sub> = {dot.toFixed(3)}{' '}
          <span style={{ color: dot < 0 ? '#e5a23b' : '#46a758' }}>
            ({dot < 0 ? '음수 → 먼 경로' : '양수 → 짧은 경로'})
          </span>
        </div>
        <div style={{ color: 'var(--muted)' }}>
          실제 회전량 ≈ {sweptDeg.toFixed(0)}° &nbsp;|&nbsp; 목표 자세는 +q·−q 모두 동일
        </div>
        <div style={{ color: useNeg ? '#e5a23b' : '#46a758', fontWeight: 600 }}>
          {useNeg ? '먼 경로 (long arc)' : '짧은 경로 (short arc)'}
        </div>
      </div>

      <figcaption>
        토글을 켜면 같은 목표 자세를 가리키는 <strong>−q</strong>로 바뀝니다. t를 0→1로 끌어보면
        도착하는 자세는 똑같지만, +q는 짧은 호로, −q는 반대편으로 빙 돌아(먼 호) 도달합니다.
        궤적 색과 내적 부호로 그 차이를 확인하세요. 이것이 단위 쿼터니언의 <em>이중 덮개</em>입니다.
      </figcaption>
    </figure>
  );
}
