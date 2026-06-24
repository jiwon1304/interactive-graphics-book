import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { readColors, setupCanvas } from './canvas2d';
import { usePointerDrag } from '../raymarching-sdf/usePointerDrag';

// 결정적 PRNG.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 위젯 — 반구 샘플 커널(2D 단면, 인터랙티브).
 * 표면점 위 반구를 법선축으로 띄우고, 샘플을 코사인 가중 + 중심 가속 분포로 배치한다.
 * 드래그로 법선을 돌리면 반구 전체가 같이 돈다(SSAO가 TBN으로 회전하는 것과 동일).
 * 과정 강조: "왜 구가 아니라 반구인가", "왜 중심에 더 몰리는가(가속)"를 직접 본다.
 */
export default function HemisphereKernel() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(24);
  const [accel, setAccel] = useState(true);
  const [fullSphere, setFullSphere] = useState(false);
  const angleRef = useRef(-Math.PI / 2); // 법선 각도(위쪽 기본). 캔버스 y는 아래로 증가.

  // 드래그로 법선 회전.
  usePointerDrag(ref, {
    onDown: () => true,
    onMove: (e, canvas) => {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height * 0.72; // 표면점 위치(아래쪽)
      const dx = e.clientX - rect.left - cx;
      const dy = e.clientY - rect.top - cy;
      angleRef.current = Math.atan2(dy, dx);
      drawRef.current?.();
    },
  });

  const drawRef = useRef<() => void>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const s = setupCanvas(canvas, 320);
      if (!s) return;
      const { ctx, w, h } = s;
      const col = readColors(canvas);
      ctx.clearRect(0, 0, w, h);

      const ox = w / 2;
      const oy = h * 0.72;
      const R = Math.min(w, h) * 0.42;
      const nAng = angleRef.current; // 법선 방향(화면각)
      // 법선이 위쪽(화면 -y)을 향하도록 기본; 표면은 법선에 수직.
      const nx = Math.cos(nAng);
      const ny = Math.sin(nAng);
      // 접선
      const tx = -ny;
      const ty = nx;

      // 표면(접평면) 선
      ctx.strokeStyle = col.border;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox - tx * R * 1.3, oy - ty * R * 1.3);
      ctx.lineTo(ox + tx * R * 1.3, oy + ty * R * 1.3);
      ctx.stroke();

      // 반구(혹은 구) 외곽
      ctx.strokeStyle = col.muted;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (fullSphere) {
        ctx.arc(ox, oy, R, 0, Math.PI * 2);
      } else {
        // 법선 쪽 반원만
        const start = nAng - Math.PI / 2;
        ctx.arc(ox, oy, R, start, start + Math.PI);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // 법선 화살표
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + nx * R, oy + ny * R);
      ctx.stroke();
      // 화살촉
      const ha = Math.atan2(ny, nx);
      ctx.beginPath();
      ctx.moveTo(ox + nx * R, oy + ny * R);
      ctx.lineTo(ox + nx * R - 9 * Math.cos(ha - 0.4), oy + ny * R - 9 * Math.sin(ha - 0.4));
      ctx.lineTo(ox + nx * R - 9 * Math.cos(ha + 0.4), oy + ny * R - 9 * Math.sin(ha + 0.4));
      ctx.closePath();
      ctx.fillStyle = col.accent;
      ctx.fill();

      // 샘플들. 코사인 가중 단면: 각도 theta(법선 기준) ~ asin(u), 반지름 가속.
      const rand = mulberry32(99);
      for (let i = 0; i < count; i++) {
        // 단면이라 좌/우로 펼친 각. 코사인 가중 ≈ 법선 근처로 몰림.
        const side = rand() < 0.5 ? -1 : 1;
        let theta = Math.asin(Math.sqrt(rand())); // [0,π/2) 코사인 가중
        if (fullSphere) theta = (rand() - 0.0) * Math.PI; // 균일 반구→구면 단면 흉내
        const sign = fullSphere && rand() < 0.5 ? -1 : 1;
        // 거리(반지름) 분포: 가속이면 중심에 몰리게.
        let scale = (i + 0.5) / count;
        scale = accel ? 0.1 + (1.0 - 0.1) * scale * scale : scale;
        const rr = scale * R;
        // 방향 = 법선을 theta만큼 회전(접선 쪽으로 side)
        const a = theta * side;
        const dx = nx * Math.cos(a) + tx * Math.sin(a);
        const dy = ny * Math.cos(a) + ty * Math.sin(a);
        const px = ox + dx * rr * sign;
        const py = oy + dy * rr * sign;
        // 풀-구에서 표면 아래(법선 반대쪽) 샘플은 빨갛게(쓸모없음 표시)
        const below = (px - ox) * nx + (py - oy) * ny < 0;
        ctx.fillStyle = below ? '#d9534f' : col.text;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 표면점
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.arc(ox, oy, 4, 0, Math.PI * 2);
      ctx.fill();

      // 라벨
      ctx.fillStyle = col.text;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('n', ox + nx * R + 6, oy + ny * R + 4);
      ctx.fillStyle = col.muted;
      ctx.fillText('드래그로 법선 회전', 8, h - 10);
    };
    drawRef.current = draw;
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [count, accel, fullSphere]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        style={{ width: '100%', height: 'auto', maxWidth: 360, borderRadius: 8, border: '1px solid var(--border)', touchAction: 'none' }}
      />
      <ControlPanel>
        <Slider label="샘플 수" value={count} min={4} max={64} step={1} onChange={setCount} />
        <ToggleControl label="중심 가속 분포" checked={accel} onChange={setAccel} />
        <ToggleControl label="반구 대신 구 전체" checked={fullSphere} onChange={setFullSphere} />
      </ControlPanel>
      <figcaption>
        SSAO는 표면점마다 <strong>법선을 축으로 한 반구</strong> 안에 샘플을 뿌려, 그중 몇 개가 다른
        기하에 막히는지로 차폐를 잽니다. 드래그로 법선을 돌리면 반구가 통째로 따라 돕니다(실제 구현은
        법선·랜덤벡터로 TBN을 만들어 회전). <strong>구 전체</strong>로 바꾸면 절반의 샘플이 표면 아래로
        들어가(빨강) 평평한 벽조차 절반쯤 가려진 것으로 잡혀 회색으로 떠 보입니다 — 그래서 반구를 씁니다.
        <strong>중심 가속 분포</strong>를 켜면 샘플이 표면 가까이 몰려, 가까운 차폐(접촉부)에 더 큰
        가중을 줍니다(구현의 <code>scale = lerp(0.1, 1.0, s²)</code>).
      </figcaption>
    </figure>
  );
}
