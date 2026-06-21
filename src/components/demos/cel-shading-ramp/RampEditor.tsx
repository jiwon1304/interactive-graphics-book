import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import DemoCanvas from '../../DemoCanvas';
import {
  ControlPanel,
  Slider,
  ColorControl,
  ToggleControl,
  SelectControl,
  type SelectOption,
} from '../../controls';
import { usePointerDrag } from '../raymarching-sdf/usePointerDrag';
import ToonShape from './ToonShape';
import {
  VERTEX_SHADER,
  FRAG_HEADER,
  lightDirFromAngles,
  hexToSRGB,
  type ShapeKind,
} from './shared';

const SHAPE_OPTIONS: ReadonlyArray<SelectOption<ShapeKind>> = [
  { value: 'sphere', label: '구' },
  { value: 'torus', label: '토러스' },
  { value: 'knot', label: '매듭' },
];

const RAMP_W = 256; // 데이터 텍스처(LUT) 가로 해상도

// 테마 변수를 따르는 단순 버튼 스타일(전역 버튼 스타일이 없어 인라인으로).
const BTN_STYLE: CSSProperties = {
  flex: 1,
  padding: '0.4rem 0.5rem',
  fontSize: '0.85rem',
  color: 'var(--text)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  cursor: 'pointer',
};

interface Stop {
  /** 0..1 위치(=N·L 좌표) */
  pos: number;
  /** '#rrggbb' */
  color: string;
}

// 초기 램프: 3밴드(어두운 보라 → 중간 → 밝은 노랑)
const INITIAL_STOPS: ReadonlyArray<Stop> = [
  { pos: 0.0, color: '#3a2f5c' },
  { pos: 0.38, color: '#7d6bb0' },
  { pos: 0.72, color: '#e8b04a' },
];

/** 정렬된 stop들을 N·L=t 위치에서 평가. smooth=false면 계단(hold), true면 선형보간. */
function evalRamp(stops: ReadonlyArray<Stop>, t: number, smooth: boolean): [number, number, number] {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  if (t <= sorted[0].pos) return hexToSRGB(sorted[0].color);
  const last = sorted[sorted.length - 1];
  if (t >= last.pos) return hexToSRGB(last.color);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.pos && t < b.pos) {
      if (!smooth) return hexToSRGB(a.color); // 계단: 왼쪽 stop 색 유지
      const f = (t - a.pos) / (b.pos - a.pos);
      const ca = hexToSRGB(a.color);
      const cb = hexToSRGB(b.color);
      return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f];
    }
  }
  return hexToSRGB(last.color);
}

const fragmentShader = /* glsl */ `
  ${FRAG_HEADER}

  uniform sampler2D uRamp;  // 1D LUT(가로) — N·L 로 인덱싱

  void main() {
    float ndl = lambertNdotL();
    vec3 col = texture(uRamp, vec2(ndl, 0.5)).rgb;
    fragColor = vec4(col, 1.0);
  }
`;

function Shaded({
  texture,
  azimuth,
  shape,
}: {
  texture: THREE.DataTexture;
  azimuth: number;
  shape: ShapeKind;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERTEX_SHADER,
        fragmentShader,
        uniforms: {
          uLightDir: { value: new THREE.Vector3(1, 0.5, 0.6) },
          uRamp: { value: texture },
        },
      }),
    [texture],
  );

  useFrame(() => {
    const u = material.uniforms;
    u.uRamp.value = texture;
    (u.uLightDir.value as THREE.Vector3).copy(lightDirFromAngles(azimuth, 25));
  });

  return (
    <ToonShape shape={shape}>
      <primitive object={material} attach="material" />
    </ToonShape>
  );
}

/**
 * 위젯 3(핵심) — 편집 가능한 1D ramp / LUT.
 * 가로 램프 바의 stop을 드래그하면 그 자리에서 구의 라이팅이 즉시 re-band 된다.
 * 램프 그 자체가 곧 라이팅 응답(N·L → 색)임을 보여주는 과정 위젯.
 */
export default function RampEditor() {
  const [stops, setStops] = useState<ReadonlyArray<Stop>>(INITIAL_STOPS);
  const [smooth, setSmooth] = useState(false);
  const [azimuth, setAzimuth] = useState(40);
  const [shape, setShape] = useState<ShapeKind>('sphere');
  const [selected, setSelected] = useState(2);

  // LUT 데이터 텍스처(램프를 RAMP_W 폭으로 굽는다)
  const texture = useMemo(() => {
    const data = new Uint8Array(RAMP_W * 4);
    const tex = new THREE.DataTexture(data, RAMP_W, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter; // 계단을 위해 nearest; smooth는 CPU 보간으로 이미 채움
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, []);

  // stops/smooth가 바뀔 때 LUT 다시 굽기
  useEffect(() => {
    const data = texture.image.data as Uint8Array;
    for (let x = 0; x < RAMP_W; x++) {
      const t = x / (RAMP_W - 1);
      const [r, g, b] = evalRamp(stops, t, smooth);
      data[x * 4 + 0] = Math.round(r * 255);
      data[x * 4 + 1] = Math.round(g * 255);
      data[x * 4 + 2] = Math.round(b * 255);
      data[x * 4 + 3] = 255;
    }
    texture.needsUpdate = true;
  }, [stops, smooth, texture]);

  // ---- 램프 바(2D 캔버스) ----
  const barRef = useRef<HTMLCanvasElement | null>(null);
  const dragIdx = useRef<number | null>(null);
  const padRef = useRef({ padL: 14, padR: 14, top: 8, barH: 30 }); // 그리기 좌표 공유

  // 램프 바를 그린다(굽힌 색 + stop 핸들)
  const drawBar = () => {
    const canvas = barRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const cssW = parent ? parent.clientWidth : canvas.clientWidth;
    if (cssW <= 0) return;
    const cssH = 64;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const cs = getComputedStyle(canvas);
    const accent = cs.getPropertyValue('--accent').trim() || '#2f86cf';
    const text = cs.getPropertyValue('--text').trim() || '#1a1d23';
    const border = cs.getPropertyValue('--border').trim() || '#ccc';

    const { padL, padR, top, barH } = padRef.current;
    const barW = cssW - padL - padR;

    // 램프 색 띠
    for (let x = 0; x < barW; x++) {
      const t = x / (barW - 1);
      const [r, g, b] = evalRamp(stops, t, smooth);
      ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
      ctx.fillRect(padL + x, top, 1, barH);
    }
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(padL + 0.5, top + 0.5, barW - 1, barH - 1);

    // 축 라벨
    ctx.fillStyle = text;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('어두움 (N·L=0)', padL, top + barH + 16);
    const rl = '밝음 (N·L=1)';
    ctx.fillText(rl, padL + barW - ctx.measureText(rl).width, top + barH + 16);

    // stop 핸들
    const sorted = stops.map((s, i) => ({ ...s, i })).sort((a, b) => a.pos - b.pos);
    for (const s of sorted) {
      const x = padL + s.pos * barW;
      const y = top + barH;
      ctx.beginPath();
      ctx.moveTo(x, top - 2);
      ctx.lineTo(x, y + 2);
      ctx.strokeStyle = s.i === selected ? accent : text;
      ctx.lineWidth = s.i === selected ? 2 : 1;
      ctx.stroke();
      // 핸들 삼각형
      ctx.beginPath();
      ctx.moveTo(x, top - 2);
      ctx.lineTo(x - 5, top - 11);
      ctx.lineTo(x + 5, top - 11);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.strokeStyle = s.i === selected ? accent : text;
      ctx.lineWidth = s.i === selected ? 2 : 1;
      ctx.stroke();
    }
  };

  // stops/smooth/selected 바뀔 때마다 바 다시 그림 + 리사이즈/테마 관찰
  useEffect(() => {
    drawBar();
    const canvas = barRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement ?? canvas;
    const ro = new ResizeObserver(() => drawBar());
    ro.observe(parent);
    const mo = new MutationObserver(() => drawBar());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, smooth, selected]);

  // 캔버스 x(css px) → 램프 t(0..1)
  const xToT = (clientX: number): number => {
    const canvas = barRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const { padL, padR } = padRef.current;
    const barW = rect.width - padL - padR;
    const x = clientX - rect.left - padL;
    return Math.min(Math.max(x / barW, 0), 1);
  };

  // 네이티브 포인터 드래그(iOS Safari 안전). 상태 추적은 useRef.
  usePointerDrag(barRef, {
    onDown: (e) => {
      const t = xToT(e.clientX);
      // 가장 가까운 stop 잡기(픽셀 임계 안)
      let best = -1;
      let bestDist = Infinity;
      stops.forEach((s, i) => {
        const d = Math.abs(s.pos - t);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      const canvas = barRef.current;
      const barW = canvas
        ? canvas.getBoundingClientRect().width - padRef.current.padL - padRef.current.padR
        : 1;
      if (best >= 0 && bestDist * barW < 16) {
        dragIdx.current = best;
        setSelected(best);
        // 첫 클릭에서도 위치 갱신
        setStops((prev) => prev.map((s, i) => (i === best ? { ...s, pos: t } : s)));
      } else {
        dragIdx.current = null;
        return false; // 핸들을 안 잡았으면 드래그로 보지 않음
      }
    },
    onMove: (e) => {
      const idx = dragIdx.current;
      if (idx === null) return;
      const t = xToT(e.clientX);
      setStops((prev) => prev.map((s, i) => (i === idx ? { ...s, pos: t } : s)));
    },
    onUp: () => {
      dragIdx.current = null;
    },
  });

  const selColor = stops[selected]?.color ?? '#ffffff';
  const canRemove = stops.length > 2;

  const addStop = () => {
    if (stops.length >= 6) return;
    setStops((prev) => {
      const next = [...prev, { pos: 0.5, color: '#c0c0c0' }];
      setSelected(next.length - 1);
      return next;
    });
  };

  const removeStop = () => {
    if (!canRemove) return;
    setStops((prev) => {
      const next = prev.filter((_, i) => i !== selected);
      setSelected(Math.min(selected, next.length - 1));
      return next;
    });
  };

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[0, 0, 4]} height={360}>
        <Shaded texture={texture} azimuth={azimuth} shape={shape} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>

      <div style={{ marginTop: '0.6rem' }}>
        <canvas ref={barRef} style={{ display: 'block', width: '100%', touchAction: 'none' }} />
      </div>

      <ControlPanel>
        <ColorControl
          label="선택한 stop 색"
          value={selColor}
          onChange={(c) => setStops((prev) => prev.map((s, i) => (i === selected ? { ...s, color: c } : s)))}
        />
        <ToggleControl label="계단 → 부드럽게(보간)" checked={smooth} onChange={setSmooth} />
        <Slider label="광원 방위각" value={azimuth} min={0} max={360} step={1} onChange={setAzimuth} unit="°" />
        <SelectControl label="도형" value={shape} options={SHAPE_OPTIONS} onChange={setShape} />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={addStop} disabled={stops.length >= 6} style={BTN_STYLE}>
            stop 추가
          </button>
          <button type="button" onClick={removeStop} disabled={!canRemove} style={BTN_STYLE}>
            선택 stop 삭제
          </button>
        </div>
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 램프 바의 핸들을 좌우로 드래그하면 그 위치(=N·L 값)에서 색이
        바뀌는 지점이 이동하고, 구가 즉시 다시 밴딩됩니다. 핸들을 잡으면 아래 색 픽커로 그 stop 색을
        바꿀 수 있습니다. stop을 추가해 밴드를 늘리고, "부드럽게"를 켜면 계단이 선형 보간으로 녹습니다.
        이 램프가 곧 라이팅 응답입니다 — N·L을 입력으로 받는 1D LUT.
      </figcaption>
    </figure>
  );
}
