import { useEffect, useRef } from 'react';

// 정적 도식 — 예외 3분류(fault/trap/abort): 저장된 IP가 가리키는 곳과 재시작 가능 여부.
// 명령 스트림(… prev | THIS | next …)을 그리고, 각 분류에서 저장된 RIP가 어디를 가리키는지 화살표로.
// fault → THIS(재시작 가능), trap → next(완료 후), abort → 불명(재시작 불가).

const W = 380;
const H = 360;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  const surface = cssVar('--surface', '#fff');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  const x0 = 16;
  // 명령 스트림 3칸: prev, THIS, next
  const cellW = 96;
  const cellH = 34;
  const sy = 40;
  const labels = ['prev', 'THIS', 'next'];
  const cellX = (i: number) => x0 + i * (cellW + 8);

  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText('명령 스트림', x0, sy - 16);

  for (let i = 0; i < 3; i++) {
    const x = cellX(i);
    const isThis = i === 1;
    ctx.fillStyle = isThis ? accent : surface;
    ctx.strokeStyle = isThis ? accent : border;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.rect(x, sy, cellW, cellH);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isThis ? surface : text;
    ctx.font = isThis ? 'bold 13px system-ui, sans-serif' : '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + cellW / 2, sy + cellH / 2);
  }
  // 예외 표시
  ctx.fillStyle = text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('⚡ 예외 발생', cellX(1) + cellW / 2, sy + cellH + 12);

  const thisCenter = cellX(1) + cellW / 2;
  const nextCenter = cellX(2) + cellW / 2;

  // 3개 분류 행
  const rows: Array<{ name: string; target: 'this' | 'next' | 'none'; restart: string; ex: string }> = [
    { name: 'Fault', target: 'this', restart: '재시작 가능', ex: '#PF, #GP, #UD, #DE' },
    { name: 'Trap', target: 'next', restart: '완료 후 보고', ex: '#BP, #DB(일부)' },
    { name: 'Abort', target: 'none', restart: '재시작 불가', ex: '#DF, #MC' },
  ];

  let ry = 116;
  const rh = 70;
  for (const r of rows) {
    // 박스
    ctx.fillStyle = surface;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(x0, ry, W - 2 * x0, rh - 12);
    ctx.fill();
    ctx.stroke();

    // 분류명
    ctx.fillStyle = accent;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(r.name, x0 + 12, ry + 18);

    // 재시작 + 예시
    ctx.fillStyle = text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('저장된 RIP → ' + (r.target === 'this' ? 'THIS' : r.target === 'next' ? 'next' : '미정'), x0 + 12, ry + 38);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(r.restart + ' · 예: ' + r.ex, x0 + 12, ry + 52);

    // 화살표: THIS/next 위치를 위 스트림과 시각적으로 연결 (오른쪽에 미니 표식)
    const mx = W - x0 - 70;
    const my = ry + 30;
    ctx.strokeStyle = r.target === 'none' ? muted : accent;
    ctx.fillStyle = r.target === 'none' ? muted : accent;
    ctx.lineWidth = 1.5;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (r.target === 'this') {
      ctx.fillText('↩ THIS', mx + 30, my);
    } else if (r.target === 'next') {
      ctx.fillText('→ next', mx + 30, my);
    } else {
      ctx.fillText('✕', mx + 30, my);
    }
    ry += rh;
  }

  // 참조선: 위 스트림 THIS/next 위치 표시(점선)
  ctx.strokeStyle = muted;
  ctx.setLineDash([2, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(thisCenter, sy + cellH + 18);
  ctx.lineTo(thisCenter, ry - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(nextCenter, sy + cellH + 18);
  ctx.lineTo(nextCenter, ry - 4);
  ctx.stroke();
  ctx.setLineDash([]);
}

export default function ExceptionClasses() {
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
        예외를 셋으로 가르는 기준은 "핸들러가 끝난 뒤 어디로 돌아가는가", 즉 하드웨어가 저장한 RIP가
        어디를 가리키느냐입니다. <strong>Fault</strong>는 문제를 일으킨 명령(THIS) 자체를 가리켜, 원인을
        해소하면(예: 페이지를 메모리로 불러오면) 그 명령을 <em>다시 실행</em>할 수 있습니다 — page fault로
        구현되는 demand paging이 정확히 이것입니다. <strong>Trap</strong>은 다음 명령(next)을 가리켜, 트랩을
        일으킨 명령은 이미 완료된 상태로 보고됩니다(breakpoint·single-step). <strong>Abort</strong>는 보통
        정확한 위치를 보장하지 못하는 치명적 오류(double fault·machine check)로, 일반적으로 재시작이
        불가능합니다. 벡터 번호(#PF=14, #GP=13, #DF=8 …)는 x86 기준 고정값이며 IDT에서 핸들러를 찾는
        인덱스로도 쓰입니다.
      </figcaption>
    </figure>
  );
}
