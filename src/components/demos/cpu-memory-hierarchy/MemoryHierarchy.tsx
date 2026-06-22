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

// 대표값(Intel Skylake/7-cpu 측정 + Agner Fog 교차확인). cycle은 환경 의존 → 대표값.
type Level = {
  name: string;
  size: string;
  cyc: string; // 대략 cycle
  w: number; // 막대 폭(상대) — 위가 좁고(빠름/작음) 아래가 넓다(느림/큼)
};

const LEVELS: Level[] = [
  { name: 'Register', size: '~수백 B', cyc: '<1', w: 0.16 },
  { name: 'L1d', size: '32–48 KB', cyc: '~4', w: 0.3 },
  { name: 'L2', size: '0.5–2 MB', cyc: '~12', w: 0.5 },
  { name: 'L3 (공유)', size: '수십 MB', cyc: '~40', w: 0.74 },
  { name: 'DRAM', size: '수 GB+', cyc: '~200+', w: 1.0 },
];

/**
 * 메모리 계층 피라미드(정적). 위로 갈수록 빠르고 작다.
 * 막대 폭 = 용량의 크기(대수적 직관), 오른쪽에 대략 cycle 지연.
 */
export default function MemoryHierarchy() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 520;
      const cssH = 320;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.font = '13px system-ui, sans-serif';
      ctx.textBaseline = 'middle';

      const padL = 16;
      const padTop = 30;
      const rowH = 46;
      const gap = 10;
      const maxBar = cssW * 0.5; // 막대 최대 폭
      const cx = padL + maxBar / 2;

      // 헤더
      ctx.fillStyle = col.muted;
      ctx.textAlign = 'left';
      ctx.fillText('빠르고 작다  ↑', padL, 14);
      ctx.textAlign = 'right';
      ctx.fillText('지연(≈cycle)', cssW - 14, 14);

      LEVELS.forEach((lv, i) => {
        const y = padTop + i * (rowH + gap);
        const bw = Math.max(40, lv.w * maxBar);
        const x = cx - bw / 2;
        // 막대
        ctx.fillStyle = i === 0 ? col.accent : col.surface;
        ctx.strokeStyle = col.accent;
        ctx.lineWidth = i === 0 ? 0 : 1.8;
        ctx.beginPath();
        ctx.rect(x, y, bw, rowH);
        ctx.fill();
        if (i !== 0) ctx.stroke();
        // 라벨(막대 안)
        ctx.fillStyle = i === 0 ? col.surface : col.text;
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(lv.name, cx, y + rowH / 2 - 8);
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = i === 0 ? col.surface : col.muted;
        ctx.fillText(lv.size, cx, y + rowH / 2 + 9);
        // cycle(오른쪽)
        ctx.textAlign = 'right';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillStyle = col.text;
        ctx.fillText(lv.cyc, cssW - 14, y + rowH / 2);
      });

      // 아래 화살표 텍스트
      ctx.fillStyle = col.muted;
      ctx.textAlign = 'left';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('느리고 크다  ↓', padL, cssH - 12);
    };

    draw();
    const ro = new ResizeObserver(draw);
    if (ref.current) ro.observe(ref.current);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <figure className="demo">
      <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block' }} />
      <figcaption>
        메모리 계층. 위로 갈수록 빠르지만 작고, 아래로 갈수록 크지만 느립니다. 오른쪽 숫자는
        대략적인 접근 지연(cycle)으로, Intel Skylake 측정값(7-cpu.com)에 Agner Fog 표를
        교차확인한 <strong>대표값</strong>입니다. 절대 cycle 수는 마이크로아키텍처·클럭·작업셋에
        따라 달라집니다. 핵심은 한 칸 내려갈 때마다 지연이 대략 <strong>한 자릿수씩</strong>
        커진다는 점입니다 — 그래서 데이터를 위쪽에 붙들어 두는 것이 성능의 전부입니다.
      </figcaption>
    </figure>
  );
}
