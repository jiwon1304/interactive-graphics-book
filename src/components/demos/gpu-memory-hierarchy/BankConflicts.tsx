import { useEffect, useRef } from 'react';

// 정적 도식 — 공유 메모리 뱅크 충돌.
// 공유 메모리는 32개 뱅크(4B 워드)로 인터리브된다. 대표 상태로 "32×32 타일 열 읽기"를 그린다:
// 한 열의 32 원소가 모두 같은 뱅크에 몰려 32-way 충돌로 직렬화된다(가장 극적인 경우).
// 설명·다른 패턴(연속·브로드캐스트·패딩)은 figcaption.

const BANKS = 32;
const LANES = 32;
const W = 380;
const H = 220;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

// 대표 패턴: 열 읽기 — lane i → word i*32 → bank = (i*32)%32 = 0 (모두 뱅크 0).
function wordOf(lane: number): number {
  return lane * 32;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');

  const perBank: { lane: number; word: number }[][] = Array.from({ length: BANKS }, () => []);
  for (let l = 0; l < LANES; l++) {
    const word = wordOf(l);
    perBank[word % BANKS].push({ lane: l, word });
  }
  let ways = 1;
  for (const b of perBank) {
    const distinct = new Set(b.map((x) => x.word)).size;
    ways = Math.max(ways, distinct);
  }

  ctx.clearRect(0, 0, W, H);
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  const colW = W / BANKS;
  const topY = 42;
  const cell = 5;

  // 뱅크 헤더
  ctx.fillStyle = muted;
  ctx.textAlign = 'center';
  for (let b = 0; b < BANKS; b += 4) ctx.fillText('b' + b, b * colW + colW / 2, 16);

  for (let b = 0; b < BANKS; b++) {
    const stack = perBank[b];
    const distinct = new Set(stack.map((x) => x.word)).size;
    const conflict = distinct > 1;
    const x = b * colW;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, topY, colW - 2, H - topY - 56);
    stack.forEach((_item, k) => {
      const y = topY + 5 + k * (cell + 1);
      ctx.fillStyle = conflict ? '#e0564b' : accent;
      ctx.fillRect(x + colW / 2 - cell / 2, y, cell, cell);
    });
  }

  // 통계
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  const y0 = H - 40;
  ctx.fillStyle = '#e0564b';
  ctx.fillText(`${ways}-way 뱅크 충돌 → ${ways}회로 직렬화`, 6, y0);
  ctx.fillStyle = muted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('각 칸 = 한 lane의 접근, 열 = 뱅크(word%32)', 6, y0 + 18);
  void text;
}

export default function BankConflicts() {
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
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{ width: '100%', maxWidth: W, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}
        />
      </div>

      <figcaption>
        공유 메모리는 32개 <strong>뱅크</strong>(4B 워드)로 인터리브됩니다 — 32 lane이 서로 다른 뱅크를
        치면 한 번에 처리되지만, 같은 뱅크의 다른 워드를 치면 그만큼 직렬화됩니다. 여기 그린{' '}
        <strong>32×32 타일 열 읽기</strong>는 한 열의 32 원소가 모두 같은 뱅크(b0)에 몰려{' '}
        <em>32-way 충돌</em>로 32배 느려지는 최악의 경우입니다(전부 빨강). 반대로 lane i가 word i를 치는{' '}
        <strong>연속</strong> 접근은 32 lane이 32 뱅크에 1:1로 떨어져 충돌이 없습니다. 행렬 전치 커널은
        배열 폭을 33으로 <strong>패딩</strong>해 각 행의 뱅크를 한 칸씩 밀어, 열이 32 뱅크에 고루 퍼지게
        만듭니다(표준 트릭). 모두 같은 워드를 읽는 <strong>브로드캐스트</strong>는 한 번 읽어 방송하므로
        충돌이 아닙니다.
      </figcaption>
    </figure>
  );
}
