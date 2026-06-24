import { useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ControlPanel, ToggleControl, Slider } from '../../controls';

// 고대비 체커보드 셰이더 — 멀어질수록(에지가 픽셀보다 촘촘) 계단·지글거림이 잘 보인다.
const VERTEX = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAGMENT = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  uniform float uFreq;
  out vec4 fragColor;
  void main() {
    vec2 g = floor(vUv * uFreq);
    float c = mod(g.x + g.y, 2.0);
    fragColor = vec4(vec3(c), 1.0);
  }
`;

function CheckerPlane({ freq }: { freq: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uFreq: { value: 24 } },
        side: THREE.DoubleSide,
      }),
    [],
  );
  useFrame(() => {
    material.uniforms.uFreq.value = freq;
  });
  return (
    <mesh rotation={[-Math.PI / 2.6, 0, 0.3]}>
      <planeGeometry args={[6, 6]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * 위젯 — 실제 WebGL MSAA on/off 비교(3D).
 * DemoCanvas는 antialias를 항상 켜므로, 이 위젯만 직접 <Canvas>를 써서 gl.antialias를 토글한다.
 * (antialias 플래그는 컨텍스트 생성 시 고정 → 토글 시 key로 Canvas를 재마운트.)
 * "과정": 같은 고대비 체커에서 표본이 픽셀당 1개일 때와 여러 개일 때 에지가 어떻게 달라지는지.
 */
export default function AntialiasToggle() {
  const [aa, setAa] = useState(true);
  const [freq, setFreq] = useState(24);
  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ height: 360 }}>
        <Canvas
          key={aa ? 'aa-on' : 'aa-off'}
          dpr={[1, 2]}
          camera={{ position: [0, 1.6, 4], fov: 50 }}
          gl={{ antialias: aa, powerPreference: 'high-performance' }}
          style={{ touchAction: 'none' }}
        >
          <CheckerPlane freq={freq} />
          <OrbitControls enablePan={false} makeDefault />
        </Canvas>
      </div>
      <ControlPanel>
        <ToggleControl label="안티에일리어싱 (MSAA)" checked={aa} onChange={setAa} />
        <Slider label="체커 밀도" value={freq} min={8} max={64} step={1} onChange={setFreq} />
      </ControlPanel>
      <figcaption>
        브라우저의 실제 WebGL MSAA를 켜고 끕니다. 체커 평면을 비스듬히 눕혀 멀어지는 쪽을 보세요 —
        거기선 한 픽셀이 여러 체커 칸을 덮어 에지가 픽셀보다 촘촘해집니다. AA를 끄면 가까운 에지에
        계단이, 먼 쪽엔 지글거리는 무늬(moiré)가 보입니다. AA를 켜면 기하 에지의 계단은 부드러워
        집니다. 단, MSAA는 <strong>기하 에지</strong>만 다중 샘플하므로, 평면 <em>내부</em>의
        체커 무늬가 멀리서 지글거리는 것(셰이더/텍스처 에일리어싱)은 MSAA로 잘 잡히지 않습니다 —
        그건 밉맵이나 SSAA·TAA의 몫입니다. 두 손가락으로 멀리 줌인해 보세요.
      </figcaption>
    </figure>
  );
}
