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

type Combiner = 'passthrough' | 'override' | 'min' | 'max' | 'sum';

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
    case 'min':
      return [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
    case 'max':
      return [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
    case 'sum':
      return [clamp(a[0] + b[0]), clamp(a[1] + b[1])];
  }
}

/**
 * D3D12 VRS 정적 도식: shading rate의 세 source(per-draw → per-primitive → screen-space image)가
 * 두 combiner를 거쳐 최종 rate가 정해지는 과정을 위→아래 플로우로 보여준다.
 * 대표 조합(combiner1 = max, combiner2 = override)을 정지 상태로 그린다.
 */
const W = 360;
const H = 420;

// 고정 입력값(대표값).
const perDraw: [number, number] = [1, 0]; // 2x1
const perPrim: [number, number] = [0, 1]; // 1x2
const image: [number, number] = [1, 1]; // 2x2
const OP1: Combiner = 'max';
const OP2: Combiner = 'override';

export default function Combiners() {
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

      const stage1 = combine(OP1, perDraw, perPrim);
      const finalR = combine(OP2, stage1, image);

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
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(title, x + 12, y + 22);
        ctx.fillStyle = highlight ? col.surface : col.muted;
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(sub, x + 12, y + 40);
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
        const hs = 7;
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
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col.surface;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      };

      const bw = 200;
      const bh = 52;
      const cx = (W - bw) / 2;

      // 1행: per-draw + per-primitive (나란히 좁게)
      const halfW = (bw - 14) / 2;
      box(cx, 14, halfW, bh, 'per-draw', rateLabel(perDraw[0], perDraw[1]));
      box(cx + halfW + 14, 14, halfW, bh, 'per-prim', rateLabel(perPrim[0], perPrim[1]));

      // combiner 1 badge
      const c1y = 14 + bh + 36;
      arrow(cx + halfW / 2, 14 + bh, cx + bw / 2 - 4, c1y - 18);
      arrow(cx + halfW + 14 + halfW / 2, 14 + bh, cx + bw / 2 + 4, c1y - 18);
      opBadge(cx + bw / 2, c1y, OP1);

      // stage 1
      const s1y = c1y + 24;
      arrow(cx + bw / 2, c1y + 18, cx + bw / 2, s1y);
      box(cx, s1y, bw, bh, 'stage 1', `draw ⊕ prim = ${rateLabel(stage1[0], stage1[1])}`);

      // screen image source
      const imgY = s1y + bh + 18;
      box(cx, imgY, bw, bh, 'screen image', `VRS surface · ${rateLabel(image[0], image[1])}`);

      // combiner 2 badge
      const c2y = imgY + bh + 34;
      arrow(cx + bw / 2 - 40, imgY + bh, cx + bw / 2 - 4, c2y - 18);
      // stage1 → combiner2 (옆으로 돌아 들어오는 흐름을 짧은 화살표로)
      opBadge(cx + bw / 2, c2y, OP2);

      // 최종 rate
      const fy = c2y + 24;
      arrow(cx + bw / 2, c2y + 18, cx + bw / 2, fy);
      box(cx, fy, bw, bh, '최종 rate', rateLabel(finalR[0], finalR[1]), true);

      // combiner op 라벨(범례).
      ctx.fillStyle = col.muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(`combiner1 = max,  combiner2 = override`, cx, fy + bh + 22);
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
        D3D12 VRS는 shading rate를 <strong>세 곳</strong>에서 받습니다: draw 전체에 거는 per-draw,
        정점에서 픽셀 셰이더로 내보내는 per-primitive(<code>SV_ShadingRate</code>), 그리고 화면에 깐
        저해상도 <strong>VRS surface</strong>(타일 하나가 화면 작은 영역의 rate를 정함). 이 셋이 두
        개의 <strong>combiner</strong>로 차례차례 합쳐져 최종 rate가 됩니다. 그림은 대표 조합 —
        combiner1 = <code>max</code>(2×1, 1×2를 합쳐 더 거친 2×2), combiner2 = <code>override</code>
        (VRS surface가 앞 결과를 덮어 최종 2×2)입니다. 참고로 <code>max</code>는 "더 거친 쪽
        채택"(가장 절약), <code>min</code>은 "더 고운 쪽"입니다.
      </figcaption>
    </figure>
  );
}
