import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { readColors, setupCanvas } from './canvas2d';

// 1D 휘도 신호로 블룸 파이프라인을 보인다(과정: 추출 → 블러 → 합성).
// 입력: 두 개의 밝은 막대(하나는 임계 아래, 하나는 한참 위)가 섞인 신호.
function inputSignal(t: number): number {
  // t in [0,1]. 두 봉우리: 약한 봉(0.35, 높이 0.9), 강한 봉(0.7, 높이 4.0)
  const peak = (c: number, w: number, h: number) => h * Math.exp(-((t - c) * (t - c)) / (2 * w * w));
  const base = 0.12;
  return base + peak(0.3, 0.04, 0.9) + peak(0.68, 0.05, 4.0);
}

// 가우시안 블러(1D, 분리형). sigma는 화면 비율.
function gaussianBlur(src: number[], sigma: number): number[] {
  const n = src.length;
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel: number[] = [];
  let sum = 0;
  for (let k = -radius; k <= radius; k++) {
    const v = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(v);
    sum += v;
  }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= sum;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = Math.min(n - 1, Math.max(0, i + k));
      acc += src[j] * kernel[k + radius];
    }
    out[i] = acc;
  }
  return out;
}

/**
 * 위젯 — 블룸 파이프라인(1D 도식, 인터랙티브).
 * 외부 postprocessing 패키지 없이 개념을 직접 보인다:
 * (1) bright-pass: 임계 초과분만 추출, (2) blur: 가우시안으로 번짐, (3) composite: 원본 + 세기×블러.
 * 과정 강조: 임계/번짐/세기를 바꾸면 각 단계 신호가 어떻게 바뀌고 최종에 어떻게 더해지는지 본다.
 */
export default function BloomDiagram() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [threshold, setThreshold] = useState(1.0);
  const [sigma, setSigma] = useState(10);
  const [intensity, setIntensity] = useState(0.8);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const s = setupCanvas(canvas, 420);
      if (!s) return;
      const { ctx, w, h } = s;
      const col = readColors(canvas);
      ctx.clearRect(0, 0, w, h);

      const N = Math.max(80, Math.floor(w));
      const input: number[] = [];
      for (let i = 0; i < N; i++) input.push(inputSignal(i / (N - 1)));
      // bright pass: 임계 초과분(soft하지 않고 hard threshold로 명확히)
      const bright = input.map((v) => Math.max(0, v - threshold));
      const blurred = gaussianBlur(bright, sigma * (N / w));
      const composite = input.map((v, i) => v + intensity * blurred[i]);

      // 4개 패널을 세로로 스택(모바일: 위→아래)
      const labels = ['① 입력 (HDR 휘도)', '② bright-pass (L−임계)', '③ blur', '④ composite = 입력 + 세기×blur'];
      const series = [input, bright, blurred, composite];
      const colors = [col.text, col.accent, col.accent, col.text];
      const panelGap = 10;
      const panelH = (h - panelGap * 3 - 8) / 4;
      const yMax = 4.5; // 공통 세로 스케일

      for (let p = 0; p < 4; p++) {
        const top = 4 + p * (panelH + panelGap);
        const padL = 8;
        const plotW = w - padL - 8;
        const baseY = top + panelH - 16;
        const plotH = panelH - 22;

        // 패널 배경/테두리
        ctx.fillStyle = col.surface;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(padL, top, plotW, panelH);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(padL, top, plotW, panelH);

        // 임계선(입력·bright 패널에)
        if (p === 0) {
          const ty = baseY - (threshold / yMax) * plotH;
          ctx.strokeStyle = col.muted;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(padL, ty);
          ctx.lineTo(padL + plotW, ty);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = col.muted;
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('임계', padL + plotW - 4, ty - 3);
        }
        // 출력=1 가이드(composite/입력)
        if (p === 0 || p === 3) {
          const oy = baseY - (1 / yMax) * plotH;
          ctx.strokeStyle = col.muted;
          ctx.globalAlpha = 0.4;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(padL, oy);
          ctx.lineTo(padL + plotW, oy);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        // 신호: 채워진 영역 + 선
        ctx.beginPath();
        ctx.moveTo(padL, baseY);
        for (let i = 0; i < N; i++) {
          const px = padL + (i / (N - 1)) * plotW;
          const py = baseY - (Math.min(yMax, series[p][i]) / yMax) * plotH;
          ctx.lineTo(px, py);
        }
        ctx.lineTo(padL + plotW, baseY);
        ctx.closePath();
        ctx.fillStyle = colors[p];
        ctx.globalAlpha = 0.18;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors[p];
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const px = padL + (i / (N - 1)) * plotW;
          const py = baseY - (Math.min(yMax, series[p][i]) / yMax) * plotH;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // 라벨
        ctx.fillStyle = col.text;
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(labels[p], padL + 6, top + 14);
      }
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
  }, [threshold, sigma, intensity]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        style={{ width: '100%', height: 'auto', maxWidth: 380, borderRadius: 8, border: '1px solid var(--border)' }}
      />
      <ControlPanel>
        <Slider label="임계 (threshold)" value={threshold} min={0} max={3} step={0.05} onChange={setThreshold} format={(v) => v.toFixed(2)} />
        <Slider label="번짐 (blur σ)" value={sigma} min={2} max={30} step={1} onChange={setSigma} format={(v) => `${v}px`} />
        <Slider label="세기 (intensity)" value={intensity} min={0} max={2} step={0.05} onChange={setIntensity} format={(v) => v.toFixed(2)} />
      </ControlPanel>
      <figcaption>
        블룸은 세 단계입니다. <strong>① 입력</strong> HDR 휘도에서 <strong>② 임계를 넘는 부분만</strong>{' '}
        빼내고(약한 봉우리는 임계 아래라 추출되지 않습니다 — 임계를 내려 보세요), <strong>③ 가우시안으로
        번지게</strong> 한 뒤, <strong>④ 원본에 세기를 곱해 더합니다.</strong> 임계가 곧 "무엇이 빛나는가",
        세기가 "얼마나 번지는가"를 정합니다. 합성은 톤매핑 <em>전</em> 선형 HDR에서 하는 것이 맞습니다 —
        그래야 번진 밝기까지 함께 톤매핑 곡선에 들어갑니다.
      </figcaption>
    </figure>
  );
}
