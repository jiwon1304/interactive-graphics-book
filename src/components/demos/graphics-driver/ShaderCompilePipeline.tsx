import { useEffect, useRef } from 'react';

const W = 380;
const H = 420;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

interface Stage {
  title: string;
  sub: string;
  phase: 'offline' | 'runtime';
}

const STAGES: Stage[] = [
  { title: '셰이더 소스 (HLSL / GLSL)', sub: '사람이 작성', phase: 'offline' },
  { title: '프런트엔드 (dxc / glslang)', sub: '소스 → IR', phase: 'offline' },
  { title: 'IR (DXIL / SPIR-V)', sub: '앱에 포함되어 배포', phase: 'offline' },
  { title: '드라이버 백엔드 (IR → ISA)', sub: '캐시 미스 → JIT 컴파일 → 히치!', phase: 'runtime' },
  { title: 'GPU ISA (실제 기계어)', sub: 'GPU가 실행', phase: 'runtime' },
];

export default function ShaderCompilePipeline() {
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
    const surface = cssVar('--surface', '#f0f2f7');
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    const boxH = 42;
    const gap = 12;
    const x = 16;
    const bw = W - 32;
    let y = 14;

    STAGES.forEach((s, i) => {
      const isBackend = i === 3;
      // 오프라인/런타임 경계선
      if (i === 3) {
        const dy = y - gap / 2;
        ctx.strokeStyle = muted;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, dy);
        ctx.lineTo(x + bw, dy);
        ctx.stroke();
        ctx.setLineDash([]);
        const lbl = '─ 오프라인 ↑ / 런타임 ↓ ─';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(lbl).width;
        ctx.fillStyle = surface;
        ctx.fillRect(x + bw / 2 - tw / 2 - 4, dy - 8, tw + 8, 16);
        ctx.fillStyle = muted;
        ctx.fillText(lbl, x + bw / 2, dy);
      }

      // 박스 (캐시 미스 상태: 백엔드는 붉은 강조)
      let fill = surface;
      let stroke = border;
      if (isBackend) {
        fill = 'rgba(224,86,75,0.15)';
        stroke = '#e0564b';
      } else if (s.phase === 'offline') {
        stroke = accent;
      }
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, bw, boxH);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isBackend ? 2 : 1;
      ctx.strokeRect(x, y, bw, boxH);

      ctx.fillStyle = text;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(s.title, x + 10, y + 16);
      ctx.fillStyle = isBackend ? '#e0564b' : muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(s.sub, x + 10, y + 31);

      // 화살표
      if (i < STAGES.length - 1) {
        ctx.strokeStyle = muted;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + bw / 2, y + boxH);
        ctx.lineTo(x + bw / 2, y + boxH + gap);
        ctx.stroke();
      }
      y += boxH + gap;
    });

    // 프레임 타임 막대 (아래쪽, 가로로 흐름)
    const py = y + 10;
    ctx.fillStyle = muted;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('프레임 타임 (캐시 미스 시)', x, py - 4);

    const fy = py + 14;
    const fh = 26;
    const slot = (bw - 12) / 6;
    // 정상 프레임 3개
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x + k * slot, fy, slot - 4, fh);
      ctx.globalAlpha = 1;
    }
    // 히치 프레임 (넓게)
    const hx = x + 3 * slot;
    const hw = slot * 2 - 4;
    ctx.fillStyle = '#e0564b';
    ctx.fillRect(hx, fy, hw, fh);
    ctx.fillStyle = '#fff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('히치', hx + hw / 2, fy + fh / 2);
    // 회복 프레임
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x + 5 * slot, fy, slot - 4, fh);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#e0564b';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('뚝! — JIT 컴파일이 프레임 중에 끼어듦', x, fy + fh + 14);
  }, []);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas ref={ref} style={{ width: '100%', maxWidth: W, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }} />
      </div>

      <figcaption>
        셰이더는 오프라인에서 <strong>소스 → IR(DXIL/SPIR-V)</strong>까지 컴파일돼 앱에 담겨 배포되지만,
        IR을 그 GPU의 실제 기계어(ISA)로 바꾸는 <strong>드라이버 백엔드 컴파일은 런타임</strong>에
        일어납니다. 그림은 <strong>캐시 미스</strong> 상황입니다 — 그 셰이더를 처음 쓰는 순간 캐시에 없어
        JIT 컴파일이 프레임 중에 끼어들어 <strong>히치(stutter)</strong>가 납니다. 두 번째부터는
        <strong>셰이더/PSO 캐시</strong>에 적중해 즉시 로드되어 매끈해지고, 그래서 엔진이 로딩 화면에서
        셰이더를 미리 워밍업합니다.
      </figcaption>
    </figure>
  );
}
