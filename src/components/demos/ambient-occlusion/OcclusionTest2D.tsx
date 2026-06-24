import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { readColors, setupCanvas } from './canvas2d';
import { usePointerDrag } from '../raymarching-sdf/usePointerDrag';

// 2D 단면으로 SSAO의 깊이 비교를 본다.
// "깊이 버퍼"는 화면 x에 대한 표면 높이(=카메라까지 거리의 대용). 한 프래그먼트에서
// 반구 샘플을 뿌리고, 각 샘플의 (투영된 x에서 저장된 깊이) vs (샘플 자신의 깊이)를 비교한다.
// 저장된 표면이 샘플보다 카메라에 더 가까우면 = 샘플이 기하 안에 묻힘 = 차폐.

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

// 깊이 프로파일(작을수록 카메라에 가까움 = 화면에서 위). 단위는 화면 px(아래로 +).
// 왼쪽 평지 + 가운데 솟은 벽(전경) + 오른쪽 낮은 평지(배경) → haloing 시나리오.
function surfaceY(x: number, w: number, h: number): number {
  const base = h * 0.62;
  const wallC = w * 0.5;
  const wallW = w * 0.1;
  // 가까운 전경 벽(위로 솟음 = y 작아짐)
  const wall = x > wallC - wallW && x < wallC + wallW ? h * 0.26 : 0;
  // 오른쪽은 더 멀리(아래)
  const right = x > wallC + wallW ? h * 0.1 : 0;
  return base - wall + right;
}

export default function OcclusionTest2D() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [radius, setRadius] = useState(60);
  const [bias, setBias] = useState(4);
  const [rangeCheck, setRangeCheck] = useState(true);
  const [samples, setSamples] = useState(16);
  const fragXRef = useRef(0.34); // 프래그먼트 위치(정규화 x). 기본: 벽 왼쪽(haloing 받는 곳)

  const drawRef = useRef<() => void>(null);
  usePointerDrag(ref, {
    onDown: (e, canvas) => {
      const rect = canvas.getBoundingClientRect();
      fragXRef.current = Math.min(0.95, Math.max(0.05, (e.clientX - rect.left) / rect.width));
      drawRef.current?.();
      return true;
    },
    onMove: (e, canvas) => {
      const rect = canvas.getBoundingClientRect();
      fragXRef.current = Math.min(0.95, Math.max(0.05, (e.clientX - rect.left) / rect.width));
      drawRef.current?.();
    },
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const s = setupCanvas(canvas, 300);
      if (!s) return;
      const { ctx, w, h } = s;
      const col = readColors(canvas);
      ctx.clearRect(0, 0, w, h);

      // 표면(깊이 버퍼) 채우기
      ctx.fillStyle = col.surface;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 2) ctx.lineTo(x, surfaceY(x, w, h));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col.border;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const y = surfaceY(x, w, h);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 프래그먼트
      const fx = fragXRef.current * w;
      const fy = surfaceY(fx, w, h);
      // 법선(2D: 표면 기울기의 수직, 위쪽). 평지에선 위로.
      const dxn = (surfaceY(fx + 2, w, h) - surfaceY(fx - 2, w, h)) / 4;
      let nx = dxn, ny = -1; // 위로
      const nl = Math.hypot(nx, ny);
      nx /= nl;
      ny /= nl;

      // 반구 샘플(법선 기준 ±90°), 가속 분포
      const rand = mulberry32(7);
      let occCount = 0;
      const tx = -ny, ty = nx; // 접선
      for (let i = 0; i < samples; i++) {
        const side = rand() < 0.5 ? -1 : 1;
        const theta = Math.asin(Math.sqrt(rand())) * side;
        let scale = (i + 0.5) / samples;
        scale = 0.1 + 0.9 * scale * scale;
        const rr = scale * radius;
        const dx = nx * Math.cos(theta) + tx * Math.sin(theta);
        const dy = ny * Math.cos(theta) + ty * Math.sin(theta);
        const sxp = fx + dx * rr;
        const syp = fy + dy * rr;
        // 이 샘플을 화면 x로 투영해 저장된 표면 깊이 읽기
        const storedY = surfaceY(Math.min(w, Math.max(0, sxp)), w, h);
        // 비교: 저장 표면이 샘플보다 카메라에 가까움(=화면에서 위, y 작음) + bias
        const occluded = storedY <= syp - bias;
        // range check: 깊이 차가 radius보다 크면 페이드(여기선 차폐 무시)
        let rc = 1;
        if (rangeCheck) {
          const diff = Math.abs(fy - storedY);
          rc = diff > 0 ? Math.min(1, radius / diff) : 1;
          rc = rc * rc * (3 - 2 * rc); // smoothstep-ish
        }
        const counts = occluded && (!rangeCheck || rc > 0.5);
        if (occluded) occCount += rc;

        // 샘플 그리기
        ctx.strokeStyle = col.muted;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(sxp, syp);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = counts ? '#d9534f' : occluded ? '#e0a96d' : col.accent;
        ctx.beginPath();
        ctx.arc(sxp, syp, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 법선
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + nx * 34, fy + ny * 34);
      ctx.stroke();
      // 프래그먼트 점
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.arc(fx, fy, 5, 0, Math.PI * 2);
      ctx.fill();

      // AO 결과 막대
      const ao = 1 - occCount / samples;
      ctx.fillStyle = col.text;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`AO = ${ao.toFixed(2)}  (차폐 ${(100 - ao * 100).toFixed(0)}%)`, 10, 22);
      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('드래그: 프래그먼트 이동 · 빨강=차폐로 계산됨 · 주황=차폐지만 range check로 무시', 10, h - 10);
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
  }, [radius, bias, rangeCheck, samples]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        style={{ width: '100%', height: 'auto', maxWidth: 380, borderRadius: 8, border: '1px solid var(--border)', touchAction: 'none' }}
      />
      <ControlPanel>
        <Slider label="반경 (radius)" value={radius} min={20} max={120} step={2} onChange={setRadius} format={(v) => `${v}px`} />
        <Slider label="bias" value={bias} min={0} max={20} step={1} onChange={setBias} format={(v) => `${v}px`} />
        <Slider label="샘플 수" value={samples} min={4} max={48} step={1} onChange={setSamples} />
        <ToggleControl label="range check" checked={rangeCheck} onChange={setRangeCheck} />
      </ControlPanel>
      <figcaption>
        이 단면은 깊이 버퍼입니다(위로 솟을수록 카메라에 가까움). 각 샘플은 화면 x로 투영해, 그 자리에
        <strong>저장된 표면 깊이</strong>가 <strong>샘플 자신의 깊이</strong>보다 카메라에 가까우면(=기하 안에
        묻힘) 차폐로 셉니다. 프래그먼트를 가운데 벽 <em>왼쪽</em>에 두고 <strong>range check를 끄면</strong>,
        벽 너머 멀리 있는 배경까지 차폐로 잡혀(주황→빨강) 평지가 검게 물듭니다 — 이게 haloing입니다. range
        check를 켜면 깊이 차가 반경보다 큰 그 가짜 차폐가 무시됩니다. <strong>bias를 0</strong>으로 내리면 평지에서
        같은 면이 수치 오차로 자기 자신을 가려(self-occlusion) AO가 1보다 낮아지는 줄무늬가 생깁니다.
      </figcaption>
    </figure>
  );
}
