import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlPanel, ToggleControl } from '../../controls';
import { mulberry32, randomSeed, cssVar, setupCanvas } from './prng';

/**
 * 위젯 1 — 다트로 π 추정하기.
 *
 * 단위 정사각형 [0,1]²에 다트를 무작위로 던지고, 사분원(quarter circle, 반지름 1)
 * 안쪽에 떨어진 비율을 셉니다. 사분원의 넓이는 π/4 이므로:
 *
 *     π ≈ 4 · (안쪽 개수 / 전체 개수)
 *
 * "과정"을 보여주는 위젯: 점이 하나씩 쌓일수록 추정값 π̂가 3.14159…로 수렴하고
 * 오차가 줄어드는 모습을 실시간 숫자와 산점도로 동시에 보여줍니다.
 */

const PI = Math.PI;
const MAX_POINTS = 60000; // 산점도에 그릴 점의 상한(메모리·성능 보호)

interface Dart {
  x: number;
  y: number;
  inside: boolean;
}

export default function DartboardPi() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 누적 상태는 ref에 보관(리렌더와 무관하게 rAF가 직접 갱신).
  const dartsRef = useRef<Dart[]>([]);
  const insideRef = useRef(0);
  const totalRef = useRef(0);
  const rngRef = useRef<() => number>(mulberry32(1));
  const rafRef = useRef<number | null>(null);
  // 다시 그릴 점의 시작 인덱스(매 프레임 새 점만 덧그려 비용 절감).
  const drawnRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [showOutside, setShowOutside] = useState(true);
  // 화면 표시용 숫자 상태(주기적으로만 갱신).
  const [stats, setStats] = useState({ total: 0, inside: 0, piHat: 0 });

  /** 캔버스를 배경+경계+사분원 호로 초기화하고, 이미 던진 점을 모두 다시 그립니다. */
  const repaintAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = canvas.clientWidth || 320;
    const cssH = cssW; // 정사각형
    const ctx = setupCanvas(canvas, cssW, cssH);
    if (!ctx) return;

    const bg = cssVar(canvas, '--surface') || '#f5f6f8';
    const border = cssVar(canvas, '--border') || '#e2e5ea';

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    // 사분원 호(반지름 = 한 변). 좌하단을 원점으로 보고 1/4 원을 그립니다.
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, cssH, cssW, -PI / 2, 0, false);
    ctx.stroke();

    drawnRef.current = 0; // 전체 다시 그림
    drawNewPoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOutside]);

  /** 아직 안 그린 점들만 캔버스에 덧그립니다(매 프레임 호출). */
  const drawNewPoints = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cssW = canvas.clientWidth || 320;
    const cssH = cssW;

    const accent = cssVar(canvas, '--accent') || '#2f86cf';
    const muted = cssVar(canvas, '--muted') || '#5b6472';

    const darts = dartsRef.current;
    for (let i = drawnRef.current; i < darts.length; i++) {
      const d = darts[i];
      if (!d.inside && !showOutside) continue;
      // y는 위로 갈수록 0이 되도록 뒤집어 그립니다.
      const px = d.x * cssW;
      const py = (1 - d.y) * cssH;
      ctx.fillStyle = d.inside ? accent : muted;
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, 2 * PI);
      ctx.fill();
    }
    drawnRef.current = darts.length;
  }, [showOutside]);

  /** 다트 batch개를 던지고 누적 통계를 갱신합니다(그리기는 별도). */
  const throwDarts = useCallback((batch: number) => {
    const rng = rngRef.current;
    const darts = dartsRef.current;
    let inside = insideRef.current;
    for (let i = 0; i < batch; i++) {
      const x = rng();
      const y = rng();
      const isIn = x * x + y * y <= 1;
      if (isIn) inside++;
      if (darts.length < MAX_POINTS) darts.push({ x, y, inside: isIn });
    }
    insideRef.current = inside;
    totalRef.current += batch;
  }, []);

  /** 표시용 숫자 상태를 ref에서 끌어와 갱신. */
  const syncStats = useCallback(() => {
    const total = totalRef.current;
    const inside = insideRef.current;
    setStats({ total, inside, piHat: total > 0 ? (4 * inside) / total : 0 });
  }, []);

  /** 처음부터 다시: 새 시드로 재초기화. */
  const reset = useCallback(() => {
    setPlaying(false);
    rngRef.current = mulberry32(randomSeed());
    dartsRef.current = [];
    insideRef.current = 0;
    totalRef.current = 0;
    drawnRef.current = 0;
    syncStats();
    repaintAll();
  }, [repaintAll, syncStats]);

  /** 한 스텝: 소량(여기선 30개)만 던져 변화를 또렷이 관찰. */
  const step = useCallback(() => {
    throwDarts(30);
    drawNewPoints();
    syncStats();
  }, [throwDarts, drawNewPoints, syncStats]);

  // 최초 마운트 시 캔버스 초기화(클라이언트에서만 실행 → SSR 안전).
  useEffect(() => {
    rngRef.current = mulberry32(randomSeed());
    repaintAll();
    syncStats();
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 리사이즈/테마 전환 대응: 컨테이너 크기가 바뀌면 전부 다시 그림.
    const ro = new ResizeObserver(() => repaintAll());
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "바깥쪽 점 표시" 토글 시 즉시 전체 다시 그림(일시정지 상태에서도 반영되도록).
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true; // 최초 마운트는 위 초기화 effect가 이미 그렸으므로 건너뜀
      return;
    }
    repaintAll();
  }, [showOutside, repaintAll]);

  // 재생 루프: playing일 때만 rAF를 돌려 매 프레임 200개씩 추가.
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      throwDarts(200);
      drawNewPoints();
      syncStats();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, throwDarts, drawNewPoints, syncStats]);

  const error = Math.abs(stats.piHat - PI);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ aspectRatio: '1 / 1', maxWidth: 360, margin: '0 auto' }}>
        <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
      </div>

      <ReadoutRow
        items={[
          { label: '표본 수 N', value: stats.total.toLocaleString() },
          { label: '원 안쪽', value: stats.inside.toLocaleString() },
          { label: 'π̂ 추정', value: stats.total > 0 ? stats.piHat.toFixed(5) : '—' },
          { label: '오차 |π̂−π|', value: stats.total > 0 ? error.toFixed(5) : '—' },
        ]}
      />

      <ControlPanel>
        <button type="button" className="mc-btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? '일시정지' : '재생'}
        </button>
        <button type="button" className="mc-btn" onClick={step} disabled={playing}>
          한 스텝(+30)
        </button>
        <button type="button" className="mc-btn" onClick={reset}>
          다시 시작
        </button>
        <ToggleControl label="바깥쪽 점 표시" checked={showOutside} onChange={setShowOutside} />
      </ControlPanel>

      <figcaption>
        파란 점은 사분원 안쪽, 회색 점은 바깥쪽입니다. 안쪽 넓이가 π/4 이므로
        <strong> π ≈ 4 · (안쪽/전체)</strong>. 재생을 누르고 π̂가 3.14159…로 수렴하며 오차가
        줄어드는 과정을 지켜보세요. 처음 몇십 개일 때 추정값이 얼마나 출렁이는지도 보세요.
      </figcaption>

      <McButtonStyles />
    </figure>
  );
}

/* ---------- 이 챕터 위젯들이 공유하는 작은 표시 컴포넌트 ---------- */

interface ReadoutItem {
  label: string;
  value: string;
}

/** 실시간 숫자 readout 한 줄(표본 수·추정·오차 등). */
export function ReadoutRow({ items }: { items: ReadoutItem[] }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.6rem 1.4rem',
        marginTop: '0.8rem',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {items.map((it) => (
        <div key={it.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{it.label}</span>
          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 재생/스텝/리셋 버튼의 공통 스타일(테마 변수 사용). 위젯마다 한 번 렌더. */
export function McButtonStyles() {
  return (
    <style>{`
      .mc-btn {
        min-height: 44px;
        padding: 0 1rem;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text);
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
      }
      .mc-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
      .mc-btn:disabled { opacity: 0.45; cursor: default; }
    `}</style>
  );
}
