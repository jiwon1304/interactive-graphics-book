import { useMemo, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { bakeVertexAO, type Sphere } from './bakeAO';

const PLANE_Y = 0;

// 서로 닿거나 가까운 구들 — 접촉부/틈이 생기는 장면.
const SPHERES: Sphere[] = [
  { center: new THREE.Vector3(-0.85, 0.7, 0), radius: 0.7 },
  { center: new THREE.Vector3(0.55, 0.55, 0.3), radius: 0.55 },
  { center: new THREE.Vector3(0.35, 0.45, -0.85), radius: 0.45 },
  { center: new THREE.Vector3(-0.2, 0.32, 0.95), radius: 0.32 },
];

function Scene({ ao, radius, strength, samples }: { ao: boolean; radius: number; strength: number; samples: number }) {
  // 정점 AO를 구운 지오메트리들을 메모. (ao 파라미터 변하면 재계산)
  const meshes = useMemo(() => {
    const out: { geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
    // 구들
    for (const s of SPHERES) {
      const geom = new THREE.SphereGeometry(s.radius, 48, 48);
      const m = new THREE.Matrix4().makeTranslation(s.center.x, s.center.y, s.center.z);
      const others = SPHERES.filter((o) => o !== s);
      bakeVertexAO(geom, m, others, PLANE_Y, samples, radius, strength);
      out.push({ geom, matrix: m });
    }
    // 바닥(세분화해야 AO 그라디언트가 보임)
    const plane = new THREE.PlaneGeometry(8, 8, 80, 80);
    const pm = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    bakeVertexAO(plane, pm, SPHERES, null, samples, radius, strength);
    out.push({ geom: plane, matrix: pm });
    return out;
  }, [radius, strength, samples]);

  return (
    <group>
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.geom} matrixAutoUpdate={false} matrix={m.matrix}>
          <meshStandardMaterial
            color={i === meshes.length - 1 ? '#9aa6b2' : '#d8623a'}
            vertexColors={ao}
            roughness={0.85}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 위젯 — 고정 ambient vs AO 적용(실제 렌더 비교).
 * vertexColors로 구운 반구 visibility(AO)를 곱했다 껐다 한다.
 * 과정 강조: AO를 켜면 구가 닿는 틈·바닥 접촉부가 어두워지며 형태가 살아난다.
 */
export default function AmbientFlatVsAO() {
  const [ao, setAo] = useState(true);
  const [radius, setRadius] = useState(1.2);
  const [strength, setStrength] = useState(1.5);

  return (
    <figure className="demo">
      <DemoCanvas animate={false} cameraPosition={[3.4, 2.6, 3.8]} height={360}>
        {/* 평평한 ambient를 강조하려고 directional은 약하게, ambient를 주로 */}
        <ambientLight intensity={0.9} />
        <directionalLight position={[4, 6, 3]} intensity={0.35} />
        <Scene ao={ao} radius={radius} strength={strength} samples={64} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <ToggleControl label="AO 적용" checked={ao} onChange={setAo} />
        <Slider label="AO 반경 (radius)" value={radius} min={0.4} max={2.5} step={0.1} onChange={setRadius} format={(v) => v.toFixed(1)} />
        <Slider label="AO 세기 (강도)" value={strength} min={0.5} max={3} step={0.1} onChange={setStrength} format={(v) => v.toFixed(1)} />
      </ControlPanel>

      <figcaption>
        조명은 일부러 균일한 ambient를 주로 두었습니다. <strong>AO 끄기</strong>면 모든 표면이 같은 양의
        간접광을 받아 구들이 평평하게 떠 보입니다 — 어디가 닿았는지, 어디가 틈인지 알 수 없습니다.{' '}
        <strong>AO 켜기</strong>면 구 사이 접촉부와 바닥에 닿는 곳이 어두워지며 입체와 무게가 생깁니다.
        반경을 키우면 더 넓은 주변까지 차폐로 쳐서 그늘이 번지고, 세기를 올리면 대비가 강해집니다. 이
        AO는 각 정점에서 반구로 광선을 쏴 막힌 비율을 잰 것 — SSAO가 화면공간에서 근사하려는 바로 그 양입니다.
      </figcaption>
    </figure>
  );
}
