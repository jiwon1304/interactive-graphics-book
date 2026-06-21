import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, SelectControl, ToggleControl, type SelectOption } from '../../controls';

type Mode = 'sdf' | 'lambert' | 'field';

const MODE_OPTIONS: ReadonlyArray<SelectOption<Mode>> = [
  { value: 'sdf', label: 'SDF 그림자 맵' },
  { value: 'lambert', label: '소박한 N·L 자기그림자' },
  { value: 'field', label: 'SDF 필드(흑백) 보기' },
];

const W = 300;
const H = 380;

// 색(라이트/다크 무관하게 일러스트는 자기 색을 가짐)
const SKIN = [255, 224, 196];
const SKIN_SHADOW = [206, 158, 150];
const HAIR = [78, 62, 86];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * 정면 얼굴을 한 프레임 그린다.
 * 좌표계: 픽셀 → 얼굴 정규좌표 (cx,cy), 머리 반경 RX/RY 기준 [-1,1].
 */
function render(ctx: CanvasRenderingContext2D, mode: Mode, yawDeg: number, soft: boolean) {
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const RX = 0.62 * (W / 2);
  const RY = 0.82 * (H / 2);
  const cx = W / 2;
  const cy = H / 2;

  // 광원: yaw(-90..90), p = 옆으로 치우친 정도(0 정면 → 1 측면)
  const fromRight = yawDeg >= 0;
  const p = Math.min(1, Math.abs(yawDeg) / 90);
  const Lx = Math.sin((yawDeg * Math.PI) / 180);
  const Lz = Math.cos((yawDeg * Math.PI) / 180); // 정면 성분

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      const nx = (px - cx) / RX; // [-1,1] 가로
      const ny = (cy - py) / RY; // [-1,1] 세로(위 +)
      const inHead = nx * nx + ny * ny <= 1.0;
      if (!inHead) {
        d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
        continue;
      }

      // 광원 기준으로 좌우를 통일(오른쪽에서 오면 그대로, 왼쪽이면 x 뒤집기)
      const X = fromRight ? nx : -nx;

      // ── SDF 그림자 필드 s(x,y) ∈ [0,1]: 클수록 늦게 그림자 ──
      // 기본: 광원 반대쪽(왼쪽, X<0)이 먼저 그림자.
      let s = X * 0.5 + 0.5;
      // 코 그림자: 코의 그림자쪽(중앙 약간 안쪽)에 필드를 낮춰, p가 커지면 코그림자가 자란다.
      const noseBand = Math.exp(-(((ny + 0.18) / 0.22) ** 2));
      const noseSide = Math.exp(-(((X + 0.10) / 0.12) ** 2)); // 코의 그림자쪽
      s -= 0.22 * noseBand * noseSide;
      // 광대/턱으로 갈수록 살짝 일찍 그림자(자연스러운 굴곡)
      s += 0.06 * ny;
      s = Math.min(1, Math.max(0, s));

      let shadow: number; // 0 = 밝음, 1 = 그림자
      if (mode === 'field') {
        const v = s * 255;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
        continue;
      } else if (mode === 'sdf') {
        // 단 하나의 임계 p로 비교 → s<p 면 그림자. 부드럽게(AA) 또는 하드.
        shadow = soft ? 1 - smooth(p - 0.04, p + 0.04, s) : s < p ? 1 : 0;
      } else {
        // 소박한 Lambert: 반구 법선 + 코 범프로 N·L 자기그림자
        const z = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        let Nx = nx,
          Ny = ny,
          Nz = z + 0.6;
        // 코 범프(중앙 돌출) → 주변 법선을 좌우로 기울임
        const nb = Math.exp(-((nx / 0.10) ** 2) - (((ny + 0.18) / 0.16) ** 2));
        Nx += Math.sign(nx || 1) * nb * 1.4;
        Ny += -nb * 0.6;
        const ln = Math.hypot(Nx, Ny, Nz);
        const ndl = (Nx * Lx + Ny * 0.15 + Nz * Lz) / ln;
        shadow = soft ? 1 - smooth(0.16, 0.26, ndl) : ndl < 0.21 ? 1 : 0;
      }

      // 피부색 합성
      let r = lerp(SKIN[0], SKIN_SHADOW[0], shadow);
      let g = lerp(SKIN[1], SKIN_SHADOW[1], shadow);
      let b = lerp(SKIN[2], SKIN_SHADOW[2], shadow);

      // ── 얼굴 피처(눈/입) 오버레이 ──
      // 눈
      const eyeY = 0.08;
      for (const ex of [-0.28, 0.28]) {
        const dx = (nx - ex) / 0.17;
        const dy = (ny - eyeY) / 0.12;
        if (dx * dx + dy * dy < 1) {
          // 흰자 + 홍채
          const ir = (nx - ex) ** 2 + (ny - eyeY) ** 2;
          if (ir < 0.0065) {
            r = 60; g = 50; b = 80;
          } else {
            r = 250; g = 248; b = 250;
          }
        }
        // 눈썹
        const bx = (nx - ex) / 0.2;
        const by = (ny - 0.32) / 0.04;
        if (bx * bx + by * by < 1) {
          r = HAIR[0]; g = HAIR[1]; b = HAIR[2];
        }
      }
      // 입
      const mx = nx / 0.18;
      const my = (ny + 0.5) / 0.05;
      if (mx * mx + my * my < 1 && ny < -0.42) {
        r = 196; g = 96; b = 96;
      }

      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.clearRect(0, 0, W, H);
  ctx.putImageData(img, 0, 0);

  // 머리카락(앞머리) — 얼굴 위 간단한 캡
  ctx.fillStyle = `rgb(${HAIR[0]},${HAIR[1]},${HAIR[2]})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy - RY * 0.55, RX * 1.04, RY * 0.62, 0, Math.PI, 2 * Math.PI);
  ctx.fill();

  // 광원 방향 화살표(위쪽)
  ctx.strokeStyle = 'rgba(240,200,60,0.95)';
  ctx.fillStyle = 'rgba(240,200,60,0.95)';
  ctx.lineWidth = 3;
  const ax = cx + Lx * 110;
  const ay = 30 - Lz * 8;
  ctx.beginPath();
  ctx.moveTo(cx, 30);
  ctx.lineTo(ax, ay);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ax, ay, 5, 0, 2 * Math.PI);
  ctx.fill();
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * 위젯 — 얼굴 SDF 그림자 맵.
 * 정면 얼굴에 (1) 소박한 N·L 자기그림자: 코·눈두덩이 지저분한 얼룩을 만든다.
 * (2) SDF 그림자 맵: 미리 칠한 필드 하나를 광원 yaw에 대응하는 단일 임계로 끊어,
 * 그림자가 코를 감싸며 깔끔하게 좌우로 쓸려간다(원신·호요버스 계열 트릭).
 */
export default function FaceShadowSDF() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<Mode>('sdf');
  const [yaw, setYaw] = useState(55);
  const [soft, setSoft] = useState(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    render(ctx, mode, yaw, soft);
  }, [mode, yaw, soft]);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{
            width: '100%',
            maxWidth: 300,
            height: 'auto',
            borderRadius: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        />
      </div>

      <ControlPanel>
        <SelectControl label="셰이딩 방식" value={mode} options={MODE_OPTIONS} onChange={setMode} />
        <Slider label="광원 좌우 (yaw)" value={yaw} min={-90} max={90} step={1} onChange={setYaw} unit="°" />
        <ToggleControl label="경계 부드럽게(AA)" checked={soft} onChange={setSoft} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> "소박한 N·L"로 두고 yaw를 돌려 보세요 — 코와 눈두덩이 지저분한
        얼룩을 만들고, 정면 근처에서 그림자가 어색하게 깜빡입니다. "SDF 그림자 맵"으로 바꾸면, 미리
        칠해 둔 필드 하나를 yaw에 대응하는 <em>단일 임계</em>로 끊을 뿐인데도 그림자가 코를 감싸며
        깔끔하게 좌우로 쓸려갑니다. "필드 보기"로 그 흑백 맵 자체를 확인하세요 — 이 한 장이 모든
        광원 각도의 그림자 모양을 담고 있습니다.
      </figcaption>
    </figure>
  );
}
