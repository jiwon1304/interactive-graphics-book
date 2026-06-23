import { useEffect, useRef } from 'react';

// 정적 도식 — x86-64 4-level page walk. 48-bit 가상주소를 9|9|9|9|12 로 쪼개,
// CR3 → PML4 → PDPT → PD → PT → 물리 프레임으로 내려가는 4번의 메모리 접근을 세로 스택으로.

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
  const surface = cssVar('--surface', '#fff');
  const green = '#2e9e5b';
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  // 가상주소 분해 막대 (상단)
  const bits = [
    { w: 0.18, label: 'PML4', sub: '9' },
    { w: 0.18, label: 'PDPT', sub: '9' },
    { w: 0.18, label: 'PD', sub: '9' },
    { w: 0.18, label: 'PT', sub: '9' },
    { w: 0.28, label: 'offset', sub: '12' },
  ];
  const x0 = 14;
  const x1 = W - 14;
  const barY = 24;
  const barH = 34;
  let cx = x0;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < bits.length; i++) {
    const w = (x1 - x0) * bits[i].w;
    ctx.fillStyle = i === bits.length - 1 ? surface : (i % 2 ? surface : surface);
    ctx.strokeStyle = i === bits.length - 1 ? green : accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(cx + 1, barY, w - 2, barH, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(bits[i].label, cx + w / 2, barY + 12);
    ctx.fillStyle = muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(bits[i].sub + 'b', cx + w / 2, barY + 25);
    cx += w;
  }
  ctx.fillStyle = muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('48-bit 가상주소', x0, barY - 8);

  // walk 단계 (세로 스택)
  const steps = [
    { from: 'CR3', name: 'PML4 테이블', note: '엔트리 → 다음 테이블 물리주소' },
    { from: 'PML4[i]', name: 'PDPT 테이블', note: '512개 엔트리 중 9-bit index로 선택' },
    { from: 'PDPT[i]', name: 'PD 테이블', note: '' },
    { from: 'PD[i]', name: 'PT 테이블', note: 'PTE → 물리 프레임 번호(PFN)' },
  ];
  const top = 86;
  const rowH = 60;
  const boxW = W - 28;
  for (let i = 0; i < steps.length; i++) {
    const y = top + i * rowH;
    ctx.fillStyle = surface;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(x0, y, boxW, rowH - 14, 8);
    ctx.fill();
    ctx.stroke();
    // 단계 번호 원
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x0 + 20, y + (rowH - 14) / 2, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x0 + 20, y + (rowH - 14) / 2);
    // 텍스트
    ctx.textAlign = 'left';
    ctx.fillStyle = text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(steps[i].name, x0 + 44, y + 14);
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('← ' + steps[i].from, x0 + 44, y + 31);
    // 메모리 접근 표시
    ctx.fillStyle = '#e0564b';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('메모리 접근 ' + (i + 1), x0 + boxW - 10, y + 14);
    // 화살표 between
    if (i < steps.length - 1) {
      ctx.strokeStyle = muted;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(W / 2, y + rowH - 14);
      ctx.lineTo(W / 2, y + rowH);
      ctx.stroke();
    }
  }

  // 최종 프레임
  const fy = top + steps.length * rowH;
  ctx.fillStyle = surface;
  ctx.strokeStyle = green;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x0, fy, boxW, 34, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = green;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('물리 프레임 + offset = 물리주소', W / 2, fy + 17);

  ctx.fillStyle = '#e0564b';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('한 번의 변환 = 메모리 4회 접근', W / 2, H - 14);
}

export default function PageWalkDiagram() {
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
        x86-64의 4-level page table walk. 48-bit 가상주소를 <strong>9·9·9·9·12 bit</strong>로 쪼갭니다.
        각 9 bit는 512개 엔트리를 가진 한 테이블의 index이고(512 = 2⁹), <code>CR3</code> 레지스터가 가리키는
        PML4부터 시작해 PDPT → PD → PT로 한 단계씩 <em>메모리에서 엔트리를 읽어</em> 다음 테이블 주소를
        얻습니다. 마지막 PTE가 물리 프레임 번호를 주고, 거기에 12-bit offset을 붙이면 물리주소가 완성됩니다.
        핵심: 캐시되지 않은 변환 하나가 <strong>메모리 4회 접근</strong>을 부릅니다 — 그래서 TLB가 필요합니다.
        (5-level paging이면 PML5가 한 단계 더 붙어 5회가 됩니다.)
      </figcaption>
    </figure>
  );
}
