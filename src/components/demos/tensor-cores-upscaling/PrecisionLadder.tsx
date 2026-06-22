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

// [이름, sign, exponent, mantissa, 도입 세대]. INT8은 정수라 exp=0, mantissa=정수비트로 표기.
type Fmt = {
  name: string;
  sign: number;
  exp: number;
  mant: number;
  gen: string;
  note: string;
  integer?: boolean;
};

const FORMATS: Fmt[] = [
  { name: 'FP32', sign: 1, exp: 8, mant: 23, gen: '기준', note: 'CUDA 코어 단정밀도' },
  { name: 'TF32', sign: 1, exp: 8, mant: 10, gen: 'Ampere', note: 'FP32 범위, 가수 축소' },
  { name: 'FP16', sign: 1, exp: 5, mant: 10, gen: 'Volta', note: '입력, FP32 누산' },
  { name: 'BF16', sign: 1, exp: 8, mant: 7, gen: 'Ampere', note: 'FP32와 같은 범위' },
  { name: 'FP8 E4M3', sign: 1, exp: 4, mant: 3, gen: 'Hopper/Ada', note: '정밀 우선' },
  { name: 'FP8 E5M2', sign: 1, exp: 5, mant: 2, gen: 'Hopper/Ada', note: '범위 우선' },
  { name: 'INT8', sign: 1, exp: 0, mant: 7, gen: 'Turing', note: '추론용 정수', integer: true },
];

/**
 * 텐서 코어가 세대별로 더한 수치 포맷의 비트 배치(sign/exp/mantissa)를 한눈에.
 * 정적 다이어그램(draw-once). 포맷이 좁아질수록 칸 수가 줄어 "비트를 줄여 throughput을 산다"가 보임.
 */
export default function PrecisionLadder() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 460;
      const rowH = 34;
      const cssH = 40 + FORMATS.length * rowH + 16;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const labelW = 92;
      const genW = 86;
      const barX = labelW;
      const barMaxW = cssW - labelW - genW - 8;
      const bit = barMaxW / 32; // FP32(32비트) 기준 비트 폭

      // 헤더.
      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('포맷', 4, 24);
      ctx.fillText('sign · exponent · mantissa (비트)', barX, 24);
      ctx.fillText('도입', cssW - genW + 4, 24);

      FORMATS.forEach((f, r) => {
        const y = 40 + r * rowH;
        // 이름.
        ctx.fillStyle = col.text;
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillText(f.name, 4, y + 17);

        // 비트 칸: sign(1) | exp | mantissa.
        let x = barX;
        const seg = (n: number, color: string, alpha: number, txt?: string) => {
          if (n <= 0) return;
          const w = n * bit;
          ctx.fillStyle = color;
          ctx.globalAlpha = alpha;
          ctx.fillRect(x, y, w, 22);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = col.surface;
          ctx.lineWidth = 1;
          // 칸 구분선(촘촘하면 생략).
          if (n <= 12) {
            for (let b = 1; b < n; b++) {
              ctx.beginPath();
              ctx.moveTo(x + b * bit, y);
              ctx.lineTo(x + b * bit, y + 22);
              ctx.stroke();
            }
          }
          ctx.strokeStyle = col.border;
          ctx.strokeRect(x, y, w, 22);
          if (txt && w > 22) {
            ctx.fillStyle = col.surface;
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillText(txt, x + 4, y + 15);
          }
          x += w;
        };
        // sign(빨강 대신 muted), exp(accent), mantissa(text 흐리게)
        seg(f.sign, col.muted, 0.9, 's');
        if (f.integer) {
          seg(f.mant, col.accent, 0.55, 'int7');
        } else {
          seg(f.exp, col.accent, 0.9, `e${f.exp}`);
          seg(f.mant, col.text, 0.35, `m${f.mant}`);
        }
        // 총 비트수.
        const total = f.sign + f.exp + f.mant;
        ctx.fillStyle = col.muted;
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(`${total}b`, x + 6, y + 15);

        // 세대.
        ctx.fillStyle = f.gen === '기준' ? col.muted : col.text;
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(f.gen, cssW - genW + 4, y + 11);
        ctx.fillStyle = col.muted;
        ctx.fillText(f.note, cssW - genW + 4, y + 22);
      });
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
  }, []);

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
      <figcaption>
        텐서 코어가 세대마다 더한 수치 포맷들. 파란 칸이 <strong>exponent</strong>(값의 범위),
        흐린 칸이 <strong>mantissa</strong>(정밀도). 두 갈래가 보입니다: <strong>BF16·TF32</strong>는
        exponent를 FP32만큼(8비트) 유지해 <em>범위</em>를 지키고 mantissa만 깎고, <strong>FP16</strong>은
        반대로 범위를 줄였습니다. <strong>FP8</strong>은 한 발 더 나아가 같은 8비트 안에서도 정밀
        우선(E4M3)과 범위 우선(E5M2)을 갈라 둡니다. <strong>INT8</strong>은 추론용 정수죠. 칸이
        좁아질수록 메모리·연산이 싸지므로, 정밀도를 견디는 워크로드일수록 더 좁은 포맷으로 내려가
        throughput을 삽니다. (세대 도입 시점은 본문 표 참조 — 수치는 NVIDIA 아키텍처 백서 기준.)
      </figcaption>
    </figure>
  );
}
