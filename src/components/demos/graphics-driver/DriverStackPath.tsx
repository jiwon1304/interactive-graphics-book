import { useEffect, useRef } from 'react';

const W = 380;
const H = 320;

interface Layer {
  key: string;
  name: string;
  note: string;
}

const LAYERS: Layer[] = [
  { key: 'app', name: '앱 + API 런타임 (D3D / GL / Vulkan)', note: '그리기 명령 호출 · 인자 검증' },
  { key: 'umd', name: 'UMD — 유저 모드 드라이버', note: '⚙ 셰이더 컴파일 + 상태 검증 (draw 시점, 무거움)' },
  { key: 'kmd', name: 'KMD — 커널 모드 드라이버', note: '명령 제출 · 스케줄링 · VRAM 관리 (커널)' },
  { key: 'gpu', name: 'GPU', note: '받은 명령을 실행' },
];

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

export default function DriverStackPath() {
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

    const muted = cssVar('--muted', '#888');
    const accent = cssVar('--accent', '#3b82f6');
    const text = cssVar('--text', '#222');
    const border = cssVar('--border', '#ccc');
    const surface = cssVar('--surface', '#f0f2f7');
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    const bandH = H / LAYERS.length;

    LAYERS.forEach((L, i) => {
      const y = i * bandH;
      const isUmd = L.key === 'umd';
      ctx.fillStyle = isUmd ? accent : surface;
      ctx.globalAlpha = isUmd ? 0.16 : 1;
      ctx.fillRect(8, y + 4, W - 16, bandH - 8);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isUmd ? accent : border;
      ctx.lineWidth = isUmd ? 2 : 1;
      ctx.strokeRect(8, y + 4, W - 16, bandH - 8);

      ctx.fillStyle = text;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(L.name, 18, y + bandH / 2 - 9);

      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = isUmd ? '#e0564b' : muted;
      ctx.fillText(L.note, 18, y + bandH / 2 + 11);
    });

    // 드로우콜이 위→아래로 내려가는 경로 (정적 화살표)
    const px = W - 28;
    for (let i = 0; i < LAYERS.length - 1; i++) {
      const ya = (i + 1) * bandH - 8;
      const yb = (i + 1) * bandH + 8;
      ctx.strokeStyle = '#f0a500';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, ya);
      ctx.lineTo(px, yb);
      ctx.stroke();
      // 화살촉
      ctx.fillStyle = '#f0a500';
      ctx.beginPath();
      ctx.moveTo(px, yb + 4);
      ctx.lineTo(px - 4, yb - 2);
      ctx.lineTo(px + 4, yb - 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f0a500';
    ctx.beginPath();
    ctx.arc(px, 14, 6, 0, 7);
    ctx.fill();
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('draw call', px - 12, 14);
  }, []);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas ref={ref} style={{ width: '100%', maxWidth: W, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }} />
      </div>

      <figcaption>
        드로우콜은 앱 → <strong>UMD(유저 모드 드라이버)</strong> → <strong>KMD(커널 모드 드라이버)</strong>
        → GPU로 내려갑니다(주황 경로). 두꺼운 드라이버(D3D11/OpenGL)에서는 강조된
        <strong>UMD</strong>가 draw 시점에 상태 검증·셰이더 컴파일까지 떠안아 CPU 부담이 큽니다. UMD는 앱
        프로세스 안에서 돌아 크래시해도 앱만 죽지만, KMD는 커널 권한이라 크래시가 TDR/블루스크린으로
        이어집니다. explicit API(D3D12/Vulkan)에서는 그 무거운 일이 앱의 <strong>PSO 사전 컴파일</strong>로
        옮겨가 UMD가 얇아지고 드로우콜이 싸지는 대신 책임이 앱으로 넘어옵니다.
      </figcaption>
    </figure>
  );
}
