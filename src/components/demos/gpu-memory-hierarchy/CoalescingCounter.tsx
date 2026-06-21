import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, SelectControl, type SelectOption } from '../../controls';

const W = 560;
const H = 230;
const LANES = 32;
const SEG = 128; // 캐시 라인/트랜잭션 단위(byte), CC6+ 합치기 모델
const SECTOR = 32; // L2/DRAM 섹터(byte)

const WORD_OPTIONS: ReadonlyArray<SelectOption<string>> = [
  { value: '4', label: '4 B (float/int)' },
  { value: '8', label: '8 B (vec2/double)' },
  { value: '16', label: '16 B (vec4)' },
];
const STRIDE_OPTIONS: ReadonlyArray<SelectOption<string>> = [
  { value: '1', label: '1 (연속)' },
  { value: '2', label: '2' },
  { value: '4', label: '4' },
  { value: '8', label: '8' },
  { value: '16', label: '16' },
];

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D, word: number, stride: number, offset: number) {
  const addrs: number[] = [];
  for (let i = 0; i < LANES; i++) addrs.push(offset + i * stride * word);
  const maxByte = offset + (LANES - 1) * stride * word + word;
  const spanSegs = Math.ceil(maxByte / SEG);
  const totalBytes = spanSegs * SEG;
  const sx = W / totalBytes;

  // 터치된 128B 세그먼트 집합
  const touched = new Set<number>();
  for (const a of addrs) {
    for (let b = a; b < a + word; b++) touched.add(Math.floor(b / SEG));
  }
  const transactions = touched.size;
  const useful = LANES * word;
  const moved = transactions * SEG;
  const eff = useful / moved;

  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');

  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.font = '11px system-ui, sans-serif';

  const memY = 70;
  const memH = 46;

  // 128B 세그먼트
  for (let s = 0; s < spanSegs; s++) {
    const x = s * SEG * sx;
    const w = SEG * sx;
    ctx.fillStyle = touched.has(s) ? accent : cssVar('--surface', '#eee');
    ctx.globalAlpha = touched.has(s) ? 0.35 : 1;
    ctx.fillRect(x, memY, w - 1, memH);
    ctx.globalAlpha = 1;
    // 32B 섹터 구분선
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    for (let k = 1; k < SEG / SECTOR; k++) {
      const xx = x + k * SECTOR * sx;
      ctx.beginPath();
      ctx.moveTo(xx, memY);
      ctx.lineTo(xx, memY + memH);
      ctx.stroke();
    }
    // 세그먼트 외곽
    ctx.strokeStyle = touched.has(s) ? accent : border;
    ctx.lineWidth = touched.has(s) ? 2 : 1;
    ctx.strokeRect(x, memY, w - 1, memH);
  }
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText('전역 메모리 — 128B 트랜잭션(굵은 칸) · 32B 섹터(가는 선)', 2, memY - 14);

  // 32개 스레드 접근(메모리 위 작은 마커)
  for (let i = 0; i < LANES; i++) {
    const x = addrs[i] * sx;
    const w = Math.max(1.5, word * sx);
    ctx.fillStyle = text;
    ctx.fillRect(x, memY + memH + 6, w, 10);
  }
  ctx.fillStyle = muted;
  ctx.fillText('워프의 32 스레드 접근 ↑', 2, memY + memH + 26);

  // 통계
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = text;
  ctx.fillText(`트랜잭션 ${transactions}개 · 이동 ${moved}B · 유효 ${useful}B`, 2, H - 34);
  const pct = Math.round(eff * 100);
  ctx.fillStyle = eff > 0.6 ? '#2e9e5b' : eff > 0.25 ? '#d8922a' : '#e0564b';
  ctx.fillText(`대역폭 효율 ${pct}%  (유효 ÷ 이동)`, 2, H - 14);
}

/**
 * 위젯 — 메모리 합치기(coalescing) 트랜잭션 카운터.
 * 워프 32 스레드의 전역 메모리 접근이 몇 개의 128B 트랜잭션으로 묶이는지 센다. 연속·정렬이면 1개로
 * 합쳐져 효율 100%, 스트라이드가 커지면 스레드마다 다른 세그먼트를 건드려 트랜잭션이 폭증한다.
 */
export default function CoalescingCounter() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [word, setWord] = useState('4');
  const [stride, setStride] = useState('1');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (ctx) draw(ctx, Number(word), Number(stride), offset);
  }, [word, stride, offset]);

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
        <SelectControl label="스레드당 워드 크기" value={word} options={WORD_OPTIONS} onChange={setWord} />
        <SelectControl label="스트라이드(요소)" value={stride} options={STRIDE_OPTIONS} onChange={setStride} />
        <Slider label="시작 오프셋" value={offset} min={0} max={96} step={4} onChange={setOffset} unit=" B" />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 스트라이드 1·오프셋 0이면 32 스레드가 연속 128B 한 칸에 딱 맞아
        <em>트랜잭션 1개, 효율 100%</em>입니다. 스트라이드를 키우면 스레드마다 다른 128B 칸을 건드려
        트랜잭션이 늘고, 이동한 바이트 대부분이 버려져 효율이 1/스트라이드 쪽으로 떨어집니다. 오프셋을
        주면 정렬이 깨져 한 칸이 더 필요해집니다(미정렬 페널티). 합치기는 <em>유효</em> 대역폭을 좌우합니다.
      </figcaption>
    </figure>
  );
}
