import { useEffect, useRef } from 'react';

// 정적 도식 — 스캔아웃과 테어링.
// 디스플레이는 프레임버퍼를 위→아래로 한 줄씩 읽어 보낸다(스캔아웃). 그 도중에 버퍼가 새 프레임으로
// 바뀌면(vsync off) 빔이 지나간 위는 옛 프레임, 아래는 새 프레임이 되어 막대가 끊긴다(테어).
// 대표로 vsync OFF의 한 순간을 정지 화면으로 그린다 — 두어 줄의 테어가 보이는 한 컷. 설명은 figcaption.

const W = 380;
const H = 280;
const REFRESH = 60;
const RENDER_FPS = 75; // 새로고침과 어긋나 테어가 생기는 값
const CROSS_REFRESHES = 7;
const BAR_W = 24;
const FROZEN_TIME = 0.0123; // 정지시킬 시뮬레이션 시각(테어 라인이 잘 보이는 순간)

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function draw(ctx: CanvasRenderingContext2D) {
  const tRefresh = 1 / REFRESH;
  const tRender = 1 / RENDER_FPS;
  const pxPerSec = (W * REFRESH) / CROSS_REFRESHES;
  const barAt = (t: number) => ((t * pxPerSec) % (W + BAR_W)) - BAR_W / 2;

  const bg = cssVar('--surface', '#f0f2f7');
  const bar = cssVar('--accent', '#3b82f6');
  const tearMark = '#e0564b';

  const simTime = FROZEN_TIME;
  const cycleStart = Math.floor(simTime / tRefresh) * tRefresh;

  ctx.clearRect(0, 0, W, H);
  let prevFrame = -1;
  for (let y = 0; y < H; y++) {
    const tLine = cycleStart + (y / H) * tRefresh;
    // vsync OFF: 라인이 스캔되는 순간의 최신 프레임.
    const frame = Math.floor(tLine / tRender);
    const x = barAt(frame * tRender);

    ctx.fillStyle = bg;
    ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = bar;
    ctx.fillRect(x, y, BAR_W, 1);

    // 프레임이 바뀐 경계 = 테어 라인.
    if (prevFrame !== -1 && frame !== prevFrame) {
      ctx.fillStyle = tearMark;
      ctx.fillRect(0, y, W, 1);
    }
    prevFrame = frame;
  }

  // 라벨
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = tearMark;
  ctx.textBaseline = 'top';
  ctx.fillText('← 테어 라인 (프레임 경계)', 8, 8);
  ctx.fillStyle = cssVar('--muted', '#888');
  ctx.fillText(`VSync OFF · ${RENDER_FPS}fps / ${REFRESH}Hz`, 8, H - 20);
}

export default function ScanoutTearing() {
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
          style={{
            width: '100%',
            maxWidth: W,
            height: 'auto',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        />
      </div>

      <figcaption>
        디스플레이는 프레임버퍼를 위에서 아래로 한 줄씩 읽어 내보냅니다(스캔아웃). VSync가 꺼져 있으면
        프레임 교체가 vblank를 기다리지 않고 스캔아웃 <em>도중</em>에도 일어나, 빔이 이미 지나간 위쪽은
        옛 프레임, 아래쪽은 새 프레임이 됩니다 — 그 경계가 빨간 <strong>테어 라인</strong>이고, 가로
        막대가 그 자리에서 끊겨 어긋납니다. 렌더 fps가 새로고침(60Hz)과 어긋날수록 한 화면 안에 테어가
        여러 줄 생깁니다. VSync를 켜면 교체가 vblank에서만 일어나 한 프레임이 통째로 스캔되므로 테어가
        사라집니다(대신 렌더가 60을 못 맞추면 같은 프레임이 반복돼 끊겨 보입니다 — 앞 그림의 저더).
      </figcaption>
    </figure>
  );
}
