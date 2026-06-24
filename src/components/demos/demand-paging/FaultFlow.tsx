import { useEffect, useRef } from 'react';

// 정적 도식 — page fault 처리 흐름.
// 접근 → PTE present? → (present면 그냥 진행) → fault 시 VMA 조회 → 3종 분기
// (minor: zero/page-cache/COW, major: 디스크·스왑 적재, invalid: SIGSEGV) → PTE 갱신 → 명령 재시작.
// 모바일 세로 스택. 라벨 최소, 설명은 figcaption.

const W = 360;
const H = 470;

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
  const border = cssVar('--border', '#ccc');
  const surface = cssVar('--surface', '#fff');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.lineWidth = 1.5;

  const cx = W / 2;
  // box 그리기 헬퍼
  const box = (
    yTop: number,
    h: number,
    label: string[],
    fill: string,
    stroke: string,
    txtColor: string,
    wBox = 300,
  ) => {
    const x = cx - wBox / 2;
    roundRect(ctx, x, yTop, wBox, h, 9);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.fillStyle = txtColor;
    const lh = 16;
    const startY = yTop + h / 2 - ((label.length - 1) * lh) / 2;
    label.forEach((ln, i) => {
      ctx.font = i === 0 ? '13px system-ui, sans-serif' : '12px system-ui, sans-serif';
      ctx.fillText(ln, cx, startY + i * lh);
    });
    return yTop + h;
  };

  const arrow = (x1: number, y1: number, x2: number, y2: number, color: string, label?: string) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 7 * Math.cos(a - 0.4), y2 - 7 * Math.sin(a - 0.4));
    ctx.lineTo(x2 - 7 * Math.cos(a + 0.4), y2 - 7 * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fill();
    if (label) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(label, (x1 + x2) / 2 + 6, (y1 + y2) / 2);
      ctx.textAlign = 'center';
    }
  };

  // 1. 메모리 접근
  let y = 12;
  y = box(y, 38, ['가상 주소 접근 (load/store)'], surface, accent, text);
  arrow(cx, y, cx, y + 18, muted);

  // 2. PTE present? (다이아몬드 느낌은 둥근 박스로 단순화)
  y += 18;
  const dY = y;
  y = box(y, 44, ['PTE present?', 'MMU가 page table 확인'], surface, border, text, 240);
  // present=yes → 우측으로 짧게
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText('yes → 변환·계속', cx + 124, dY + 22);
  arrow(cx + 120, dY + 22, cx + 122, dY + 22, muted);
  ctx.textAlign = 'center';

  arrow(cx, y, cx, y + 18, accent, 'no');

  // 3. page fault 예외 → VMA 조회
  y += 18;
  y = box(y, 44, ['page fault 예외', '커널이 VMA(매핑 구간) 조회'], 'rgba(59,130,246,0.12)', accent, text);

  // 분기점
  const branchY = y + 16;
  arrow(cx, y, cx, branchY, muted);

  // 3종 분기 (세로 스택)
  y = branchY;
  // minor
  y = box(y, 50, ['minor (soft) fault', 'zero page · page cache · COW', '디스크 I/O 없음'], 'rgba(46,158,91,0.14)', '#2e9e5b', text);
  arrow(cx, y, cx, y + 14, muted);
  y += 14;
  // major
  y = box(y, 50, ['major (hard) fault', '디스크/스왑에서 적재', '느린 I/O 대기'], 'rgba(224,150,40,0.16)', '#d98a26', text);
  arrow(cx, y, cx, y + 14, muted);
  y += 14;
  // invalid
  y = box(y, 50, ['invalid', '어떤 VMA에도 없음', '→ SIGSEGV (프로세스 종료)'], 'rgba(224,86,75,0.16)', '#e0564b', text);

  // minor/major → PTE 갱신 → 재시작 (invalid는 빠짐: 아래로 곧장 두꺼운 줄로 합류 표현은 생략, 화살표만)
  const updY = y + 16;
  arrow(cx, y, cx, updY, muted);
  y = updY;
  y = box(y, 38, ['PTE 갱신 (프레임 → present)'], surface, accent, text);
  arrow(cx, y, cx, y + 16, accent);
  y += 16;
  box(y, 38, ['폴트 낸 명령을 재시작'], 'rgba(59,130,246,0.12)', accent, text);
}

export default function FaultFlow() {
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
        하나의 메모리 접근이 page fault로 갈라지는 경로입니다. MMU가 PTE에서 present 비트를 못 찾으면
        CPU가 page fault 예외를 던지고, 커널이 그 주소가 어느 VMA에 속하는지부터 확인합니다. 결과는
        세 갈래입니다. <strong>minor(soft)</strong>는 디스크 I/O 없이 끝납니다 — 익명 페이지의 첫
        접근(zero page), 이미 page cache에 있는 파일 페이지 매핑, copy-on-write 복제가 여기 듭니다.
        <strong>major(hard)</strong>는 디스크나 스왑에서 실제로 읽어와야 해 수천~수만 배 느립니다.
        <strong>invalid</strong>는 매핑 자체가 없는 접근이라 커널이 SIGSEGV를 보냅니다(흔한
        segmentation fault). minor·major는 프레임을 확보해 PTE를 갱신한 뒤, 폴트를 낸 바로 그 명령을
        <em>재시작</em>합니다 — 그래서 프로그램 입장에선 아무 일도 없던 것처럼 접근이 성공합니다.
      </figcaption>
    </figure>
  );
}
