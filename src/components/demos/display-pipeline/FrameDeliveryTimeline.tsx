import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, SelectControl, type SelectOption } from '../../controls';

type Mode = 'off' | 'double' | 'triple' | 'vrr';

const MODE_OPTIONS: ReadonlyArray<SelectOption<Mode>> = [
  { value: 'off', label: 'VSync OFF (즉시 교체)' },
  { value: 'double', label: '더블 버퍼 + VSync' },
  { value: 'triple', label: '트리플 버퍼 + VSync' },
  { value: 'vrr', label: 'VRR (가변 새로고침)' },
];

const W = 560;
const H = 220;
const T = 0.18; // 보여줄 시간 창(초)
const VRR_MIN = 48; // VRR 하한(Hz) — 아래로 내려가면 LFC

const frameColor = (i: number) => `hsl(${(i * 53) % 360} 68% 56%)`;

interface Seg {
  t0: number;
  t1: number;
  frame: number;
  kind: 'show' | 'repeat' | 'tear';
}

function compute(mode: Mode, renderFps: number, refreshHz: number) {
  const tRender = 1 / renderFps;
  const tRefresh = 1 / refreshHz;
  const refreshes: number[] = [];
  for (let m = 0; m * tRefresh <= T + 1e-9; m++) refreshes.push(m * tRefresh);
  const renders: number[] = [];
  for (let k = 0; k * tRender <= T + 1e-9; k++) renders.push(k * tRender);

  const segs: Seg[] = [];
  let shown = 0,
    repeats = 0,
    drops = 0,
    tears = 0;

  if (mode === 'vrr') {
    // 디스플레이가 프레임 완성 시점에 새로고침(범위 안). 느리면 LFC로 한 번 더.
    for (let k = 0; k < renders.length; k++) {
      const t0 = renders[k];
      const t1 = Math.min(T, t0 + tRender);
      if (t1 <= t0) break;
      // LFC: 렌더 간격이 1/VRR_MIN 보다 길면 가운데서 한 번 복제 새로고침
      if (tRender > 1 / VRR_MIN) {
        const mid = (t0 + t1) / 2;
        segs.push({ t0, t1: mid, frame: k, kind: 'show' });
        segs.push({ t0: mid, t1, frame: k, kind: 'repeat' });
        shown++;
        repeats++;
      } else {
        segs.push({ t0, t1, frame: k, kind: 'show' });
        shown++;
      }
    }
    return { segs, refreshes: [], renders, stats: { shown, repeats, drops, tears }, vrr: true };
  }

  for (let m = 0; m < refreshes.length - 1; m++) {
    const r0 = refreshes[m];
    const r1 = refreshes[m + 1];
    if (mode === 'off') {
      // 새로고침 구간 안에서 렌더 완성마다 교체 → 테어
      const inside = renders.filter((c) => c > r0 + 1e-6 && c < r1 - 1e-6);
      let cursor = r0;
      let f = Math.floor(r0 / tRender + 1e-6);
      for (const c of inside) {
        segs.push({ t0: cursor, t1: c, frame: f, kind: 'show' });
        cursor = c;
        f = Math.floor(c / tRender + 1e-6);
        tears++;
        segs.push({ t0: c, t1: c, frame: f, kind: 'tear' });
      }
      segs.push({ t0: cursor, t1: r1, frame: f, kind: 'show' });
      shown++;
    }
  }

  if (mode === 'double') {
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
  }

  if (mode === 'triple') {
    let displayed = -1;
    for (let m = 0; m < refreshes.length - 1; m++) {
      const r0 = refreshes[m];
      const latest = Math.floor(r0 / tRender + 1e-6);
      let kind: Seg['kind'] = 'repeat';
      if (latest > displayed) {
        drops += latest - displayed - 1; // 따라잡으며 버려진 프레임
        displayed = latest;
        shown++;
        kind = 'show';
      } else repeats++;
      segs.push({ t0: r0, t1: refreshes[m + 1], frame: Math.max(0, displayed), kind });
    }
  }

  return { segs, refreshes, renders, stats: { shown, repeats, drops, tears }, vrr: false };
}

function cssVar(name: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
}

function draw(ctx: CanvasRenderingContext2D, mode: Mode, renderFps: number, refreshHz: number) {
  const { segs, refreshes, renders, stats, vrr } = compute(mode, renderFps, refreshHz);
  const sx = W / T;
  const text = cssVar('--text', '#222');
  const muted = cssVar('--muted', '#888');
  const border = cssVar('--border', '#ccc');

  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  ctx.font = '11px system-ui, sans-serif';

  const renderY = 34;
  const dispY = 110;
  const laneH = 40;

  // 라벨
  ctx.fillStyle = muted;
  ctx.textAlign = 'left';
  ctx.fillText('렌더(GPU 완성)', 4, renderY - 26);
  ctx.fillText('디스플레이(보이는 것)', 4, dispY - 26);

  // 렌더 프레임 블록
  const tRender = 1 / renderFps;
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

  // 디스플레이 세그먼트
  for (const s of segs) {
    if (s.kind === 'tear') {
      const x = s.t0 * sx;
      ctx.strokeStyle = '#e0564b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, dispY - 4);
      ctx.lineTo(x, dispY + laneH + 4);
      ctx.stroke();
      continue;
    }
    const x = s.t0 * sx;
    const w = (s.t1 - s.t0) * sx;
    ctx.fillStyle = frameColor(s.frame);
    ctx.globalAlpha = s.kind === 'repeat' ? 0.28 : 0.8;
    ctx.fillRect(x, dispY, Math.max(1, w - 1), laneH);
    ctx.globalAlpha = 1;
    if (w > 16) {
      ctx.fillStyle = text;
      ctx.fillText((s.kind === 'repeat' ? '↻f' : 'f') + s.frame, x + 4, dispY + laneH / 2);
    }
  }

  // 새로고침 tick(vblank) — VRR는 렌더 완성에 맞춰지므로 생략
  if (!vrr) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    for (const r of refreshes) {
      const x = r * sx;
      ctx.beginPath();
      ctx.moveTo(x, dispY + laneH + 2);
      ctx.lineTo(x, dispY + laneH + 12);
      ctx.stroke();
    }
    ctx.fillStyle = muted;
    ctx.textAlign = 'left';
    ctx.fillText('▲ vblank (' + refreshHz + 'Hz)', 4, dispY + laneH + 22);
  } else {
    ctx.fillStyle = muted;
    ctx.textAlign = 'left';
    ctx.fillText('새로고침이 렌더 완성에 맞춰 변동' + (renderFps < VRR_MIN ? ' · LFC 작동(하한 ' + VRR_MIN + 'Hz)' : ''), 4, dispY + laneH + 18);
  }

  // 통계
  ctx.fillStyle = text;
  ctx.textAlign = 'left';
  const parts = [`표시 ${stats.shown}`];
  if (stats.repeats) parts.push(`반복 ${stats.repeats}`);
  if (stats.drops) parts.push(`드롭 ${stats.drops}`);
  if (stats.tears) parts.push(`테어 ${stats.tears}`);
  ctx.fillText(parts.join(' · '), 4, H - 12);
  void renders;
}

/**
 * 위젯 — 프레임 전달 타임라인.
 * 렌더 완성(위)과 실제로 화면에 보이는 것(아래)을 한 시간창에서 비교. 모드마다 vblank에서의 교체
 * 규칙이 달라 테어/반복(저더)/드롭/지연이 달라진다. VRR은 vblank를 렌더에 맞춰 움직인다.
 */
export default function FrameDeliveryTimeline() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<Mode>('double');
  const [renderFps, setRenderFps] = useState(45);
  const [refreshHz, setRefreshHz] = useState(60);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    draw(ctx, mode, renderFps, refreshHz);
  }, [mode, renderFps, refreshHz]);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{ width: '100%', maxWidth: 560, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}
        />
      </div>

      <ControlPanel>
        <SelectControl label="모드" value={mode} options={MODE_OPTIONS} onChange={setMode} />
        <Slider label="렌더 fps" value={renderFps} min={20} max={144} step={1} onChange={setRenderFps} unit=" fps" />
        <Slider label="새로고침" value={refreshHz} min={48} max={165} step={1} onChange={setRefreshHz} unit=" Hz" />
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 렌더 fps를 새로고침보다 낮춰 보세요(예: 45fps / 60Hz).
        <em>더블 버퍼</em>는 vblank마다 새 프레임이 없으면 같은 프레임을 반복(↻)해 저더가 생기고, 렌더가
        새로고침보다 빠르면 새로고침 속도로 묶입니다. <em>트리플 버퍼</em>는 렌더를 멈추지 않아(빠를 때
        프레임을 드롭) 더 매끈하고 지연이 줄지만, 느릴 때의 반복은 여전합니다. <em>VSync OFF</em>는 즉시
        교체해 지연이 최소지만 테어(빨간 선)가 생깁니다. <em>VRR</em>은 vblank를 렌더에 맞춰 움직여
        반복·테어 없이 매끈합니다(단, 하한 아래로 떨어지면 LFC가 프레임을 복제).
      </figcaption>
    </figure>
  );
}
