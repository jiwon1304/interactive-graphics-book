import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';

const W = 480;
const H = 300;
const REFRESH = 60; // 디스플레이 새로고침(Hz)
const TIME_SCALE = 0.16; // 실제보다 느리게 돌려 테어링이 눈에 보이게
const CROSS_REFRESHES = 7; // 막대가 화면을 가로지르는 데 걸리는 새로고침 수
const BAR_W = 26;

// CSS 변수에서 실제 색을 읽어 캔버스에 쓰기(테마 적응)
function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

interface Props {
  vsync: boolean;
  renderFps: number;
  showBeam: boolean;
}

function draw(ctx: CanvasRenderingContext2D, simTime: number, p: Props) {
  const tRefresh = 1 / REFRESH;
  const tRender = 1 / p.renderFps;
  const pxPerSec = (W * REFRESH) / CROSS_REFRESHES;
  const barAt = (t: number) => ((t * pxPerSec) % (W + BAR_W)) - BAR_W / 2;

  const bg = cssVar('--surface', '#f0f2f7');
  const bar = cssVar('--accent', '#3b82f6');
  const tearMark = '#e0564b';

  const cycleStart = Math.floor(simTime / tRefresh) * tRefresh;

  ctx.clearRect(0, 0, W, H);
  // 스캔라인 밴드별로: 그 라인이 스캔될 때 보이던 프레임의 막대 위치
  let prevFrame = -1;
  for (let y = 0; y < H; y++) {
    const tLine = cycleStart + (y / H) * tRefresh;
    // vsync ON: 프레임은 vblank(사이클 시작)에 래치됨 → 전 라인이 같은 프레임
    // vsync OFF: 라인이 스캔되는 순간의 최신 프레임
    const frame = p.vsync
      ? Math.floor(cycleStart / tRender)
      : Math.floor(tLine / tRender);
    const x = barAt(frame * tRender);

    ctx.fillStyle = bg;
    ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = bar;
    ctx.fillRect(x, y, BAR_W, 1);

    // 프레임이 바뀐 경계 = 테어 라인 표시(vsync off에서만 발생)
    if (prevFrame !== -1 && frame !== prevFrame) {
      ctx.fillStyle = tearMark;
      ctx.fillRect(0, y, W, 1);
    }
    prevFrame = frame;
  }

  // 스캔아웃 빔(현재 새로고침 안에서의 위치)
  if (p.showBeam) {
    const beamY = ((simTime % tRefresh) / tRefresh) * H;
    ctx.fillStyle = 'rgba(240,200,60,0.85)';
    ctx.fillRect(0, beamY - 1, W, 2);
  }
}

/**
 * 위젯 — 스캔아웃과 테어링.
 * 디스플레이는 프레임버퍼를 위→아래로 한 줄씩 읽어 보낸다(스캔아웃). 그 도중에 버퍼가 새 프레임으로
 * 바뀌면(vsync off), 빔이 지나간 위는 옛 프레임, 아래는 새 프레임이 되어 막대가 끊긴다(테어).
 * vsync on이면 교체가 vblank에서만 일어나 한 프레임이 통째로 스캔되므로 테어가 없다.
 */
export default function ScanoutTearing() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [vsync, setVsync] = useState(false);
  const [renderFps, setRenderFps] = useState(75);
  const [showBeam, setShowBeam] = useState(true);
  const props = useRef<Props>({ vsync, renderFps, showBeam });
  props.current = { vsync, renderFps, showBeam };

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let simTime = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      simTime += dt * TIME_SCALE;
      draw(ctx, simTime, props.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{
            width: '100%',
            maxWidth: 480,
            height: 'auto',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        />
      </div>

      <ControlPanel>
        <ToggleControl label="VSync (vblank에서만 교체)" checked={vsync} onChange={setVsync} />
        <Slider
          label="렌더 fps"
          value={renderFps}
          min={20}
          max={144}
          step={1}
          onChange={setRenderFps}
          unit=" fps"
        />
        <ToggleControl label="스캔아웃 빔 보기" checked={showBeam} onChange={setShowBeam} />
        <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: 0 }}>
          디스플레이 새로고침: {REFRESH}Hz · 빨간 선 = 테어(프레임 경계)
        </p>
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> VSync를 끄면 막대가 가로로 끊겨 어긋납니다 — 빨간 선이 스캔아웃
        도중 프레임이 교체된 <em>테어 라인</em>입니다. 렌더 fps가 새로고침(60Hz)과 어긋날수록 테어가
        많아집니다. VSync를 켜면 교체가 vblank에서만 일어나 막대가 한 덩어리로 깔끔해집니다(대신
        렌더가 60을 못 맞추면 같은 프레임이 반복돼 끊겨 보입니다 — 다음 데모).
      </figcaption>
    </figure>
  );
}
