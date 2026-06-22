import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return {
    text: cs.getPropertyValue('--text').trim() || '#222',
    muted: cs.getPropertyValue('--muted').trim() || '#888',
    border: cs.getPropertyValue('--border').trim() || '#ccc',
    accent: cs.getPropertyValue('--accent').trim() || '#4f9dde',
    surface: cs.getPropertyValue('--surface').trim() || '#fff',
  };
}

// Halton(2) 저편차 수열 — 서브픽셀 jitter용.
function halton(i: number, base: number): number {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

/**
 * temporal upscaling의 핵심 직관: 매 프레임 서브픽셀 jitter로 찍은 저해상도 샘플들이
 * N프레임에 걸쳐 쌓이면 고해상도 supersampling과 같아진다.
 * 과정: frames 슬라이더로 샘플을 한 프레임씩 떨어뜨려 누적 → 비스듬한 에지가 또렷해짐.
 * "고스팅" 토글: disocclusion(새로 드러난 영역)에서 옛 history를 안 버리면 번지는 걸 보임.
 */
export default function TemporalJitter() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState(8);
  const [showGhost, setShowGhost] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 460;
      const cssH = 300;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // 두 패널: 왼쪽 = 저해상도 한 프레임(jitter 점), 오른쪽 = N프레임 누적 재구성.
      const pad = 14;
      const panelW = (cssW - pad * 3) / 2;
      const panelH = 210;
      const top = 40;
      const LOW = 8; // 저해상도 격자(8x8)
      const HI = 4; // 픽셀당 서브해상도(4x4 → supersample 격자)

      // ground-truth: 비스듬한 에지. f(x,y)=1 if y < 0.35 + 0.55*x  (대각 경계)
      const edge = (x: number, y: number) => (y < 0.32 + 0.6 * x ? 1 : 0);

      // 패널 제목.
      ctx.fillStyle = col.text;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('저해상도 1프레임 (jitter)', pad, 24);
      ctx.fillText(`${frames}프레임 누적 재구성`, pad * 2 + panelW, 24);

      // ── 왼쪽: 저해상도 한 프레임 + 현재 jitter 위치 ──
      const lx = pad;
      const cellL = panelW / LOW;
      const cellLy = panelH / LOW;
      // 현재(마지막) 프레임 jitter.
      const k = Math.max(0, frames - 1);
      const jx = halton(k + 1, 2) - 0.5;
      const jy = halton(k + 1, 3) - 0.5;
      for (let i = 0; i < LOW; i++) {
        for (let j = 0; j < LOW; j++) {
          const sx = (j + 0.5 + jx) / LOW;
          const sy = (i + 0.5 + jy) / LOW;
          const v = edge(sx, sy);
          const g = v ? 230 : 60;
          ctx.fillStyle = `rgb(${g},${g},${g})`;
          ctx.fillRect(lx + j * cellL, top + i * cellLy, cellL - 1, cellLy - 1);
          // 샘플 점.
          ctx.fillStyle = col.accent;
          ctx.beginPath();
          ctx.arc(lx + (j + 0.5 + jx) * cellL, top + (i + 0.5 + jy) * cellLy, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = col.border;
      ctx.strokeRect(lx, top, panelW, panelH);

      // ── 오른쪽: N프레임 누적 → HI*LOW 해상도로 재구성 ──
      const rx = pad * 2 + panelW;
      const RES = LOW * HI; // 재구성 해상도
      // 각 고해상도 셀에 떨어진 샘플들의 평균(누적 supersampling).
      const acc = new Float32Array(RES * RES);
      const cnt = new Float32Array(RES * RES);
      for (let f = 0; f < frames; f++) {
        const fjx = halton(f + 1, 2) - 0.5;
        const fjy = halton(f + 1, 3) - 0.5;
        for (let i = 0; i < LOW; i++) {
          for (let j = 0; j < LOW; j++) {
            const sx = (j + 0.5 + fjx) / LOW;
            const sy = (i + 0.5 + fjy) / LOW;
            let v = edge(sx, sy);
            // 고스팅 시연: 왼쪽 위 영역을 "새로 드러난 곳"으로 보고,
            // history를 안 버리면 옛 값(반대 색)이 섞여 번진다.
            if (showGhost && sx < 0.45 && sy < 0.45) {
              const stale = 1 - v; // 직전엔 가려져 있던, 지금과 다른 색
              v = 0.5 * v + 0.5 * stale; // 잘못 섞인 history
            }
            const ci = Math.min(RES - 1, Math.floor(sy * RES));
            const cj = Math.min(RES - 1, Math.floor(sx * RES));
            const idx = ci * RES + cj;
            acc[idx] += v;
            cnt[idx] += 1;
          }
        }
      }
      const cellR = panelW / RES;
      const cellRy = panelH / RES;
      // 비어 있는 셀은 가장 가까운 채워진 값으로(단순 행 보간).
      for (let i = 0; i < RES; i++) {
        let last = 0.3;
        for (let j = 0; j < RES; j++) {
          const idx = i * RES + j;
          let v: number;
          if (cnt[idx] > 0) {
            v = acc[idx] / cnt[idx];
            last = v;
          } else {
            v = last;
          }
          const g = Math.round(60 + v * 170);
          ctx.fillStyle = `rgb(${g},${g},${g})`;
          ctx.fillRect(rx + j * cellR, top + i * cellRy, cellR + 0.5, cellRy + 0.5);
        }
      }
      ctx.strokeStyle = col.border;
      ctx.strokeRect(rx, top, panelW, panelH);

      // 커버리지 표시: 채워진 셀 비율.
      let filled = 0;
      for (let n = 0; n < RES * RES; n++) if (cnt[n] > 0) filled++;
      ctx.fillStyle = col.muted;
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(
        `해상도 ${RES}×${RES} 중 ${Math.round((filled / (RES * RES)) * 100)}% 샘플됨`,
        rx,
        top + panelH + 18,
      );
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [frames, showGhost]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        style={{
          width: '100%',
          borderRadius: 10,
          border: '1px solid var(--border)',
          touchAction: 'none',
          display: 'block',
        }}
      />
      <ControlPanel>
        <Slider label="누적 프레임 수" value={frames} min={1} max={16} step={1} onChange={setFrames} />
        <ToggleControl label="history 안 버림(고스팅)" checked={showGhost} onChange={setShowGhost} />
      </ControlPanel>
      <figcaption>
        왼쪽은 저해상도 한 프레임 — 매 프레임 카메라를 <strong>서브픽셀만큼 흔들어(jitter)</strong>
        샘플 위치가 조금씩 달라집니다(파란 점). 오른쪽은 그 샘플을 <strong>N프레임 모아</strong> 한
        고해상도 격자에 다시 쌓은 것: 프레임이 늘수록 비스듬한 에지가 또렷해지죠. 이게 temporal
        upscaling의 정체입니다 — <strong>시간으로 흩뿌린 supersampling</strong>. 프레임을 1→16으로
        밀어 보세요. "history 안 버림"을 켜면, 새로 드러난(disocclusion) 왼쪽 위 영역에 옛 프레임의
        엉뚱한 값이 섞여 <strong>번집니다(ghosting)</strong> — 이 stale history를 골라 버리는 게
        upscaler의 진짜 어려운 일입니다.
      </figcaption>
    </figure>
  );
}
