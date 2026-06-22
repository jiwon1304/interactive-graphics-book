import { useEffect, useRef, useState } from 'react';
import { ControlPanel, ToggleControl } from '../../controls';

const W = 540;
const H = 360;

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
  { title: '프런트엔드 컴파일러 (dxc / glslang)', sub: '소스 → IR', phase: 'offline' },
  { title: '중간 표현 IR (DXIL / SPIR-V)', sub: '앱에 포함되어 배포', phase: 'offline' },
  { title: '드라이버 백엔드 (IR → GPU ISA)', sub: '런타임 · 캐시 대상', phase: 'runtime' },
  { title: 'GPU ISA (실제 기계어)', sub: 'GPU가 실행', phase: 'runtime' },
];

export default function ShaderCompilePipeline() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [cacheHit, setCacheHit] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const text = cssVar('--text', '#222');
    const muted = cssVar('--muted', '#888');
    const accent = cssVar('--accent', '#3b82f6');
    const border = cssVar('--border', '#ccc');
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    const boxH = 42;
    const gap = 12;
    const x = 30;
    const bw = W - 200;
    let y = 16;

    STAGES.forEach((s, i) => {
      const isBackend = i === 3;
      // 오프라인/런타임 경계 (파이프라인 컬럼 위에만)
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
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(lbl).width;
        ctx.fillStyle = cssVar('--surface', '#f0f2f7');
        ctx.fillRect(x + bw / 2 - tw / 2 - 4, dy - 7, tw + 8, 14);
        ctx.fillStyle = muted;
        ctx.fillText(lbl, x + bw / 2, dy);
      }

      // 박스
      let fill = cssVar('--surface', '#f0f2f7');
      let stroke = border;
      if (isBackend) {
        fill = cacheHit ? 'rgba(46,158,91,0.15)' : 'rgba(224,86,75,0.15)';
        stroke = cacheHit ? '#2e9e5b' : '#e0564b';
      } else if (s.phase === 'offline') {
        stroke = accent;
      }
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, bw, boxH);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isBackend ? 2 : 1;
      ctx.strokeRect(x, y, bw, boxH);

      ctx.fillStyle = text;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(s.title, x + 10, y + 16);
      ctx.fillStyle = muted;
      ctx.font = '10px system-ui, sans-serif';
      let sub = s.sub;
      if (isBackend) sub = cacheHit ? '캐시 적중 → 즉시 로드' : 'JIT 컴파일 → 프레임 히치!';
      ctx.fillText(sub, x + 10, y + 31);

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

    // 프레임 타임 막대(오른쪽)
    const px = x + bw + 24;
    const pw = W - px - 16;
    const py = 70;
    const ph = 150;
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('프레임 타임', px, py - 14);
    // 정상 프레임 블록들
    const normalH = 18;
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(px, py + k * (normalH + 4), pw, normalH);
      ctx.globalAlpha = 1;
    }
    // 미스 시 히치 프레임
    if (!cacheHit) {
      ctx.fillStyle = '#e0564b';
      ctx.fillRect(px, py + 3 * (normalH + 4), pw, ph - 3 * (normalH + 4));
      ctx.fillStyle = '#fff';
      ctx.font = '10px system-ui, sans-serif';
      ctx.save();
      ctx.translate(px + pw / 2, py + 3 * (normalH + 4) + 40);
      ctx.textAlign = 'center';
      ctx.fillText('히치', 0, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(px, py + 3 * (normalH + 4), pw, normalH);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = cacheHit ? '#2e9e5b' : '#e0564b';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(cacheHit ? '매끈' : '뚝!', px, py + ph + 14);
  }, [cacheHit]);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas ref={ref} width={W} height={H} style={{ width: '100%', maxWidth: 540, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }} />
      </div>

      <ControlPanel>
        <ToggleControl label="셰이더/PSO 캐시 적중" checked={cacheHit} onChange={setCacheHit} />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 셰이더는 오프라인에서 <strong>소스 → IR(DXIL/SPIR-V)</strong>까지
        컴파일돼 앱에 담겨 배포되지만, IR을 그 GPU의 실제 기계어(ISA)로 바꾸는 <strong>드라이버 백엔드
        컴파일은 런타임</strong>에 일어납니다. 그 셰이더를 처음 쓰는 순간 캐시에 없으면(<em>미스</em>)
        JIT 컴파일이 프레임 중에 끼어들어 <strong>히치(stutter)</strong>가 납니다. 두 번째부터는
        <strong>셰이더/PSO 캐시</strong>에 적중해 즉시 로드되어 매끈합니다 — 그래서 엔진이 로딩 화면에서
        셰이더를 미리 워밍업합니다.
      </figcaption>
    </figure>
  );
}
