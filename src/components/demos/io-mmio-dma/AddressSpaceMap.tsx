import { useEffect, useRef } from 'react';

// 정적 도식 — 주소 공간 맵.
// 왼쪽: CPU 물리 주소 공간(아래=0, 위=높음) 안에 RAM + MMIO(장치 BAR) 영역이 섞여 있음.
// 오른쪽: x86의 별도 64K I/O port 공간(IN/OUT 전용). 두 공간이 다름을 대비.
// 세로 막대(메모리 맵 관례: 주소가 위로 증가).

const W = 360;
const H = 420;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  const amber = '#d98a26';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  const top = 44;
  const bot = H - 56;
  const colH = bot - top;

  // ── 왼쪽: 물리 주소 공간 ──
  const lx = 20;
  const lw = 150;
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CPU 물리 주소 공간', lx + lw / 2, 22);

  // 세그먼트: 아래부터 RAM, MMIO(GPU BAR), RAM, MMIO(NIC), ROM
  type Seg = { frac: number; label: string; kind: 'ram' | 'mmio' | 'rom' };
  const segs: Seg[] = [
    { frac: 0.34, label: 'RAM', kind: 'ram' },
    { frac: 0.16, label: 'MMIO: GPU BAR', kind: 'mmio' },
    { frac: 0.22, label: 'RAM', kind: 'ram' },
    { frac: 0.14, label: 'MMIO: NIC 레지스터', kind: 'mmio' },
    { frac: 0.14, label: 'ROM / 펌웨어', kind: 'rom' },
  ];
  let yy = bot;
  segs.forEach((s) => {
    const h = colH * s.frac;
    const y = yy - h;
    if (s.kind === 'ram') {
      ctx.fillStyle = 'rgba(120,120,120,0.12)';
      ctx.strokeStyle = border;
    } else if (s.kind === 'mmio') {
      ctx.fillStyle = 'rgba(217,138,38,0.18)';
      ctx.strokeStyle = amber;
    } else {
      ctx.fillStyle = 'rgba(59,130,246,0.1)';
      ctx.strokeStyle = accent;
    }
    ctx.lineWidth = 1.5;
    ctx.fillRect(lx, y, lw, h);
    ctx.strokeRect(lx, y, lw, h);
    ctx.fillStyle = text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.label, lx + lw / 2, y + h / 2);
    yy = y;
  });
  // 주소 화살표(위로 증가)
  ctx.strokeStyle = muted;
  ctx.fillStyle = muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lx - 8, bot);
  ctx.lineTo(lx - 8, top);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(lx - 8, top);
  ctx.lineTo(lx - 11, top + 7);
  ctx.lineTo(lx - 5, top + 7);
  ctx.closePath();
  ctx.fill();
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('높은 주소', lx - 4, top + 4);
  ctx.fillText('0', lx - 4, bot - 4);

  // ── 오른쪽: I/O port 공간 ──
  const rx = 210;
  const rw = 130;
  ctx.fillStyle = text;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('I/O port 공간', rx + rw / 2, 22);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = muted;
  ctx.fillText('(x86, IN/OUT 전용)', rx + rw / 2, 36);

  const ioTop = top + 18;
  const ioH = colH - 18;
  ctx.fillStyle = 'rgba(59,130,246,0.08)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.fillRect(rx, ioTop, rw, ioH);
  ctx.strokeRect(rx, ioTop, rw, ioH);
  // 몇 개의 port 슬롯
  const ports = ['0x60 키보드', '0x1F0 디스크', '0x3F8 시리얼', '0xCF8 PCI 설정'];
  ports.forEach((p, i) => {
    const y = ioTop + ((i + 1) / (ports.length + 1)) * ioH;
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rx + 6, y);
    ctx.lineTo(rx + rw - 6, y);
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p, rx + rw / 2, y - 9);
  });
  ctx.fillStyle = muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('0 ~ 0xFFFF (64K)', rx + rw / 2, ioTop + ioH - 12);

  // 하단 라벨
  ctx.fillStyle = text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MMIO: 일반 load/store', lx, H - 34);
  ctx.fillText('port: IN/OUT 명령', lx, H - 18);
}

export default function AddressSpaceMap() {
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
        장치 레지스터에 닿는 두 가지 길입니다. <strong>MMIO</strong>는 장치 레지스터를 CPU의 물리 주소
        공간 한가운데에 끼워 넣습니다(주황 — GPU·NIC의 BAR 영역). 그래서 일반 load/store(x86이면 MOV)로
        장치를 읽고 씁니다. 단, 이 영역은 <em>캐시 불가</em>여야 합니다 — 레지스터는 읽기·쓰기에 부수효과가
        있고 값이 장치에 의해 바뀌므로, 캐시에 들고 있으면 stale 값을 보게 됩니다. <strong>port I/O</strong>는
        x86 고유의 별도 64K 주소 공간(0~0xFFFF)으로, 전용 <code>IN</code>/<code>OUT</code> 명령으로만
        접근합니다. 물리 주소 공간(예: 4GB)과는 완전히 다른 공간이라 같은 숫자 "0x60"이라도 어느 공간이냐에
        따라 RAM의 한 바이트일 수도, 키보드 컨트롤러일 수도 있습니다. ARM 같은 아키텍처는 port 공간이 없어
        모든 장치가 MMIO입니다.
      </figcaption>
    </figure>
  );
}
