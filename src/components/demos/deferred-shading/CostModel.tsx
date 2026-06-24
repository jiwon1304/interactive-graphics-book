import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';

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

/**
 * 위젯 2 — 포워드 vs 디퍼드 셰이딩 비용 모델(교육용 단순 모델).
 * 광원 수 N을 슬라이더로 키우며 두 곡선을 비교한다.
 *   forward  ≈ (셰이딩되는 프래그먼트) × N   (광원마다 다시 셰이딩)
 *   deferred ≈ (G-buffer 기록) + (화면 픽셀) × N  (지오메트리 1회 + 라이팅 N)
 * "과정": 비용이 어디서 발생하는지(곱이냐 합이냐)를 N을 움직이며 직접 본다.
 */
export default function CostModel() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [lights, setLights] = useState(8);
  const [overdraw, setOverdraw] = useState(2.5); // 포워드의 오버드로 배수(가려진 픽셀도 셰이딩)

  const draw = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const col = readColors(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 360;
    const cssH = 300;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const padL = 40;
    const padR = 14;
    const padT = 28;
    const padB = 40;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;
    const maxN = 64;

    // 비용 모델(상대 단위). 화면 픽셀 = 1.0, 포워드는 overdraw배 만큼 더 셰이딩.
    const gbufferCost = 1.0 * overdraw * 0.5; // 1차 패스(라이팅 없이 기록) — 가볍게
    const forwardCost = (n: number) => overdraw * (0.2 + n); // 가려진 픽셀까지 × N
    const deferredCost = (n: number) => gbufferCost + (0.2 + n); // 화면 픽셀 × N (한 번씩만)

    const maxCost = Math.max(forwardCost(maxN), deferredCost(maxN));
    const x = (n: number) => padL + (n / maxN) * plotW;
    const y = (c: number) => padT + plotH - (c / maxCost) * plotH;

    // 축
    ctx.strokeStyle = col.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    ctx.fillStyle = col.muted;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('광원 수 N →', padL + plotW / 2, cssH - 10);
    ctx.save();
    ctx.translate(13, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('셰이딩 비용 →', 0, 0);
    ctx.restore();

    // 곡선 그리기
    const plot = (f: (n: number) => number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let n = 1; n <= maxN; n++) {
        const px = x(n);
        const py = y(f(n));
        if (n === 1) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };
    const forwardColor = '#e0734f';
    const deferredColor = col.accent;
    plot(forwardCost, forwardColor);
    plot(deferredCost, deferredColor);

    // 현재 N 마커(세로선 + 두 점)
    const nx = x(lights);
    ctx.strokeStyle = col.muted;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(nx, padT);
    ctx.lineTo(nx, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    const dot = (c: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(nx, y(c), 4.5, 0, Math.PI * 2);
      ctx.fill();
    };
    dot(forwardCost(lights), forwardColor);
    dot(deferredCost(lights), deferredColor);

    // 범례
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = forwardColor;
    ctx.fillText('forward', padL + 8, padT + 4);
    ctx.fillStyle = deferredColor;
    ctx.fillText('deferred', padL + 8, padT + 22);

    // N에서의 배수 비교
    const ratio = forwardCost(lights) / deferredCost(lights);
    ctx.fillStyle = col.text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`N=${lights}: forward ≈ ${ratio.toFixed(1)}× deferred`, padL + plotW, padT + 4);
    ctx.textAlign = 'left';
  };

  useEffect(() => {
    const redraw = () => draw(ref.current);
    redraw();
    const ro = new ResizeObserver(redraw);
    if (ref.current) ro.observe(ref.current);
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lights, overdraw]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        style={{
          width: '100%',
          maxWidth: 400,
          borderRadius: 10,
          border: '1px solid var(--border)',
          display: 'block',
        }}
      />
      <ControlPanel>
        <Slider label="광원 수 N" value={lights} min={1} max={64} step={1} onChange={setLights} />
        <Slider
          label="오버드로 배수"
          value={overdraw}
          min={1}
          max={5}
          step={0.1}
          onChange={setOverdraw}
          format={(v) => `${v.toFixed(1)}×`}
        />
      </ControlPanel>
      <figcaption>
        교육용 단순 비용 모델입니다. 포워드는 각 광원마다 (가려질 픽셀까지) 다시 셰이딩하므로
        비용이 대략 <em>화면 픽셀 × N</em>으로, 게다가 오버드로 배수만큼 곱해져 가파르게 오릅니다.
        디퍼드는 지오메트리를 한 번만 기록(1차 패스)한 뒤 <em>보이는 화면 픽셀에 대해서만</em> 광원
        N개를 더하므로 기울기가 완만하고 오버드로에도 둔감합니다. 광원이 많아질수록 격차가
        벌어지는 게 디퍼드의 존재 이유입니다. (실제 포워드 엔진은 light culling·early-Z로 이
        상한을 크게 낮춥니다 — 이 곡선은 순진한 상한이라고 보세요.)
      </figcaption>
    </figure>
  );
}
