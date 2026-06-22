import { useEffect, useRef } from 'react';
import { setupCanvas, readTheme, observeTheme, roundRect, drawArrow } from './tc2d';

// ---------------------------------------------------------------------------
// 그림 5 (정적 도식): 하드웨어 디코드 경로 (세로 플로우, 모바일 우선).
//
// 압축 텍스처는 VRAM→L2 캐시까지 "압축된 채로" 흐른다. 셰이더가 샘플할 때 TMU가 필요한 텍셀이
// 든 블록만 즉석에서 디코드한다. 그래서 절감된 대역폭이 VRAM↔칩 구간 내내 유지된다.
// 4단계를 위→아래로 쌓고, 압축/비압축 구간을 색으로 구분한다.
// ---------------------------------------------------------------------------

export default function HardwareDecode() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const run = (): void => {
      const setup = setupCanvas(canvas);
      if (!setup) return;
      const { ctx, w, h } = setup;
      const theme = readTheme(canvas);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = theme.surface;
      ctx.fillRect(0, 0, w, h);

      const steps = [
        { t: 'VRAM', sub: '압축', compressed: true },
        { t: 'L2 캐시', sub: '압축', compressed: true },
        { t: 'TMU', sub: '샘플 시 즉석 디코드', compressed: false, decode: true },
        { t: '셰이더 코어', sub: 'RGBA (비압축)', compressed: false },
      ];
      const n = steps.length;
      const marginX = 16;
      const top = 14;
      const boxW = w - marginX * 2;
      const gap = 18;
      const boxH = (h - top - gap * (n - 1) - 8) / n;

      steps.forEach((s, i) => {
        const x = marginX;
        const y = top + i * (boxH + gap);
        roundRect(ctx, x, y, boxW, boxH, 8);
        ctx.fillStyle = s.compressed ? theme.accent : theme.surface;
        ctx.globalAlpha = s.compressed ? 0.16 : 1;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = s.compressed ? theme.accent : theme.border;
        ctx.lineWidth = s.compressed ? 2 : 1;
        roundRect(ctx, x, y, boxW, boxH, 8);
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = theme.text;
        ctx.font = '600 14px system-ui, sans-serif';
        ctx.fillText(s.t, x + 14, y + boxH / 2 - 8);
        ctx.fillStyle = s.decode ? theme.accent : theme.muted;
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(s.sub, x + 14, y + boxH / 2 + 10);

        // 압축/비압축 배지(오른쪽)
        ctx.textAlign = 'right';
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = s.compressed ? theme.accent : theme.muted;
        ctx.fillText(s.compressed ? '◼ 압축' : '◻ RGBA', x + boxW - 14, y + boxH / 2);

        // 아래 화살표
        if (i < n - 1) {
          const ax = x + boxW / 2;
          drawArrow(ctx, ax, y + boxH + 2, ax, y + boxH + gap - 2, theme.muted, 2);
        }
      });
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(canvas);
    const stop = observeTheme(run);
    return () => {
      ro.disconnect();
      stop();
    };
  }, []);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 340, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 320, display: 'block' }} />
      </div>
      <figcaption>
        압축의 진짜 보상은 디스크 용량이 아니라 <strong>대역폭</strong>입니다. 압축 텍스처는 VRAM에서 L2
        캐시까지 <strong>압축된 채로</strong> 이동합니다(위 두 칸, 파랑) — 그래서 메모리 버스를 지나는
        바이트 수가 그대로 줄어듭니다. 셰이더가 한 텍셀을 샘플하는 순간에만,{' '}
        <strong>텍스처 유닛(TMU)</strong>이 그 텍셀이 속한 4×4 블록만 골라 즉석에서 RGBA로 디코드합니다.
        디코드는 칩 깊숙한 고정 기능 하드웨어에서 거의 공짜로 일어나고, 그 결과(비압축 RGBA)는 TMU 바로
        옆 셰이더 코어로만 짧게 흐릅니다. 즉 비싼 구간(메모리↔칩)은 내내 압축이고, 비압축은 가장 짧은
        마지막 구간뿐입니다. 이것이 ‘CPU에서 풀어 VRAM에 비압축으로 올리는’ 범용 압축(PNG/zip)과
        결정적으로 다른 점입니다.
      </figcaption>
    </figure>
  );
}
