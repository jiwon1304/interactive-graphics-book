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

// 분기 flush: 분기가 EX에서 "사실은 반대 방향"으로 판명되면, 그 사이 잘못된 경로로
// 들어온 명령들을 전부 버린다(flush). 깊은 파이프일수록 버릴 게 많다.
// 위: 얕은 파이프(5단계, 분기 EX 해소 → 잘못 가져온 2~3개 flush)
// 아래: 깊은 파이프(많은 단계 → 십수 개 flush)를 막대로 대비.

export default function BranchFlush() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 380;
      const cssH = 230;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.textBaseline = 'middle';

      const x0 = 12;
      const lanes = [
        { title: '얕은 파이프 (~5단계)', total: 5, flush: 2, y: 40 },
        { title: '깊은 파이프 (~16단계)', total: 16, flush: 14, y: 130 },
      ];
      const barW = cssW - x0 * 2;
      const barH = 36;

      lanes.forEach((lane) => {
        ctx.fillStyle = col.text;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(lane.title, x0, lane.y - 14);

        const cellW = barW / lane.total;
        for (let k = 0; k < lane.total; k++) {
          const x = x0 + k * cellW;
          const flushed = k >= lane.total - lane.flush;
          if (flushed) {
            ctx.fillStyle = '#e0564b';
            ctx.globalAlpha = 0.55;
            ctx.fillRect(x + 0.5, lane.y, cellW - 1, barH);
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = col.accent;
            ctx.globalAlpha = 0.4;
            ctx.fillRect(x + 0.5, lane.y, cellW - 1, barH);
            ctx.globalAlpha = 1;
          }
          ctx.strokeStyle = col.border;
          ctx.lineWidth = 0.8;
          ctx.strokeRect(x + 0.5, lane.y, cellW - 1, barH);
        }
        // 외곽
        ctx.strokeStyle = col.text;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x0, lane.y, barW, barH);

        // 라벨
        ctx.fillStyle = col.muted;
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('분기 해소', x0, lane.y + barH + 14);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#c0392b';
        ctx.fillText(`flush ${lane.flush}개`, x0 + barW, lane.y + barH + 14);
      });

      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('파랑=유효 / 빨강=잘못된 경로라 버려짐. 깊을수록 버릴 게 많다', cssW / 2, cssH - 12);
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
      <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block', maxWidth: 400, margin: '0 auto' }} />
      <figcaption>
        분기 방향을 잘못 짚으면, 그 분기가 해소될 때까지 <strong>잘못된 경로로 가져온 명령을 전부 버립니다
        (flush)</strong>. 그래서 misprediction 비용은 곧 <strong>파이프라인 깊이</strong>에 비례합니다 —
        얕은 5단계 파이프는 두어 개만 버리면 되지만, 분기가 한참 뒤에야 해소되는 깊은 파이프(현대 x86은
        보통 미스 페널티 약 15~20 cycle, Agner Fog 측정 범위)는 십수 개를 버려야 합니다. 이것이 다음 장{' '}
        <em>분기 예측</em>이 그토록 절박한 이유입니다.
      </figcaption>
    </figure>
  );
}
