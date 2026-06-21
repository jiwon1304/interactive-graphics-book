import { useEffect, useRef, useState } from 'react';
import { ControlPanel, SelectControl, type SelectOption } from '../../controls';

type Mode = 'linear' | 'broadcast' | 'column' | 'padded';

const MODE_OPTIONS: ReadonlyArray<SelectOption<Mode>> = [
  { value: 'linear', label: '연속 (lane i → word i)' },
  { value: 'broadcast', label: '브로드캐스트 (모두 같은 word)' },
  { value: 'column', label: '32×32 타일 열 읽기' },
  { value: 'padded', label: '열 읽기 + [32][33] 패딩' },
];

const BANKS = 32;
const LANES = 32;
const W = 560;
const H = 250;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

// lane → word index(4B 단위). bank = word % 32.
function wordOf(mode: Mode, lane: number): number {
  switch (mode) {
    case 'linear':
      return lane;
    case 'broadcast':
      return 0;
    case 'column':
      return lane * 32; // (lane, col=0) of row-major 32-wide tile → bank = (lane*32)%32 = 0
    case 'padded':
      return lane * 33; // 폭을 33으로 패딩 → bank = (lane*33)%32 = lane%32, 모두 distinct
  }
}

function draw(ctx: CanvasRenderingContext2D, mode: Mode) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');

  // bank → 그 뱅크를 치는 lane들의 word 집합
  const perBank: { lane: number; word: number }[][] = Array.from({ length: BANKS }, () => []);
  for (let l = 0; l < LANES; l++) {
    const w = wordOf(mode, l);
    perBank[w % BANKS].push({ lane: l, word: w });
  }
  // 충돌 ways = 뱅크별 distinct word 수의 최대(같은 word는 브로드캐스트로 1)
  let ways = 1;
  for (const b of perBank) {
    const distinct = new Set(b.map((x) => x.word)).size;
    ways = Math.max(ways, distinct);
  }

  ctx.clearRect(0, 0, W, H);
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  const colW = W / BANKS;
  const topY = 40;
  const cell = 6;

  // 뱅크 헤더
  ctx.fillStyle = muted;
  ctx.textAlign = 'center';
  for (let b = 0; b < BANKS; b += 4) ctx.fillText('b' + b, b * colW + colW / 2, 14);

  for (let b = 0; b < BANKS; b++) {
    const stack = perBank[b];
    const distinct = new Set(stack.map((x) => x.word)).size;
    const conflict = distinct > 1;
    const x = b * colW;
    // 뱅크 컬럼 배경
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, topY, colW - 2, H - topY - 50);
    // lane 토큰 쌓기
    stack.forEach((_item, k) => {
      const y = topY + 6 + k * (cell + 1);
      ctx.fillStyle = conflict ? '#e0564b' : distinct === 1 && stack.length > 1 ? '#2e9e5b' : accent;
      ctx.fillRect(x + colW / 2 - cell / 2, y, cell, cell);
    });
  }

  // 범례 + 통계
  ctx.textAlign = 'left';
  ctx.font = '12px system-ui, sans-serif';
  const y0 = H - 38;
  ctx.fillStyle = text;
  if (ways === 1) {
    const broad = mode === 'broadcast';
    ctx.fillStyle = '#2e9e5b';
    ctx.fillText(broad ? '브로드캐스트 — 충돌 없음 (1회, 한 번 읽어 32 lane에 방송)' : '충돌 없음 — 32 lane이 32 뱅크에 1:1 (1회)', 6, y0);
  } else {
    ctx.fillStyle = '#e0564b';
    ctx.fillText(`${ways}-way 뱅크 충돌 → ${ways}회로 직렬화 (그만큼 느려짐)`, 6, y0);
  }
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('각 칸 = 한 lane의 접근, 열 = 뱅크(word%32). 빨강=같은 뱅크·다른 word(충돌), 초록=브로드캐스트', 6, y0 + 18);
}

/**
 * 위젯 — 공유 메모리 뱅크 충돌.
 * 공유 메모리는 32개 뱅크(4B 워드)로 인터리브된다. 32 lane이 서로 다른 뱅크를 치면 한 번에, 같은
 * 뱅크의 다른 워드를 치면 N-way 충돌로 직렬화된다. 같은 워드는 브로드캐스트라 충돌이 아니다.
 */
export default function BankConflicts() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<Mode>('column');

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (ctx) draw(ctx, mode);
  }, [mode]);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{ width: '100%', maxWidth: 560, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}
        />
      </div>

      <ControlPanel>
        <SelectControl label="접근 패턴" value={mode} options={MODE_OPTIONS} onChange={setMode} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> "연속"은 32 lane이 32 뱅크에 1:1로 떨어져 충돌이 없습니다.
        "32×32 타일 열 읽기"는 한 열의 32 원소가 모두 같은 뱅크에 몰려 <em>32-way 충돌</em>로 32배
        느려집니다. 폭을 33으로 <strong>패딩</strong>하면 각 행의 뱅크가 한 칸씩 밀려 열이 32 뱅크에
        고루 퍼져 충돌이 사라집니다(행렬 전치 커널의 표준 트릭). "브로드캐스트"는 모두 같은 워드라
        한 번 읽어 방송하므로 충돌이 아닙니다.
      </figcaption>
    </figure>
  );
}
