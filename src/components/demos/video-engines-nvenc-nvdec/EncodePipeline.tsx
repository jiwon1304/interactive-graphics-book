import { useEffect, useRef } from 'react';

// 정적 도식 — 인코드 파이프라인 개요(세로 스택).
// 입력 프레임 → 움직임 추정(ME) → 변환·양자화 → 엔트로피 코딩 → 비트스트림.
// 고정기능 블록 안에서 이 단계들이 하드와이어드로 흐른다.

const W = 320;
const STEPS = [
  { t: '입력 프레임', s: 'VRAM의 렌더 결과' },
  { t: '움직임 추정 (ME)', s: '이전 프레임 대비 변위 — 가장 비쌈' },
  { t: '변환 + 양자화', s: 'DCT류 변환 → 정밀도 줄이기' },
  { t: '엔트로피 코딩', s: 'CABAC/CAVLC — 무손실 압축' },
  { t: '비트스트림', s: 'H.264 / HEVC / AV1 출력' },
];
const boxH = 50;
const gap = 22;
const top = 14;
const H = top + STEPS.length * boxH + (STEPS.length - 1) * gap + 14;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  const bx = 18;
  const bw = W - 36;

  STEPS.forEach((step, i) => {
    const y = top + i * (boxH + gap);
    const first = i === 0;
    const last = i === STEPS.length - 1;
    const col = last ? '#2e9e5b' : i === 1 ? '#e08a2b' : accent;
    ctx.fillStyle = col;
    ctx.globalAlpha = first || last ? 0.2 : 0.13;
    roundRect(ctx, bx, y, bw, boxH, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx, y, bw, boxH, 8);
    ctx.stroke();

    ctx.fillStyle = text;
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(step.t, bx + 14, y + 18);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(step.s, bx + 14, y + 36);

    if (!last) {
      const ax = W / 2;
      const ay1 = y + boxH + 3;
      const ay2 = y + boxH + gap - 3;
      ctx.strokeStyle = text;
      ctx.fillStyle = text;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay1);
      ctx.lineTo(ax, ay2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax, ay2 + 2);
      ctx.lineTo(ax - 5, ay2 - 4);
      ctx.lineTo(ax + 5, ay2 - 4);
      ctx.closePath();
      ctx.fill();
    }
  });
}

export default function EncodePipeline() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const run = () => draw(ctx);
    run();
    const obs = new MutationObserver(run);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas ref={ref} width={W} height={H} style={{ width: '100%', maxWidth: W, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }} />
      </div>
      <figcaption>
        인코드 파이프라인의 큰 줄기입니다. <strong>움직임 추정</strong>(이전 프레임 대비 블록이 어디로
        움직였나)이 가장 비싼 단계라, 고정기능 블록은 바로 이 탐색을 하드와이어로 구현해 전력·지연을
        줄입니다. 변환·양자화에서 화질을 비트레이트와 맞바꾸고, 엔트로피 코딩이 남은 중복을 무손실로
        쥐어짭니다. 단계가 칩에 박혀 있어 빠르지만, 그만큼 SW 인코더가 쓰는 정교한 탐색(많은 B-frame·
        RDO)은 일부 생략됩니다.
      </figcaption>
    </figure>
  );
}
