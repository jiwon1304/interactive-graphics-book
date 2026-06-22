import { useEffect, useRef, useState } from 'react';
import { ControlPanel, SelectControl } from '../../controls';
import type { SelectOption } from '../../controls';

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

type Combiner = 'passthrough' | 'override' | 'min' | 'max' | 'sum';

const OPS: ReadonlyArray<SelectOption<Combiner>> = [
  { value: 'passthrough', label: 'passthrough (A)' },
  { value: 'override', label: 'override (B)' },
  { value: 'min', label: 'min' },
  { value: 'max', label: 'max' },
  { value: 'sum', label: 'sum (saturate)' },
];

// rate를 (가로 log2, 세로 log2)로. 1x1=(0,0), 2x2=(1,1), 4x4=(2,2) ...
function rateLabel(cx: number, cy: number): string {
  const f = (n: number) => (1 << n).toString();
  return `${f(cx)}×${f(cy)}`;
}

function combine(op: Combiner, a: [number, number], b: [number, number]): [number, number] {
  const clamp = (n: number) => Math.max(0, Math.min(2, n));
  switch (op) {
    case 'passthrough':
      return a;
    case 'override':
      return b;
    case 'min': // "더 곱게" = 더 작은 rate = 더 작은 축값
      return [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
    case 'max': // "더 거칠게"
      return [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
    case 'sum':
      return [clamp(a[0] + b[0]), clamp(a[1] + b[1])];
  }
}

/**
 * D3D12 VRS: shading rate의 세 source(per-draw → per-primitive → screen-space image)가
 * 두 combiner를 거쳐 최종 rate가 정해지는 과정. combiner op를 바꿔 결과가 어떻게 합쳐지는지 본다.
 * 정적 다이어그램 + op 선택(과정: 두 단계 결합).
 */
export default function Combiners() {
  const ref = useRef<HTMLCanvasElement>(null);
  // 데모용 고정 입력값(대표값). per-draw=2x1, per-primitive=1x2, image=2x2
  const perDraw: [number, number] = [1, 0]; // 2x1
  const perPrim: [number, number] = [0, 1]; // 1x2
  const image: [number, number] = [1, 1]; // 2x2
  const [op1, setOp1] = useState<Combiner>('max');
  const [op2, setOp2] = useState<Combiner>('override');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 460;
      const cssH = 250;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const stage1 = combine(op1, perDraw, perPrim);
      const finalR = combine(op2, stage1, image);

      const box = (
        x: number,
        y: number,
        w: number,
        h: number,
        title: string,
        sub: string,
        highlight = false,
      ) => {
        ctx.fillStyle = highlight ? col.accent : col.surface;
        ctx.strokeStyle = highlight ? col.accent : col.border;
        ctx.lineWidth = highlight ? 2 : 1;
        const r = 8;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = highlight ? col.surface : col.text;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.fillText(title, x + 10, y + 18);
        ctx.fillStyle = highlight ? col.surface : col.muted;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(sub, x + 10, y + 34);
      };

      const arrow = (x1: number, y1: number, x2: number, y2: number) => {
        ctx.strokeStyle = col.muted;
        ctx.fillStyle = col.muted;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const a = Math.atan2(y2 - y1, x2 - x1);
        const hs = 6;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - hs * Math.cos(a - 0.4), y2 - hs * Math.sin(a - 0.4));
        ctx.lineTo(x2 - hs * Math.cos(a + 0.4), y2 - hs * Math.sin(a + 0.4));
        ctx.closePath();
        ctx.fill();
      };

      const opBadge = (x: number, y: number, label: string) => {
        ctx.fillStyle = col.text;
        ctx.beginPath();
        ctx.arc(x, y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col.surface;
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      };

      const bw = 116;
      const bh = 44;
      const colX = 12;
      // 좌측 세로로 세 source.
      box(colX, 18, bw, bh, 'per-draw', `RSSetShadingRate · ${rateLabel(perDraw[0], perDraw[1])}`);
      box(colX, 100, bw, bh, 'per-primitive', `SV_ShadingRate · ${rateLabel(perPrim[0], perPrim[1])}`);
      box(colX, 182, bw, bh, 'screen image', `VRS surface · ${rateLabel(image[0], image[1])}`);

      // combiner 1: draw ⊕ primitive
      const c1x = colX + bw + 64;
      opBadge(c1x, 62, op1.slice(0, 3));
      arrow(colX + bw, 40, c1x - 16, 56);
      arrow(colX + bw, 122, c1x - 16, 68);
      box(c1x + 22, 40, bw, bh, 'stage 1', rateLabel(stage1[0], stage1[1]));

      // combiner 2: stage1 ⊕ image
      const c2x = c1x + 22 + bw + 48;
      opBadge(c2x, 130, op2.slice(0, 3));
      arrow(c1x + 22 + bw, 62, c2x - 16, 124);
      arrow(colX + bw, 204, c2x - 16, 138);
      box(c2x + 22, 108, bw, bh, '최종 rate', rateLabel(finalR[0], finalR[1]), true);
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
  }, [op1, op2]);

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
        <SelectControl label="combiner 1 (draw ⊕ prim)" value={op1} options={OPS} onChange={setOp1} />
        <SelectControl label="combiner 2 (⊕ image)" value={op2} options={OPS} onChange={setOp2} />
      </ControlPanel>
      <figcaption>
        D3D12 VRS는 shading rate를 <strong>세 곳</strong>에서 받습니다: draw 전체에 거는 per-draw,
        정점에서 픽 셰이더로 내보내는 per-primitive(<code>SV_ShadingRate</code>), 그리고 화면에 깐
        저해상도 <strong>VRS surface</strong>(타일 하나가 화면의 작은 영역의 rate를 정함). 이 셋이
        두 개의 <strong>combiner</strong>로 차례차례 합쳐져 최종 rate가 됩니다. op를 바꿔 보세요 —
        <code>max</code>는 "더 거친 쪽 채택"(가장 절약), <code>min</code>은 "더 고운 쪽",
        <code>override</code>는 뒤쪽 source가 앞을 덮어씁니다.
      </figcaption>
    </figure>
  );
}
