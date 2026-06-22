import { useEffect, useRef } from 'react';

const W = 380;
const H = 320;

interface Era {
  year: string;
  name: string;
  appShare: number; // 앱이 직접 관리하는(explicit) 비중 0..1
}

const ERAS: Era[] = [
  { year: '~1995', name: '고정 기능', appShare: 0.05 },
  { year: '~2001', name: '셰이더 등장', appShare: 0.1 },
  { year: '~2006', name: '통합+WDDM', appShare: 0.15 },
  { year: '~2011', name: '두꺼운 DX11', appShare: 0.2 },
  { year: "'13–16", name: 'explicit API', appShare: 0.8 },
  { year: '2018+', name: '현대', appShare: 0.85 },
];

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

export default function DriverEvolutionTimeline() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const text = cssVar('--text', '#222');
    const muted = cssVar('--muted', '#888');
    const accent = cssVar('--accent', '#3b82f6');
    const border = cssVar('--border', '#ccc');
    const surface = cssVar('--surface', '#eee');
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    // 세로 타임라인 축 (위→아래)
    const ax = 70;
    const y0 = 36;
    const y1 = H - 24;
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, y0);
    ctx.lineTo(ax, y1);
    ctx.stroke();

    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = text;
    ctx.textAlign = 'left';
    ctx.fillText('드라이버가 떠안는 일의 양 (시대별)', 14, 16);

    ERAS.forEach((e, i) => {
      const y = y0 + ((y1 - y0) * i) / (ERAS.length - 1);
      // 노드
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(ax, y, 5, 0, 7);
      ctx.fill();

      // 연도 라벨 (왼쪽)
      ctx.fillStyle = muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(e.year, ax - 12, y);

      // "앱이 직접 관리하는 비중" 막대 (오른쪽)
      const bx = ax + 14;
      const bw = W - bx - 14;
      const bh = 16;
      ctx.fillStyle = surface;
      ctx.fillRect(bx, y - bh / 2, bw, bh);
      ctx.fillStyle = accent;
      ctx.fillRect(bx, y - bh / 2, bw * e.appShare, bh);
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, y - bh / 2, bw, bh);

      // 시대 이름 (막대 위)
      ctx.fillStyle = text;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(e.name, bx + 4, y - bh / 2 - 8);
    });

    // 막대 범례
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = muted;
    ctx.textAlign = 'left';
    ctx.fillText('막대 = 앱이 직접 관리(explicit), 나머지 = 드라이버', 14, H - 8);
  }, []);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas ref={ref} style={{ width: '100%', maxWidth: W, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }} />
      </div>

      <figcaption>
        드라이버의 역할은 시대마다 크게 변했습니다. 막대는 <strong>앱이 직접 관리하는(explicit)</strong>
        비중이고, 나머지는 드라이버 몫입니다. 셰이더가 생기며(~2001) 드라이버는
        <strong>컴파일러를 품었고</strong>, DX11 시대(~2011)에 draw 시점마다 상태 검증·셰이더 패치까지
        떠안아 가장 <strong>두꺼워졌습니다</strong>. explicit API(DX12/Vulkan, 2013–16) 이후 PSO 사전
        컴파일·명령 버퍼 기록·레지던시 관리가 앱으로 넘어가 드라이버는 다시 <strong>얇아졌습니다</strong>.
        WDDM(2006)은 메모리·스케줄링을 OS로 끌어올렸고요.
      </figcaption>
    </figure>
  );
}
