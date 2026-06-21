import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, SelectControl, ToggleControl, type SelectOption } from '../../controls';

// PCIe x16 방향당 유효 대역폭(GB/s, 128b/130b 인코딩 후). 1 GB/s ≈ 1 MB/ms.
const GEN_X16: Record<string, number> = { '3.0': 15.75, '4.0': 31.5, '5.0': 63 };
const LANE_SCALE: Record<string, number> = { '16': 1, '8': 0.5, '4': 0.25 };

const LANE_OPTIONS: ReadonlyArray<SelectOption<string>> = [
  { value: '16', label: 'x16' },
  { value: '8', label: 'x8' },
  { value: '4', label: 'x4' },
];

const W = 540;
const H = 200;
const BUDGET_MS = 16.6; // 60fps 한 프레임

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D, sizeMB: number, lanes: string, pinned: boolean) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  ctx.clearRect(0, 0, W, H);
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  const gens = ['3.0', '4.0', '5.0'];
  // pageable는 스테이징 복사 탓에 유효 대역폭이 크게 떨어짐(환경 의존, 여기선 ~0.4배로 예시)
  const pinnedFactor = pinned ? 1 : 0.4;
  const times = gens.map((g) => sizeMB / (GEN_X16[g] * LANE_SCALE[lanes] * pinnedFactor));
  const maxT = Math.max(BUDGET_MS * 1.4, ...times);
  const sx = (W - 120) / maxT;

  const budgetX = 70 + BUDGET_MS * sx;

  gens.forEach((g, i) => {
    const y = 30 + i * 46;
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    ctx.fillText('PCIe ' + g, 62, y + 11);
    const w = times[i] * sx;
    const over = times[i] > BUDGET_MS;
    ctx.fillStyle = over ? '#e0564b' : accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(70, y, Math.max(2, w), 22);
    ctx.globalAlpha = 1;
    ctx.fillStyle = text;
    ctx.textAlign = 'left';
    ctx.fillText(times[i].toFixed(1) + ' ms', 70 + Math.max(2, w) + 6, y + 11);
  });

  // 60fps 예산선
  ctx.strokeStyle = '#e0564b';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(budgetX, 18);
  ctx.lineTo(budgetX, H - 14);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#e0564b';
  ctx.textAlign = 'left';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('16.6ms (60fps 한 프레임)', budgetX + 4, H - 8);
}

/**
 * 위젯 — CPU↔GPU 전송 시간 계산기.
 * 전송 시간 = 데이터 크기 ÷ 유효 대역폭. PCIe 세대·레인 폭·pinned/pageable에 따라 달라지고,
 * 한 프레임 예산(16.6ms)을 넘으면 매 프레임 보내선 안 된다는 신호.
 */
export default function TransferCalculator() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [sizeMB, setSizeMB] = useState(256);
  const [lanes, setLanes] = useState('16');
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (ctx) draw(ctx, sizeMB, lanes, pinned);
  }, [sizeMB, lanes, pinned]);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas ref={ref} width={W} height={H} style={{ width: '100%', maxWidth: 540, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }} />
      </div>
      <ControlPanel>
        <Slider label="데이터 크기" value={sizeMB} min={16} max={2048} step={16} onChange={setSizeMB} unit=" MB" />
        <SelectControl label="레인 폭" value={lanes} options={LANE_OPTIONS} onChange={setLanes} />
        <ToggleControl label="pinned(page-locked) 메모리" checked={pinned} onChange={setPinned} />
      </ControlPanel>
      <figcaption>
        <strong>직접 해보세요:</strong> 전송 시간 = 크기 ÷ 대역폭입니다. PCIe 세대가 올라갈수록 대략
        2배씩 빨라집니다(gen3/4/5 x16 ≈ 15.75 / 31.5 / 63 GB/s, 방향당). <strong>pinned</strong>를 끄면
        pageable이 되어 드라이버가 임시 pinned 버퍼로 한 번 더 복사하므로 유효 대역폭이 크게 떨어집니다
        (절대값은 환경 의존). 막대가 빨간 점선(16.6ms)을 넘으면 그 데이터를 <em>매 프레임</em> 보내는
        설계는 60fps를 못 지킵니다 — 큰 정적 자원은 한 번만 올리고 GPU에 상주시켜야 합니다.
      </figcaption>
    </figure>
  );
}
