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

// 한 캐시라인 = 64B = int(4B) 16개. stride=1과 stride=16을 비교한다.
// 핵심: stride 1~16은 "건드리는 라인 수"가 같아서 미스 수도 같다(거의 같은 속도).
const ELEMS = 16; // 한 라인 안의 int 개수
const LINES = 4; // 보여줄 라인 수

function drawRow(
  ctx: CanvasRenderingContext2D,
  col: ReturnType<typeof readColors>,
  x0: number,
  y0: number,
  cell: number,
  stride: number,
  title: string,
  cssW: number,
) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = col.text;
  ctx.fillText(title, x0, y0 - 8);

  let touchedLines = 0;
  for (let line = 0; line < LINES; line++) {
    const lx = x0 + line * (ELEMS * cell + 10);
    let lineTouched = false;
    for (let e = 0; e < ELEMS; e++) {
      const idx = line * ELEMS + e;
      const accessed = idx % stride === 0;
      if (accessed) lineTouched = true;
      const x = lx + e * cell;
      ctx.fillStyle = accessed ? col.accent : col.surface;
      ctx.strokeStyle = col.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x, y0, cell - 1, cell - 1);
      ctx.fill();
      ctx.stroke();
    }
    if (lineTouched) touchedLines++;
    // 라인 외곽(64B 묶음 강조)
    ctx.strokeStyle = lineTouched ? col.accent : col.muted;
    ctx.lineWidth = lineTouched ? 2 : 1;
    ctx.beginPath();
    ctx.rect(lx - 2, y0 - 2, ELEMS * cell + 2, cell + 2);
    ctx.stroke();
  }
  // 미스 수 주석
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = col.muted;
  ctx.textAlign = 'right';
  ctx.fillText(`라인 ${touchedLines}/${LINES}개 → 미스 ${touchedLines}회`, cssW - 6, y0 + cell + 16);
}

/**
 * 캐시라인 stride 실험(정적). 위: stride=1(전부 읽기), 아래: stride=16(라인당 1개).
 * 둘 다 "건드린 라인 수"가 다르면 미스 수가 다르다 — stride를 1→16으로 키워도
 * 라인을 모두 건드리는 한 미스 수가 같다는 게 핵심(여기선 1 vs 16의 양 끝을 보여줌).
 */
export default function CacheLineStride() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 560;
      const cssH = 250;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const x0 = 14;
      const usable = cssW - x0 * 2;
      const cell = Math.max(8, Math.floor((usable - (LINES - 1) * 10) / (ELEMS * LINES)));

      drawRow(ctx, col, x0, 50, cell, 1, 'stride 1 — 모든 원소', cssW);
      drawRow(ctx, col, x0, 150, cell, ELEMS, 'stride 16 — 라인당 1개', cssW);

      // 범례
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = col.accent;
      ctx.fillRect(x0, cssH - 18, 12, 12);
      ctx.fillStyle = col.muted;
      ctx.fillText('접근한 원소 · 굵은 테두리 = 캐시라인(64B = int 16개)', x0 + 18, cssH - 8);
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
        캐시는 byte가 아니라 <strong>라인(64B) 단위</strong>로 메모리를 가져옵니다. 위는 stride 1,
        아래는 stride 16입니다. stride 16은 라인마다 1개만 읽지만, <strong>건드린 라인은 똑같이
        4개</strong>라서 캐시 미스 수도 똑같습니다. 즉 stride를 1에서 16까지 키워도 같은 라인들을
        모두 건드리는 한 실행 시간은 거의 변하지 않습니다(Ostrovsky, "Gallery of Processor Cache
        Effects", 예제 1). stride가 16을 넘어 라인을 건너뛰기 시작해야 비로소 빨라집니다.
      </figcaption>
    </figure>
  );
}
