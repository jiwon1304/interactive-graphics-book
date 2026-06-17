import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

interface DrawColors {
  muted: string;
  border: string;
  accent: string;
}

/**
 * 단위원 위에서 "쿼터니언이 φ만큼 돌면 벡터는 2φ만큼 돈다"를 보여주는 2D 다이어그램.
 * - 보라색 바늘: 쿼터니언의 절반각 θ/2 방향
 * - 빨간 점: 실제로 회전된 점, 각도 θ (= 2 × θ/2)
 */
function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  thetaDeg: number,
  colors: DrawColors,
) {
  const cx = width / 2;
  const cy = height / 2;
  const R = Math.min(width, height) / 2 - 36;

  ctx.clearRect(0, 0, width, height);

  // 좌표축
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - R - 14, cy);
  ctx.lineTo(cx + R + 14, cy);
  ctx.moveTo(cx, cy - R - 14);
  ctx.lineTo(cx, cy + R + 14);
  ctx.stroke();

  // 단위원
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();

  const theta = (thetaDeg * Math.PI) / 180;
  const half = theta / 2;

  // 각도 부채꼴(θ/2): 시작 기준선에서 절반각까지
  ctx.fillStyle = `${colors.accent}22`;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R * 0.5, 0, -half, true);
  ctx.closePath();
  ctx.fill();

  // 각도 부채꼴(θ): 절반각에서 전체각까지 — 두 배임을 면적으로 강조
  ctx.fillStyle = `#e5484d22`;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R * 0.78, -half, -theta, true);
  ctx.closePath();
  ctx.fill();

  // 절반각 바늘 (쿼터니언 방향)
  const hx = cx + R * Math.cos(half);
  const hy = cy - R * Math.sin(half);
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(hx, hy);
  ctx.stroke();

  // 전체각 점/바늘 (회전된 벡터)
  const fx = cx + R * Math.cos(theta);
  const fy = cy - R * Math.sin(theta);
  ctx.strokeStyle = '#e5484d';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(fx, fy);
  ctx.stroke();
  ctx.fillStyle = '#e5484d';
  ctx.beginPath();
  ctx.arc(fx, fy, 6, 0, Math.PI * 2);
  ctx.fill();

  // 시작 기준선 (+x)
  ctx.strokeStyle = colors.muted;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + R, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  // 라벨
  ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = colors.accent;
  ctx.fillText(`쿼터니언 각 θ/2 = ${(thetaDeg / 2).toFixed(0)}°`, 12, 20);
  ctx.fillStyle = '#e5484d';
  ctx.fillText(`회전된 점 각 θ = ${thetaDeg.toFixed(0)}°  (= 2 × θ/2)`, 12, 40);
}

/**
 * 절반각 탐색기 — 왜 cos(θ/2)·sin(θ/2)인지.
 * 쿼터니언이 각도 φ로 작용할 때 그것이 회전시키는 벡터는 2φ만큼 돈다.
 * θ를 끌면 "2배" 관계가 면적·각도로 즉시 드러난다. 순수 2D, r3f의 Canvas 미사용.
 */
export default function HalfAngleExplorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [theta, setTheta] = useState(120);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const colors: DrawColors = {
      muted: cssVar('--muted') || '#5b6472',
      border: cssVar('--border') || '#e2e5ea',
      accent: cssVar('--accent') || '#2f86cf',
    };

    // 고해상도 디스플레이 대응
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = canvas.clientWidth;
    const cssHeight = 260;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    draw(ctx, cssWidth, cssHeight, theta, colors);
  }, [theta]);

  return (
    <figure className="demo">
      <div
        style={{
          width: '100%',
          height: 260,
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: 'var(--surface)',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 260, display: 'block' }}
        />
      </div>

      <ControlPanel>
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

      <figcaption>
        파란 바늘은 쿼터니언이 도는 각 <strong>θ/2</strong>, 빨간 점은 실제로 회전한 벡터의 각{' '}
        <strong>θ</strong>입니다. 슬라이더를 끌면 빨간 부채꼴이 항상 파란 부채꼴의{' '}
        <em>정확히 두 배</em>로 벌어집니다. 쿼터니언에 절반각이 들어가는 이유가 바로 이 2배 관계입니다.
      </figcaption>
    </figure>
  );
}
