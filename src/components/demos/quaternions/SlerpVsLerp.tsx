import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import {
  ControlPanel,
  Slider,
  ToggleControl,
  SelectControl,
  type SelectOption,
} from '../../controls';
import { lerpRaw } from './quatMath';

const DEG = Math.PI / 180;

// 어느 결과를 볼지: 둘 다 / SLERP만 / LERP만
type ShowMode = 'both' | 'slerp' | 'lerp';
const SHOW_OPTIONS: ReadonlyArray<SelectOption<ShowMode>> = [
  { value: 'both', label: '둘 다 (SLERP + LERP)' },
  { value: 'slerp', label: 'SLERP만' },
  { value: 'lerp', label: 'naïve LERP만' },
];

const MARKER_LOCAL = new THREE.Vector3(0, 0, 1.4);

/** 부호 보정을 포함한 정석 SLERP (짧은 호). three의 slerp는 receiver를 변경하므로 clone. */
function slerp(qa: THREE.Quaternion, qb: THREE.Quaternion, t: number): THREE.Quaternion {
  return qa.clone().slerp(qb, t);
}

/** 정규화된 LERP(nlerp) — 자세 적용용. 그래프는 정규화 전 크기를 따로 그린다. */
function lerpNormalized(
  qa: THREE.Quaternion,
  qb: THREE.Quaternion,
  t: number,
): THREE.Quaternion {
  return lerpRaw(qa, qb, t).normalize();
}

interface PoseProps {
  quat: [number, number, number, number];
  color: string;
  opacity: number;
}

/** 자세를 보여주는 납작한 화살표 형태의 메시. */
function Pose({ quat, color, opacity }: PoseProps) {
  return (
    <group quaternion={quat}>
      <mesh position={[0, 0, 0.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.22, 0.5, 20]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 1.4, 12]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </mesh>
    </group>
  );
}

interface DotsProps {
  positions: [number, number, number][];
  color: string;
}

/** 균일 간격 t로 샘플한 마커 점들 — 점이 뭉치면 속도가 빠른 구간. */
function Dots({ positions, color }: DotsProps) {
  return (
    <group>
      {positions.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

interface DriverProps {
  playing: boolean;
  onTick: (t: number) => void;
}

/** 자동 재생용 t 구동기 — useFrame으로 0↔1 왕복. <Canvas> 안에서만 동작. */
function Driver({ playing, onTick }: DriverProps) {
  const phase = useRef(0);
  useFrame((_, delta) => {
    if (!playing) return;
    phase.current += delta * 0.4;
    // 0→1→0 삼각파
    const tri = 1 - Math.abs(((phase.current % 2) + 2) % 2 - 1);
    onTick(tri);
  });
  return null;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * SLERP vs LERP — 쿼터니언 보간의 정수.
 * 같은 시작/끝 자세를 SLERP와 naïve LERP로 보간한다.
 *  - 구 위 궤적: SLERP는 등속 대원호(점 간격 균일), LERP는 현(점이 가운데서 벌어짐).
 *  - 아래 2D 그래프: |q(t)| — SLERP는 1.0 유지, 정규화 안 한 LERP는 가운데서 1 미만으로 꺼짐.
 */
export default function SlerpVsLerp() {
  const [t, setT] = useState(0.5);
  const [playing, setPlaying] = useState(true);
  const [show, setShow] = useState<ShowMode>('both');
  const [sepDeg, setSepDeg] = useState(150);

  const graphRef = useRef<HTMLCanvasElement>(null);

  // 시작 = 단위, 끝 = 기울어진 축으로 sepDeg 회전.
  const q0 = useMemo(() => new THREE.Quaternion(0, 0, 0, 1), []);
  const q1 = useMemo(
    () =>
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0.3, 1, 0.5).normalize(),
        sepDeg * DEG,
      ),
    [sepDeg],
  );

  // 현재 자세
  const slerpQuat = useMemo<[number, number, number, number]>(() => {
    const q = slerp(q0, q1, t);
    return [q.x, q.y, q.z, q.w];
  }, [q0, q1, t]);
  const lerpQuat = useMemo<[number, number, number, number]>(() => {
    const q = lerpNormalized(q0, q1, t);
    return [q.x, q.y, q.z, q.w];
  }, [q0, q1, t]);

  // 균일 t 샘플 → 마커 점 위치 (속도 가시화)
  const N_DOTS = 16;
  const slerpDots = useMemo<[number, number, number][]>(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i <= N_DOTS; i++) {
      const q = slerp(q0, q1, i / N_DOTS);
      const p = MARKER_LOCAL.clone().applyQuaternion(q);
      out.push([p.x, p.y, p.z]);
    }
    return out;
  }, [q0, q1]);
  const lerpDots = useMemo<[number, number, number][]>(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i <= N_DOTS; i++) {
      const q = lerpNormalized(q0, q1, i / N_DOTS);
      const p = MARKER_LOCAL.clone().applyQuaternion(q);
      out.push([p.x, p.y, p.z]);
    }
    return out;
  }, [q0, q1]);

  // 매끈한 궤적선 (조밀 샘플)
  const slerpPath = useMemo<[number, number, number][]>(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i <= 96; i++) {
      const q = slerp(q0, q1, i / 96);
      const p = MARKER_LOCAL.clone().applyQuaternion(q);
      out.push([p.x, p.y, p.z]);
    }
    return out;
  }, [q0, q1]);
  const lerpPath = useMemo<[number, number, number][]>(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i <= 96; i++) {
      const q = lerpNormalized(q0, q1, i / 96);
      const p = MARKER_LOCAL.clone().applyQuaternion(q);
      out.push([p.x, p.y, p.z]);
    }
    return out;
  }, [q0, q1]);

  const showSlerp = show !== 'lerp';
  const showLerp = show !== 'slerp';

  // |q(t)| 그래프: 정규화 안 한 LERP의 크기가 가운데서 꺼지는 것을 보여줌.
  useEffect(() => {
    const canvas = graphRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const muted = cssVar('--muted') || '#5b6472';
    const border = cssVar('--border') || '#e2e5ea';
    const accent = cssVar('--accent') || '#2f86cf';
    const text = cssVar('--text') || '#1a1d23';

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = 160;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = 44;
    const padR = 12;
    const padT = 14;
    const padB = 26;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // y축 범위 0.6 ~ 1.05
    const yMin = 0.6;
    const yMax = 1.05;
    const yToPx = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    const xToPx = (tt: number) => padL + tt * plotW;

    // 격자 + 축
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = muted;
    [0.6, 0.8, 1.0].forEach((v) => {
      const y = yToPx(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(1), 8, y + 4);
    });
    ctx.fillText('|q(t)|', 8, padT - 2);
    ctx.fillText('t=0', padL - 4, h - 8);
    ctx.fillText('t=1', w - padR - 18, h - 8);

    // SLERP: 항상 1.0
    if (showSlerp) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xToPx(0), yToPx(1));
      ctx.lineTo(xToPx(1), yToPx(1));
      ctx.stroke();
    }

    // naïve LERP: 정규화 전 크기 |(1-t)q0 + t q1|
    if (showLerp) {
      ctx.strokeStyle = '#e5a23b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const tt = i / 100;
        const q = lerpRaw(q0, q1, tt);
        const mag = Math.hypot(q.x, q.y, q.z, q.w);
        const x = xToPx(tt);
        const y = yToPx(Math.max(yMin, Math.min(yMax, mag)));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 현재 t 마커
    ctx.strokeStyle = text;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xToPx(t), padT);
    ctx.lineTo(xToPx(t), h - padB);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [q0, q1, t, showSlerp, showLerp]);

  return (
    <figure className="demo">
      <DemoCanvas animate={playing} cameraPosition={[3, 2, 4]}>
        <Driver playing={playing} onTick={setT} />
        <Sphere args={[1.4, 24, 16]}>
          <meshStandardMaterial color="#4f9dde" wireframe transparent opacity={0.16} />
        </Sphere>

        {showSlerp && (
          <>
            <Line points={slerpPath} color="#4f9dde" lineWidth={3} />
            <Dots positions={slerpDots} color="#4f9dde" />
            <Pose quat={slerpQuat} color="#4f9dde" opacity={show === 'both' ? 0.85 : 1} />
          </>
        )}
        {showLerp && (
          <>
            <Line points={lerpPath} color="#e5a23b" lineWidth={3} />
            <Dots positions={lerpDots} color="#e5a23b" />
            <Pose quat={lerpQuat} color="#e5a23b" opacity={show === 'both' ? 0.85 : 1} />
          </>
        )}

        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <div
        style={{
          marginTop: '0.8rem',
          width: '100%',
          height: 160,
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: 'var(--surface)',
          overflow: 'hidden',
        }}
      >
        <canvas ref={graphRef} style={{ width: '100%', height: 160, display: 'block' }} />
      </div>

      <ControlPanel>
        <SelectControl label="표시" value={show} options={SHOW_OPTIONS} onChange={setShow} />
        <Slider
          label="보간 t"
          value={t}
          min={0}
          max={1}
          step={0.005}
          onChange={(v) => {
            setPlaying(false);
            setT(v);
          }}
          format={(v) => v.toFixed(3)}
        />
        <Slider
          label="자세 차이 각"
          value={sepDeg}
          min={20}
          max={175}
          step={1}
          onChange={setSepDeg}
          unit="°"
        />
        <ToggleControl label="자동 재생" checked={playing} onChange={setPlaying} />
      </ControlPanel>

      <figcaption>
        파란색이 <strong>SLERP</strong>, 주황색이 정규화하지 않은 <strong>naïve LERP</strong>입니다.
        균일 간격으로 찍은 점을 보세요 — SLERP는 등간격(등속), LERP는 가운데서 점이 벌어집니다(속도 변동).
        아래 그래프의 |q(t)|는 SLERP가 1.0을 유지하는 반면 LERP는 가운데서 1 아래로 꺼집니다 —
        단위 구를 벗어나 회전이 일그러진다는 증거입니다. 자세 차이 각을 키울수록 그 골이 깊어집니다.
      </figcaption>
    </figure>
  );
}
