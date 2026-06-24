import { useEffect, useRef } from 'react';

// 정적 도식 — DMA 전송의 3단계 시퀀스.
// 박스: CPU / DMA controller(또는 bus-master 장치) / RAM / Device.
// ① CPU가 descriptor(src/dst/len) 작성 + 시작 명령 (MMIO write)
// ② controller가 RAM↔Device 직접 전송 (CPU 우회)
// ③ 완료 interrupt → CPU
// 한 컷에 3개의 번호 붙은 화살표.

const W = 360;
const H = 320;

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
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  const surface = cssVar('--surface', '#fff');
  const green = '#2e9e5b';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const node = (x: number, y: number, w: number, h: number, label: string, stroke: string) => {
    roundRect(ctx, x, y, w, h, 9);
    ctx.fillStyle = surface;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(label, x + w / 2, y + h / 2);
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  };

  const arrow = (x1: number, y1: number, x2: number, y2: number, color: string, num: string, labelXY?: [number, number, string]) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4));
    ctx.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fill();
    // 번호 배지
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    ctx.beginPath();
    ctx.arc(mx, my, 9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(num, mx, my + 0.5);
    if (labelXY) {
      ctx.fillStyle = color;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(labelXY[2], labelXY[0], labelXY[1]);
    }
  };

  // 노드 배치
  const cpu = node(20, 30, 120, 44, 'CPU', accent);
  const dma = node(210, 30, 130, 44, 'DMA 컨트롤러', accent);
  const ram = node(20, 200, 120, 44, 'RAM', border);
  const dev = node(210, 200, 130, 44, '장치 (Device)', border);

  // ① CPU → DMA: descriptor 작성 + 시작 (MMIO write)
  arrow(cpu.x + cpu.w, cpu.cy, dma.x, dma.cy, accent, '1', [W / 2, 18, 'descriptor 작성·시작']);

  // ② DMA ↔ RAM, DMA ↔ Device (직접 전송) — 양방향 표현 위해 두 화살표
  arrow(dma.cx - 20, dma.y + dma.h, ram.cx + 20, ram.y, green, '2', [W / 2 - 40, 130, 'RAM↔장치']);
  arrow(dma.cx + 10, dma.y + dma.h, dev.cx, dev.y, green, '2', undefined);

  // ③ DMA → CPU: 완료 interrupt
  // dma 좌상 → cpu 우상 (위로 곡선 대신 직선, 살짝 위 경유 라벨)
  arrow(dma.x, dma.y + 10, cpu.x + cpu.w, cpu.y + 10, accent, '3');
  ctx.fillStyle = accent;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('완료 interrupt', W / 2, dma.y + 4);

  // 하단 단계 설명
  ctx.textAlign = 'left';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = text;
  const ly = 272;
  ctx.fillText('1. CPU가 src·dst·len을 쓰고 시작 (MMIO)', 20, ly);
  ctx.fillText('2. 컨트롤러가 직접 전송 — CPU는 자유', 20, ly + 18);
  ctx.fillText('3. 끝나면 완료 IRQ로 CPU에 알림', 20, ly + 36);
}

export default function DmaSequence() {
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
        DMA 한 번의 세 단계입니다. <strong>①</strong> CPU가 DMA 컨트롤러의 레지스터에 전송의 출발지
        주소·목적지 주소·길이를 적고(이 쓰기 자체가 MMIO입니다) 시작시킵니다. <strong>②</strong> 컨트롤러가
        메모리와 장치 사이에서 데이터를 직접 옮깁니다 — 이 동안 CPU는 끼지 않고 다른 일을 합니다. 현대
        PCIe 장치에서는 별도 중앙 컨트롤러 대신 장치 자신이 <em>bus master</em>가 되어 PCIe 트랜잭션으로
        host RAM에 직접 접근합니다. 큰 전송은 보통 흩어진 버퍼들을 가리키는 descriptor 리스트
        (scatter-gather)로 묶어 한 번에 처리합니다. <strong>③</strong> 다 끝나면 컨트롤러가 완료 interrupt를
        올립니다. 주의할 함정: DMA가 RAM을 직접 고쳤으므로 CPU 캐시에 남은 옛 사본과 어긋날 수 있습니다
        (캐시 일관성) — 플랫폼이 HW로 보장하지 않으면 드라이버가 해당 영역을 flush/invalidate해야 합니다.
      </figcaption>
    </figure>
  );
}
