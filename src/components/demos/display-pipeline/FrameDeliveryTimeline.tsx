import { useEffect, useRef } from 'react';

// 정적 도식 — 프레임 전달 타임라인.
// 렌더 완성(위)과 실제로 화면에 보이는 것(아래)을 한 시간창에서 비교한다.
// 대표 상태: 더블 버퍼 + VSync, 45fps 렌더 / 60Hz 새로고침 — vblank마다 새 프레임이 없으면
// 같은 프레임을 반복(↻)해 저더가 생기는 전형. 다른 모드(VSync OFF·트리플·VRR)는 figcaption.

const W = 380;
const H = 200;
const T = 0.18; // 시간 창(초)
const RENDER_FPS = 45;
const REFRESH_HZ = 60;

const frameColor = (i: number) => `hsl(${(i * 53) % 360} 68% 56%)`;

interface Seg {
  t0: number;
  t1: number;
  frame: number;
  kind: 'show' | 'repeat';
}

function compute() {
  const tRender = 1 / RENDER_FPS;
  const tRefresh = 1 / REFRESH_HZ;
  const refreshes: number[] = [];
  for (let m = 0; m * tRefresh <= T + 1e-9; m++) refreshes.push(m * tRefresh);

  const segs: Seg[] = [];
  let shown = 0,
    repeats = 0;
  let displayed = -1;
  for (let m = 0; m < refreshes.length - 1; m++) {
    const r0 = refreshes[m];
    const ready = Math.floor(r0 / tRender + 1e-6) > displayed; // 더블버퍼: 새로고침당 최대 +1
    if (ready) {
      displayed += 1;
      shown++;
    } else repeats++;
    segs.push({ t0: r0, t1: refreshes[m + 1], frame: Math.max(0, displayed), kind: ready ? 'show' : 'repeat' });
  }
  return { segs, refreshes, stats: { shown, repeats } };
}

function cssVar(name: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D) {
  const { segs, refreshes, stats } = compute();
  const sx = W / T;
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const border = cssVar('--border', '#ccc');

  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.font = '12px system-ui, sans-serif';

  const renderY = 36;
  const dispY = 108;
  const laneH = 40;

  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText('렌더(GPU 완성)', 4, renderY - 14);
  ctx.fillText('디스플레이(보이는 것)', 4, dispY - 14);

  const tRender = 1 / RENDER_FPS;
  for (let k = 0; k * tRender < T; k++) {
    const x = k * tRender * sx;
    const w = Math.min(T, (k + 1) * tRender) * sx - x;
    ctx.fillStyle = frameColor(k);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, renderY, Math.max(1, w - 1), laneH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = text;
    if (w > 16) ctx.fillText('f' + k, x + 4, renderY + laneH / 2);
  }

  for (const s of segs) {
    const x = s.t0 * sx;
    const w = (s.t1 - s.t0) * sx;
    ctx.fillStyle = frameColor(s.frame);
    ctx.globalAlpha = s.kind === 'repeat' ? 0.28 : 0.8;
    ctx.fillRect(x, dispY, Math.max(1, w - 1), laneH);
    ctx.globalAlpha = 1;
    if (w > 14) {
      ctx.fillStyle = text;
      ctx.fillText((s.kind === 'repeat' ? '↻' : 'f') + s.frame, x + 3, dispY + laneH / 2);
    }
  }

  // vblank tick
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  for (const r of refreshes) {
    const x = r * sx;
    ctx.beginPath();
    ctx.moveTo(x, dispY + laneH + 2);
    ctx.lineTo(x, dispY + laneH + 10);
    ctx.stroke();
  }
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText('▲ vblank (' + REFRESH_HZ + 'Hz)', 4, dispY + laneH + 20);

  ctx.fillStyle = text;
  ctx.fillText(`더블 버퍼 · ${RENDER_FPS}fps / ${REFRESH_HZ}Hz — 표시 ${stats.shown} · 반복 ${stats.repeats}`, 4, H - 12);
}

export default function FrameDeliveryTimeline() {
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
        위 줄은 GPU가 프레임을 완성한 시점, 아래 줄은 실제로 화면에 보이는 것입니다. 여기 그린{' '}
        <strong>더블 버퍼 + VSync</strong>는 vblank(▲)마다 새 프레임이 준비됐으면 교체하고, 없으면 같은
        프레임을 <strong>반복(↻)</strong>합니다 — 45fps 렌더가 60Hz를 못 채워 곳곳에서 같은 프레임이
        반복되며 <em>저더</em>가 생깁니다. <em>트리플 버퍼</em>는 렌더를 멈추지 않아(빠를 때 프레임을
        드롭) 더 매끈하고 지연이 줄지만 느릴 때의 반복은 여전합니다. <em>VSync OFF</em>는 vblank를
        기다리지 않고 즉시 교체해 지연이 최소지만 스캔아웃 도중 프레임이 바뀌어 테어가 생깁니다.{' '}
        <em>VRR</em>은 vblank를 렌더 완성에 맞춰 움직여 반복·테어 없이 매끈합니다(단, 새로고침 하한 아래로
        떨어지면 LFC가 프레임을 복제).
      </figcaption>
    </figure>
  );
}
