import { useEffect, useRef } from 'react';

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

// Halton 저편차 수열 — 서브픽셀 jitter용.
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
 * temporal upscaling의 핵심 직관을 보여주는 정적 도식: 매 프레임 서브픽셀 jitter로 찍은
 * 저해상도 샘플들이 N프레임에 걸쳐 쌓이면 고해상도 supersampling과 같아진다.
 * 위 = 저해상도 한 프레임(jitter 점), 아래 = 8프레임 누적 재구성. 대표 상태(8프레임)를 정지로 그린다.
 */
const W = 360;
const H = 440;
const FRAMES = 8; // 대표 누적 프레임 수
const LOW = 8; // 저해상도 격자(8x8)
const HI = 4; // 픽셀당 서브해상도(4x4 → supersample 격자)

export default function TemporalJitter() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // 두 패널을 위→아래로 스택(모바일 세로).
      const pad = 16;
      const panelW = W - pad * 2;
      const panelH = 168;

      // ground-truth: 비스듬한 에지.
      const edge = (x: number, y: number) => (y < 0.32 + 0.6 * x ? 1 : 0);

      // ── 위: 저해상도 한 프레임 + 현재 jitter 위치 ──
      const top1 = 36;
      ctx.fillStyle = col.text;
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText('저해상도 1프레임 (jitter)', pad, 24);

      const lx = pad;
      const cellL = panelW / LOW;
      const cellLy = panelH / LOW;
      const k = FRAMES - 1; // 마지막 프레임 jitter
      const jx = halton(k + 1, 2) - 0.5;
      const jy = halton(k + 1, 3) - 0.5;
      for (let i = 0; i < LOW; i++) {
        for (let j = 0; j < LOW; j++) {
          const sx = (j + 0.5 + jx) / LOW;
          const sy = (i + 0.5 + jy) / LOW;
          const v = edge(sx, sy);
          const g = v ? 230 : 60;
          ctx.fillStyle = `rgb(${g},${g},${g})`;
          ctx.fillRect(lx + j * cellL, top1 + i * cellLy, cellL - 1, cellLy - 1);
          // 샘플 점.
          ctx.fillStyle = col.accent;
          ctx.beginPath();
          ctx.arc(lx + (j + 0.5 + jx) * cellL, top1 + (i + 0.5 + jy) * cellLy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = col.border;
      ctx.strokeRect(lx, top1, panelW, panelH);

      // ── 아래: N프레임 누적 → HI*LOW 해상도로 재구성 ──
      const top2 = top1 + panelH + 50;
      ctx.fillStyle = col.text;
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(`${FRAMES}프레임 누적 재구성`, pad, top2 - 12);

      const rx = pad;
      const RES = LOW * HI; // 재구성 해상도
      const acc = new Float32Array(RES * RES);
      const cnt = new Float32Array(RES * RES);
      for (let f = 0; f < FRAMES; f++) {
        const fjx = halton(f + 1, 2) - 0.5;
        const fjy = halton(f + 1, 3) - 0.5;
        for (let i = 0; i < LOW; i++) {
          for (let j = 0; j < LOW; j++) {
            const sx = (j + 0.5 + fjx) / LOW;
            const sy = (i + 0.5 + fjy) / LOW;
            const v = edge(sx, sy);
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
          ctx.fillRect(rx + j * cellR, top2 + i * cellRy, cellR + 0.5, cellRy + 0.5);
        }
      }
      ctx.strokeStyle = col.border;
      ctx.strokeRect(rx, top2, panelW, panelH);

      // 커버리지 표시.
      let filled = 0;
      for (let n = 0; n < RES * RES; n++) if (cnt[n] > 0) filled++;
      ctx.fillStyle = col.muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(
        `해상도 ${RES}×${RES} 중 ${Math.round((filled / (RES * RES)) * 100)}% 샘플됨`,
        rx,
        top2 + panelH + 20,
      );
    };

    draw();
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{
            width: '100%',
            maxWidth: W,
            height: 'auto',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'block',
          }}
        />
      </div>
      <figcaption>
        위는 저해상도 한 프레임 — 매 프레임 카메라를 <strong>서브픽셀만큼 흔들어(jitter)</strong>
        샘플 위치가 조금씩 달라집니다(파란 점). 아래는 그 샘플을 <strong>8프레임 모아</strong> 한
        고해상도 격자에 다시 쌓은 것: 프레임이 쌓일수록 비스듬한 에지가 또렷해집니다. 이게 temporal
        upscaling의 정체입니다 — <strong>시간으로 흩뿌린 supersampling</strong>. 단, 카메라나 물체가
        움직여 <strong>새로 드러난(disocclusion)</strong> 영역에 옛 프레임의 엉뚱한 값이 섞이면
        <strong>번지는(ghosting)</strong> 문제가 생기고, 이 stale history를 골라 버리는 게 upscaler의
        진짜 어려운 일입니다.
      </figcaption>
    </figure>
  );
}
