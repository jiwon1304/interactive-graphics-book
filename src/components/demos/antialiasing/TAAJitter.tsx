import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return {
    text: cs.getPropertyValue('--text').trim() || '#222',
    muted: cs.getPropertyValue('--muted').trim() || '#888',
    border: cs.getPropertyValue('--border').trim() || '#ccc',
    accent: cs.getPropertyValue('--accent').trim() || '#4f9dde',
  };
}

// Halton(b) 시퀀스 — TAA 지터에 흔히 쓰는 저불일치(low-discrepancy) 수열.
function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

// 장면 함수(가는 사선) — 표본이 선 안이면 1.
function lineHard(x: number, y: number): number {
  const d = Math.abs(y - (0.5 * x + 0.18));
  return d < 0.02 ? 1 : 0;
}

/**
 * 위젯 — TAA의 시간축 누적.
 * 한 픽셀(크게 확대)에 매 프레임 Halton 지터로 표본 위치를 옮겨 한 표본씩 떨어뜨리고,
 * history와 지수이동평균으로 섞어 가는 과정을 애니메이션으로 본다.
 * "과정": 프레임이 쌓일수록 경계 픽셀이 정답 회색조로 수렴하는 걸 직접 본다.
 */
export default function TAAJitter() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [alpha, setAlpha] = useState(0.1); // EMA 블렌드(현재 프레임 가중)
  const [running, setRunning] = useState(true);
  const frameRef = useRef(1);
  // 각 큰 픽셀의 누적(history) 값
  const histRef = useRef<Float32Array | null>(null);
  const rafRef = useRef<number>(0);

  const GRID = 7;

  const drawOnce = () => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const col = readColors(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 340;
    const cssH = 300;
    if (canvas.width !== Math.round(cssW * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (!histRef.current) histRef.current = new Float32Array(GRID * GRID);
    const hist = histRef.current;

    const margin = 12;
    const size = Math.min(cssW - margin * 2, cssH - margin * 2 - 28);
    const ox = (cssW - size) / 2;
    const oy = 6;
    const cell = size / GRID;

    const fi = frameRef.current;
    // 이번 프레임의 지터(서브픽셀, [-0.5,0.5])
    const jx = halton(fi, 2) - 0.5;
    const jy = halton(fi, 3) - 0.5;

    for (let py = 0; py < GRID; py++) {
      for (let px = 0; px < GRID; px++) {
        // 지터된 표본 위치(정규화 0..1)
        const u = (px + 0.5 + jx) / GRID;
        const v = (py + 0.5 + jy) / GRID;
        const s = lineHard(u, v);
        const k = py * GRID + px;
        // 지수이동평균
        hist[k] = alpha * s + (1 - alpha) * hist[k];
        const g = Math.round((1 - hist[k]) * 255);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(ox + px * cell, oy + py * cell, cell, cell);
        ctx.strokeStyle = col.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + px * cell, oy + py * cell, cell, cell);
      }
    }

    // 이번 프레임 지터된 표본점들 표시
    for (let py = 0; py < GRID; py++) {
      for (let px = 0; px < GRID; px++) {
        const sxp = ox + (px + 0.5 + jx) * cell;
        const syp = oy + (py + 0.5 + jy) * cell;
        ctx.fillStyle = col.accent;
        ctx.beginPath();
        ctx.arc(sxp, syp, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = col.text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`프레임 ${fi}  ·  지터 (${jx.toFixed(2)}, ${jy.toFixed(2)})`, cssW / 2, oy + size + 20);
    ctx.textAlign = 'left';
  };

  useEffect(() => {
    const tick = () => {
      drawOnce();
      if (running) {
        frameRef.current += 1;
        rafRef.current = requestAnimationFrame(() => setTimeout(tick, 180));
      }
    };
    drawOnce();
    if (running) rafRef.current = requestAnimationFrame(() => setTimeout(tick, 180));
    const mo = new MutationObserver(drawOnce);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      cancelAnimationFrame(rafRef.current);
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, alpha]);

  const reset = () => {
    histRef.current = new Float32Array(GRID * GRID);
    frameRef.current = 1;
    drawOnce();
  };

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        style={{
          width: '100%',
          maxWidth: 340,
          borderRadius: 10,
          border: '1px solid var(--border)',
          display: 'block',
          margin: '0 auto',
        }}
      />
      <ControlPanel>
        <ToggleControl label="실행" checked={running} onChange={setRunning} />
        <Slider
          label="블렌드 α (현재 프레임)"
          value={alpha}
          min={0.02}
          max={0.5}
          step={0.01}
          onChange={setAlpha}
          format={(v) => v.toFixed(2)}
        />
      </ControlPanel>
      <div style={{ marginTop: 6 }}>
        <button
          onClick={reset}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            cursor: 'pointer',
            minHeight: 36,
          }}
        >
          history 초기화
        </button>
      </div>
      <figcaption>
        매 프레임 표본 위치를 Halton 시퀀스로 <strong>서브픽셀만큼 흔들고(jitter)</strong>, 그 결과를
        이전 프레임의 누적값과 지수이동평균 <code>c ← α·현재 + (1−α)·history</code>로 섞습니다.
        한 프레임만 보면 여전히 표본이 하나뿐이라 거칠지만, 프레임이 쌓이면 표본들이 픽셀 면적을
        고르게 덮어 경계가 정답 회색조로 <em>수렴</em>합니다 — 시간축 슈퍼샘플링이죠. α를 키우면 빨리
        반응하지만 덜 수렴하고, 줄이면 더 매끈하지만 느리게 따라옵니다. 단, 장면이 움직이면 history가
        엉뚱한 표면을 가리켜 잔상(ghosting)이 생기는데, 그걸 막는 게 모션 벡터와 이웃 색 클램프입니다.
      </figcaption>
    </figure>
  );
}
