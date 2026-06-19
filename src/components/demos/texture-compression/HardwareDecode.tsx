import { useEffect, useRef } from 'react';
import { setupCanvas, readTheme, observeTheme, roundRect, drawArrow } from './tc2d';

// ---------------------------------------------------------------------------
// 그림 5 (정적 도식): 하드웨어 디코드 경로.
//
// 압축 텍스처는 VRAM→L2 캐시까지 "압축된 채로" 흐른다. 셰이더가 샘플할 때
// 텍스처 유닛(TMU)이 필요한 텍셀이 든 블록만 즉석에서 디코드한다. 그래서 절감된
// 대역폭이 VRAM↔칩 구간 내내 유지된다(메모리에서도, 캐시에서도 작다).
// 비-렌더링 데이터플로라 라이브 조작 대신 라벨 달린 한 장의 정지 화면으로 가르친다.
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

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';

      const boxH = 56;
      const cy = 56;
      // 가로로 4개 단계 박스: VRAM → L2 → TMU(디코드) → 셰이더 코어
      const labels = ['VRAM\n(압축)', 'L2 캐시\n(압축)', 'TMU\n디코드', '셰이더 코어\n(RGBA)'];
      const compressed = [true, true, false, false]; // 디코드는 TMU에서 일어남
      const n = labels.length;
      const margin = 14;
      const gap = 30;
      const boxW = (w - margin * 2 - gap * (n - 1)) / n;

      const xs: number[] = [];
      for (let i = 0; i < n; i++) xs.push(margin + i * (boxW + gap));

      // 단계 사이 화살표 + 대역폭 라벨
      for (let i = 0; i < n - 1; i++) {
        const x0 = xs[i] + boxW;
        const x1 = xs[i + 1];
        drawArrow(ctx, x0 + 2, cy, x1 - 2, cy, theme.muted, 2);
      }

      // 박스 그리기
      for (let i = 0; i < n; i++) {
        const x = xs[i];
        roundRect(ctx, x, cy - boxH / 2, boxW, boxH, 8);
        ctx.fillStyle = compressed[i] ? theme.accent : theme.surface;
        ctx.globalAlpha = compressed[i] ? 0.16 : 1;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = compressed[i] ? theme.accent : theme.border;
        ctx.lineWidth = compressed[i] ? 2 : 1;
        roundRect(ctx, x, cy - boxH / 2, boxW, boxH, 8);
        ctx.stroke();

        ctx.fillStyle = theme.text;
        ctx.font = '600 12px system-ui, sans-serif';
        const lines = labels[i].split('\n');
        lines.forEach((ln, k) => {
          ctx.fillText(ln, x + boxW / 2, cy - 8 + k * 16);
        });
      }

      // "여기서 디코드" 표시(TMU 위)
      ctx.fillStyle = theme.accent;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText('샘플 시 즉석 디코드', xs[2] + boxW / 2, cy - boxH / 2 - 14);

      // 하단: 압축 구간 vs 비압축 구간 띠
      const bandY = cy + boxH / 2 + 30;
      ctx.textAlign = 'left';
      ctx.font = '11px system-ui, sans-serif';

      // 압축 구간 막대(VRAM→L2→TMU 입구)
      const compStart = xs[0];
      const compEnd = xs[2] + boxW / 2;
      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = 0.18;
      roundRect(ctx, compStart, bandY, compEnd - compStart, 16, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.accent;
      ctx.fillText('압축 상태로 이동 — 대역폭 절감 유지', compStart + 6, bandY + 8);

      // 비압축 구간
      const decStart = compEnd;
      const decEnd = xs[3] + boxW;
      ctx.fillStyle = theme.muted;
      ctx.globalAlpha = 0.14;
      roundRect(ctx, decStart, bandY, decEnd - decStart, 16, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'right';
      ctx.fillText('디코드 후 RGBA', decEnd - 6, bandY + 8);
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
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 640, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 150, display: 'block' }} />
      </div>
      <figcaption>
        압축의 진짜 보상은 디스크 용량이 아니라 <strong>대역폭</strong>이다. 압축 텍스처는
        VRAM에서 L2 캐시까지 <strong>압축된 채로</strong> 이동한다(파란 구간) — 그래서 메모리
        버스를 지나는 바이트 수가 그대로 줄어든다. 셰이더가 한 텍셀을 샘플하는 순간에만,
        <strong> 텍스처 유닛(TMU)</strong>이 그 텍셀이 속한 4×4 블록만 골라 즉석에서 RGBA로
        디코드한다. 디코드는 칩 깊숙한 고정 기능 하드웨어에서 거의 공짜로 일어나고, 그
        결과(비압축 RGBA)는 TMU 바로 옆 셰이더 코어로만 짧게 흐른다. 즉 비싼 구간(메모리
        ↔칩)은 내내 압축이고, 비압축은 가장 짧은 마지막 구간뿐이다. 이것이 ‘CPU에서 풀어
        VRAM에 비압축으로 올리는’ 범용 압축(PNG/zip)과 결정적으로 다른 점이다.
      </figcaption>
    </figure>
  );
}
