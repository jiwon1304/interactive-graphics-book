import { useEffect, useRef } from 'react';

// 정적 도식 — TLB 조회 흐름. 가상주소 → L1 DTLB → (miss) L2 STLB → (miss) page walk.
// 두 경로(hit: 빠름 / miss: page walk)를 세로로. 대표 수치는 Skylake 귀속.

const W = 360;
const H = 380;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const surface = cssVar('--surface', '#fff');
  const green = '#2e9e5b';
  const red = '#e0564b';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  const x0 = 14;
  const boxW = W - 28;

  function box(y: number, h: number, title: string, sub: string, stroke: string) {
    ctx.fillStyle = surface;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(x0, y, boxW, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(title, x0 + 12, y + 16);
    if (sub) {
      ctx.fillStyle = muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(sub, x0 + 12, y + 34);
    }
  }

  function down(y1: number, y2: number, label: string, color: string) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(W / 2, y1);
    ctx.lineTo(W / 2, y2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(W / 2, y2);
    ctx.lineTo(W / 2 - 5, y2 - 7);
    ctx.lineTo(W / 2 + 5, y2 - 7);
    ctx.closePath();
    ctx.fill();
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.fillText(label, W / 2 + 10, (y1 + y2) / 2);
  }

  // 1. 가상주소
  box(20, 38, '가상주소 (VA)', 'CPU가 메모리에 접근', accent);
  // 2. L1 DTLB
  down(58, 78, 'miss ↓', red);
  box(78, 46, 'L1 DTLB', '4K: 64 엔트리 · ~1 cycle', accent);
  // hit 표시(오른쪽으로 빠짐)
  ctx.strokeStyle = green;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x0 + boxW, 78 + 23);
  ctx.lineTo(x0 + boxW - 4, 78 + 23);
  ctx.stroke();
  // 3. L2 STLB
  down(124, 146, 'miss ↓', red);
  box(146, 46, 'L2 STLB', '~1536 엔트리 공유 · 수~십 cycle', accent);
  // 4. page walk
  down(192, 214, 'miss ↓ (page walk)', red);
  box(214, 60, 'Page Table Walk', 'PWC 도움받아 메모리 접근 · 수십~수백 cycle', red);
  // 5. fill back
  down(274, 296, 'PTE를 TLB에 채움', green);
  box(296, 40, 'TLB에 변환 저장 → 물리주소', '다음 접근은 hit', green);

  // hit 라벨
  ctx.fillStyle = green;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('hit → 즉시 물리주소', x0 + boxW, 78 + 38);

  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('수치: Skylake 계열 대표값 (환경 의존)', W / 2, H - 12);
}

export default function TlbLookup() {
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
        주소 변환은 캐시 계층처럼 단계적입니다. 작고 빠른 <strong>L1 DTLB</strong>(Skylake 4K 페이지
        기준 64 엔트리)를 먼저 보고, 없으면 더 크고 느린 <strong>L2 STLB</strong>(명령·데이터 공유,
        ~1536 엔트리)를 봅니다. 둘 다 miss면 비로소 <strong>page table walk</strong>(앞 그림의 4회 접근,
        page-walk cache의 도움을 받음)를 돌아 PTE를 찾고, 그 변환을 TLB에 채워 다음 접근을 빠르게 합니다.
        수치는 Skylake 계열 <em>대표값</em>이며 세대·구현마다 다릅니다.
      </figcaption>
    </figure>
  );
}
