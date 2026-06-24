import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider, SelectControl, type SelectOption } from '../../controls';

// three의 톤매핑 상수(로컬 three r0.184 constants.js로 확정).
type ToneMode = 'none' | 'reinhard' | 'aces';
const TONE_OPTIONS: ReadonlyArray<SelectOption<ToneMode>> = [
  { value: 'none', label: 'None (선형, 1.0에서 클리핑)' },
  { value: 'reinhard', label: 'Reinhard  L/(1+L)' },
  { value: 'aces', label: 'ACES Filmic (S-curve)' },
];
const TONE_CONST: Record<ToneMode, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  aces: THREE.ACESFilmicToneMapping,
};

/**
 * 톤매핑/노출을 renderer에 실시간 반영.
 * DemoCanvas의 gl prop은 고정이라, <Canvas> 안에서 useThree로 gl을 잡아 직접 설정한다.
 */
function ToneMapController({ mode, exposure }: { mode: ToneMode; exposure: number }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    gl.toneMapping = TONE_CONST[mode];
    gl.toneMappingExposure = exposure;
    invalidate(); // frameloop=demand일 때도 다시 그리도록
  }, [gl, mode, exposure, invalidate]);
  return null;
}

// HDR 장면: 일부러 1.0을 한참 넘는 밝기를 가진 표면을 둔다.
// (emissiveIntensity로 휘도를 1보다 크게 — 톤매핑이 어떻게 압축하는지 보려면 입력이 HDR이어야 함.)
function BrightScene() {
  // 같은 색이지만 점점 더 밝은(노출 초과) 구들.
  const intensities = [0.6, 1.0, 2.0, 4.0, 8.0];
  return (
    <group>
      {intensities.map((I, i) => {
        const x = (i - (intensities.length - 1) / 2) * 1.25;
        return (
          <mesh key={i} position={[x, 0.4, 0]}>
            <sphereGeometry args={[0.5, 48, 48]} />
            <meshStandardMaterial
              color="#ff7a3c"
              emissive="#ff7a3c"
              emissiveIntensity={I}
              roughness={0.4}
              metalness={0}
              toneMapped // 이 머티리얼은 톤매핑 대상(기본 true) — 명시적으로 둠
            />
          </mesh>
        );
      })}
      {/* 어두운 바닥: 톤매핑이 어두운 영역은 거의 안 건드린다는 걸 같이 보이게 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]}>
        <planeGeometry args={[12, 6]} />
        <meshStandardMaterial color="#26313a" roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

/**
 * 위젯 — 톤매핑 비교(실제 렌더).
 * 같은 HDR 장면을 None / Reinhard / ACES로 매핑하고 노출을 바꾼다.
 * 과정 강조: "1.0을 넘는 밝기"가 연산자마다 어떻게 [0,1]로 접히는지(클리핑 vs 압축)를 본다.
 */
export default function ToneMapCompare() {
  const [mode, setMode] = useState<ToneMode>('none');
  const [exposure, setExposure] = useState(1.0);

  // 광원(emissive가 주지만, 약한 환경광으로 형태를 살림)
  const lightDir = useMemo(() => new THREE.Vector3(2, 3, 2), []);

  return (
    <figure className="demo">
      <DemoCanvas animate={false} cameraPosition={[0, 1.2, 6]} height={340}>
        <ToneMapController mode={mode} exposure={exposure} />
        <ambientLight intensity={0.15} />
        <directionalLight position={lightDir} intensity={0.6} />
        <BrightScene />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <ControlPanel>
        <SelectControl label="톤매핑 연산자" value={mode} options={TONE_OPTIONS} onChange={setMode} />
        <Slider
          label="노출 (exposure)"
          value={exposure}
          min={0.1}
          max={4}
          step={0.05}
          onChange={setExposure}
          format={(v) => `${v.toFixed(2)}×`}
        />
      </ControlPanel>

      <figcaption>
        구들은 왼쪽에서 오른쪽으로 휘도가 0.6 → 8.0으로 커집니다(=1.0을 한참 넘는 HDR 값).{' '}
        <strong>None</strong>은 1.0에서 그냥 잘려(clip) 밝은 구 셋이 똑같은 흰색으로 뭉칩니다.{' '}
        <strong>Reinhard</strong>는 모두 1 미만으로 눌러 디테일을 살리지만 전체가 바래 보입니다.{' '}
        <strong>ACES</strong>는 어두운 곳은 그대로 두고 밝은 곳만 어깨(shoulder)로 천천히 접어 대비가
        유지됩니다. 노출을 올리면 곡선의 더 높은 입력 구간을 쓰게 되어 None은 더 빨리 타고, Reinhard·ACES는
        밝은 쪽이 점점 구분이 사라집니다.
      </figcaption>
    </figure>
  );
}
