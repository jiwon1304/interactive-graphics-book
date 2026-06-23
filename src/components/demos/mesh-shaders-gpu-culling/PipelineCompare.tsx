import { useEffect, useRef } from 'react';

// 정적 도식 — 전통 지오메트리 파이프라인 vs mesh shader 파이프라인 비교(세로 스택 두 컬럼).
// 위: IA → VS → (HS → Tess → DS) → GS → Rasterizer. 아래: Amplification → Mesh → Rasterizer.
// 핵심: 고정기능 IA/Tessellator/GS가 사라지고 compute式 두 단계로 단순화.

const W = 380;
const H = 340;

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const accent = cssVar('--accent', '#3b82f6');
  const border = cssVar('--border', '#ccc');
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  function flow(title: string, y0: number, stages: { t: string; fixed: boolean; prog?: boolean }[]) {
    ctx.fillStyle = text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 12, y0);

    const bx = 12;
    const bw = W - 24;
    let y = y0 + 14;
    const bh = 26;
    const vgap = 8;
    stages.forEach((s, i) => {
      // 색: programmable=accent, fixed-function=muted 박스
      ctx.fillStyle = s.fixed ? cssVar('--surface', '#fff') : accent;
      ctx.globalAlpha = s.fixed ? 1 : 0.22;
      ctx.fillRect(bx, y, bw, bh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.fixed ? border : accent;
      ctx.setLineDash(s.fixed ? [4, 3] : []);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(bx, y, bw, bh);
      ctx.setLineDash([]);

      ctx.fillStyle = text;
      ctx.font = `${s.prog ? 'bold ' : ''}12px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(s.t, bx + 10, y + bh / 2);
      // 표식: 고정기능 vs 프로그래머블
      ctx.fillStyle = muted;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(s.fixed ? '고정기능' : 'programmable', bx + bw - 8, y + bh / 2);

      if (i < stages.length - 1) {
        ctx.strokeStyle = muted;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bx + bw / 2, y + bh);
        ctx.lineTo(bx + bw / 2, y + bh + vgap);
        ctx.stroke();
      }
      y += bh + vgap;
    });
    return y;
  }

  const yA = flow('전통: IA + VS/HS/DS/GS', 16, [
    { t: 'Input Assembler', fixed: true },
    { t: 'Vertex / Hull / Domain / Geometry', fixed: false },
    { t: 'Tessellator', fixed: true },
    { t: 'Rasterizer', fixed: true },
  ]);

  // 구분선
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(12, yA + 4);
  ctx.lineTo(W - 12, yA + 4);
  ctx.stroke();

  flow('mesh 파이프라인', yA + 18, [
    { t: 'Amplification (task) shader', fixed: false, prog: true },
    { t: 'Mesh shader', fixed: false, prog: true },
    { t: 'Rasterizer', fixed: true },
  ]);
}

export default function PipelineCompare() {
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
        위는 전통 지오메트리 파이프라인입니다 — 고정기능 <strong>Input Assembler</strong>가 정점을
        끌어오고, VS 뒤에 tessellation(HS·Tessellator·DS)과 Geometry Shader가 선택적으로 붙습니다.
        이 단계들은 입출력 형태가 정해져 있어 유연하지 못했고(특히 GS는 거의 항상 느렸습니다). 아래는
        mesh 파이프라인입니다 — IA·Tessellator·GS가 통째로 사라지고, compute처럼 동작하는
        <strong> amplification shader</strong>(몇 개를 그릴지·컬링/LOD 결정)와 <strong>mesh shader</strong>
        (meshlet의 정점·삼각형을 직접 출력) 두 단계로 단순해집니다. 워크그룹·groupshared 메모리를 쓰는
        compute 모델이라 개발자가 지오메트리 생성을 자유롭게 짤 수 있습니다.
      </figcaption>
    </figure>
  );
}
