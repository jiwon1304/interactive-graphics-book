import { useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2D } from '../microfacet-brdf/shared';
import {
  VERTEX_SHADER,
  FRAG_HEADER,
  lightDirFromAngles,
} from './shared';

const fragmentShader = /* glsl */ `
  ${FRAG_HEADER}

  uniform float uHalf;     // 1 = half-Lambert, 0 = Lambert
  uniform float uSquared;  // 1 = 제곱(Valve), 0 = 제곱 안 함
  uniform float uBands;    // 밴드 수(0 = 연속)

  void main() {
    float raw = rawNdotL();
    float d;
    if (uHalf > 0.5) {
      d = raw * 0.5 + 0.5;          // [-1,1] → [0,1] remap
      if (uSquared > 0.5) d = d * d; // Valve: 제곱
    } else {
      d = clamp(raw, 0.0, 1.0);     // 순수 Lambert
    }

    if (uBands > 1.5) {
      float n = uBands;
      float q = min(floor(d * n), n - 1.0);
      d = q / (n - 1.0);
    }

    fragColor = vec4(vec3(d), 1.0);
  }
`;

function Shaded({
  half,
  squared,
  bands,
  azimuth,
}: {
  half: boolean;
  squared: boolean;
  bands: number;
  azimuth: number;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX_SHADER,
        fragmentShader,
        uniforms: {
          uLightDir: { value: new THREE.Vector3(1, 0.4, 0.5) },
          uHalf: { value: 1 },
          uSquared: { value: 1 },
          uBands: { value: 0 },
        },
      }),
    [],
  );

  useFrame(() => {
    const u = material.uniforms;
    u.uHalf.value = half ? 1 : 0;
    u.uSquared.value = squared ? 1 : 0;
    u.uBands.value = bands;
    (u.uLightDir.value as THREE.Vector3).copy(lightDirFromAngles(azimuth, 20));
  });

  return (
    <mesh>
      <sphereGeometry args={[1.3, 128, 128]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/** remap 곡선 미니그래프: x = raw N·L(-1..1), y = diffuse(0..1). 두 곡선 겹쳐 비교. */
function RemapGraph({ squared, bands }: { squared: boolean; bands: number }) {
  const ref = useCanvas2D(
    150,
    ({ ctx, width, height, colors }) => {
      const padL = 30;
      const padR = 12;
      const padT = 10;
      const padB = 22;
      const w = width - padL - padR;
      const h = height - padT - padB;

      const X = (raw: number) => padL + ((raw + 1) / 2) * w; // raw -1..1
      const Y = (d: number) => padT + (1 - d) * h; // d 0..1

      // 축
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(padL, padT, w, h);
      // raw=0 세로선
      ctx.beginPath();
      ctx.moveTo(X(0), padT);
      ctx.lineTo(X(0), padT + h);
      ctx.strokeStyle = colors.border;
      ctx.stroke();

      const quant = (d: number) => {
        if (bands <= 1.5) return d;
        const q = Math.min(Math.floor(d * bands), bands - 1);
        return q / (bands - 1);
      };

      // Lambert: max(0, raw)
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const raw = -1 + (2 * i) / 120;
        const d = quant(Math.max(0, raw));
        const x = X(raw);
        const y = Y(d);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Half-Lambert: (raw*0.5+0.5)^? then quant
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const raw = -1 + (2 * i) / 120;
        let d = raw * 0.5 + 0.5;
        if (squared) d = d * d;
        d = quant(d);
        const x = X(raw);
        const y = Y(d);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 라벨
      ctx.fillStyle = colors.muted;
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('N·L', X(0) + 3, padT + h + 16);
      ctx.fillText('-1', padL - 4, padT + h + 16);
      ctx.fillText('1', padL + w - 6, padT + h + 16);
      ctx.save();
      ctx.translate(10, padT + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('diffuse', -20, 0);
      ctx.restore();
      ctx.fillStyle = colors.accent;
      ctx.fillText('half-Lambert', padL + 4, padT + 12);
      ctx.fillStyle = colors.muted;
      ctx.fillText('Lambert', padL + 4, padT + 26);
    },
    [squared, bands],
  );

  return <canvas ref={ref} style={{ display: 'block', width: '100%' }} />;
}

/**
 * 위젯 4 — Lambert vs Half-Lambert.
 * 토글로 두 remap을 바꾸며 구 뒷면이 어떻게 살아나는지, remap 곡선 미니그래프로
 * "무엇을 어떻게 다시 매핑하는지"를 같이 보인다 — 과정 위젯.
 */
export default function HalfLambertCompare() {
  const [half, setHalf] = useState(true);
  const [squared, setSquared] = useState(true);
  const [bands, setBands] = useState(0);
  const [azimuth, setAzimuth] = useState(150);

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={340}>
        <Shaded half={half} squared={squared} bands={bands} azimuth={azimuth} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <RemapGraph squared={squared && half} bands={bands} />

      <ControlPanel>
        <ToggleControl label="Half-Lambert 사용" checked={half} onChange={setHalf} />
        <ToggleControl label="제곱 (Valve)" checked={squared} onChange={setSquared} />
        <Slider
          label="밴드 수 (0 = 연속)"
          value={bands}
          min={0}
          max={8}
          step={1}
          onChange={(v) => setBands(Math.round(v))}
          format={(v) => (v < 1.5 ? '연속' : `${Math.round(v)}`)}
        />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 광원을 옆이나 뒤로 돌려(방위각 90~270°) 구의 어두운 면을
        본 다음, Half-Lambert를 껐다 켜 보세요. 순수 Lambert는 N·L&lt;0인 뒷면이 0으로 죽어 형태가
        납작해지지만, Half-Lambert는 N·L을 [0,1]로 remap해 뒷면에도 음영이 남습니다. 제곱(Valve)을
        켜면 어두운 쪽이 다시 눌려 대비가 살아납니다. 밴드를 켜면 toon에서의 차이도 볼 수 있습니다.
        그래프의 파란 곡선이 곧 적용 중인 remap입니다.
      </figcaption>
    </figure>
  );
}
