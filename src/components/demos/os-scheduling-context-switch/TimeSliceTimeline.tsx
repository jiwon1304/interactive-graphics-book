import { useEffect, useRef } from 'react';

// 정적 도식 — 두 프로세스의 타임슬라이스 + 컨텍스트 전환 비용 블록.
// A와 B가 한 코어를 번갈아 쓴다. 슬라이스 사이마다 좁은 빨강 블록 = 컨텍스트 전환(생산적이지 않은 시간).

const W = 360;
const H = 220;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

// [프로세스, 슬라이스 폭] 시퀀스 (전환 비용은 사이마다 삽입)
const SLICES: Array<['A' | 'B', number]> = [
  ['A', 3], ['B', 2], ['A', 3], ['B', 3], ['A', 2],
];
const SWITCH = 0.5; // 전환 비용 폭(슬라이스 단위) — 도식상 과장

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');

  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.font = '12px system-ui, sans-serif';

  const x0 = 14;
  const x1 = W - 14;
  const span = x1 - x0;
  const colorA = accent;
  const colorB = '#e0a23b';
  const switchCol = '#e0564b';

  // 총 단위 계산
  let units = 0;
  SLICES.forEach((s, i) => {
    units += s[1];
    if (i < SLICES.length - 1) units += SWITCH;
  });
  const u = span / units;

  const trackY = 70;
  const trackH = 44;

  ctx.fillStyle = text;
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('한 CPU 코어 — 시간 →', x0, 24);

  // 범례
  function legend(x: number, c: string, label: string) {
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x, 38, 14, 12);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = border;
    ctx.strokeRect(x, 38, 14, 12);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 18, 44);
  }
  legend(x0, colorA, '프로세스 A');
  legend(x0 + 96, colorB, '프로세스 B');
  legend(x0 + 192, switchCol, '전환');

  let cursor = x0;
  SLICES.forEach((s, i) => {
    const [proc, wUnits] = s;
    const w = wUnits * u;
    const col = proc === 'A' ? colorA : colorB;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(cursor, trackY, w, trackH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cursor, trackY, w, trackH);
    ctx.fillStyle = text;
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(proc, cursor + w / 2, trackY + trackH / 2);
    cursor += w;

    if (i < SLICES.length - 1) {
      const sw = SWITCH * u;
      ctx.fillStyle = switchCol;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(cursor, trackY, sw, trackH);
      ctx.globalAlpha = 1;
      cursor += sw;
    }
  });

  // 전환 블록 하나에 콜아웃
  // 첫 전환 위치: A(3u) 다음
  const firstSwitchX = x0 + 3 * u;
  const sw = SWITCH * u;
  ctx.strokeStyle = switchCol;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(firstSwitchX + sw / 2, trackY + trackH);
  ctx.lineTo(firstSwitchX + sw / 2, trackY + trackH + 26);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('컨텍스트 전환', firstSwitchX + sw / 2, trackY + trackH + 38);
  ctx.fillStyle = muted;
  ctx.fillText('(레지스터 저장 + TLB/캐시 오염)', firstSwitchX + sw / 2, trackY + trackH + 54);

  ctx.fillStyle = text;
  ctx.textAlign = 'left';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('슬라이스가 짧을수록 빨강(전환) 비율↑', x0, H - 12);
}

export default function TimeSliceTimeline() {
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
        한 코어가 두 프로세스 A·B에 시간을 잘게 나눠 줍니다(시분할). 각 색 블록이 한 프로세스의
        <strong>타임슬라이스</strong>이고, 그 사이의 좁은 빨강이 <strong>컨텍스트 전환</strong> —
        아무 유용한 일도 하지 않는 순수 오버헤드입니다(여기선 눈에 보이게 과장). 슬라이스를 너무 짧게
        하면 응답성은 좋아지지만 전환이 잦아져 빨강 비율이 커지고, 너무 길게 하면 다른 작업이 오래
        기다립니다 — 스케줄러는 이 둘 사이에서 타협합니다.
      </figcaption>
    </figure>
  );
}
