import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlPanel } from '../../controls';
import { mulberry32, randomSeed } from './prng';
import { ReadoutRow, McButtonStyles } from './DartboardPi';

/**
 * 위젯 2 — 정적분의 추정값이 참값으로 수렴하는 과정.
 *
 * 대상 적분:  I = ∫₀¹ sin(πx) dx = [−cos(πx)/π]₀¹ = 2/π ≈ 0.636620
 *
 * 균등표집(p = 1)이므로 추정량은 단순 평균:
 *     Î_N = (1/N) Σ f(x_i),   x_i ~ U(0,1)
 *
 * 두 패널(하나의 SVG에 위/아래로):
 *  (위) 곡선 f(x)와, 표집된 x들을 막대(f(x) 높이)로 표시 → "어디를 평가했나"
 *  (아래) 표본 수 N에 따른 누적 추정값의 꺾은선 + 참값 점선 → "추정값이 정착하는 과정"
 */

const TRUE_VALUE = 2 / Math.PI; // ≈ 0.6366197723675814
const f = (x: number) => Math.sin(Math.PI * x);

// SVG 좌표계(위/아래 패널). viewBox 단위로 그려 반응형.
const VB_W = 360;
const TOP_H = 150; // 곡선 패널 높이
const GAP = 24;
const BOT_H = 150; // 수렴 패널 높이
const VB_H = TOP_H + GAP + BOT_H;
const PAD = 28; // 좌우/상하 여백

const MAX_HISTORY = 600; // 꺾은선에 보관할 (N, 추정값) 점 개수 상한
const MAX_TICKS = 400; // 위 패널에 그릴 표본 막대 상한

interface SamplePoint {
  x: number;
  fx: number;
}
interface EstPoint {
  n: number;
  est: number;
}

export default function ConvergenceCurve() {
  const rngRef = useRef<() => number>(mulberry32(1));
  const sumRef = useRef(0);
  const totalRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [samples, setSamples] = useState<SamplePoint[]>([]);
  const [history, setHistory] = useState<EstPoint[]>([]);
  const [stats, setStats] = useState({ n: 0, est: 0 });

  const addSamples = useCallback((batch: number) => {
    const rng = rngRef.current;
    const newSamples: SamplePoint[] = [];
    for (let i = 0; i < batch; i++) {
      const x = rng();
      const fx = f(x);
      sumRef.current += fx;
      totalRef.current += 1;
      newSamples.push({ x, fx });
    }
    const n = totalRef.current;
    const est = sumRef.current / n;

    setSamples((prev) => {
      const merged = prev.concat(newSamples);
      // 막대가 너무 많아지면 균등하게 솎아 최근 분포를 유지.
      return merged.length > MAX_TICKS ? merged.slice(merged.length - MAX_TICKS) : merged;
    });
    setHistory((prev) => {
      const next = prev.concat({ n, est });
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
    setStats({ n, est });
  }, []);

  const reset = useCallback(() => {
    setPlaying(false);
    rngRef.current = mulberry32(randomSeed());
    sumRef.current = 0;
    totalRef.current = 0;
    setSamples([]);
    setHistory([]);
    setStats({ n: 0, est: 0 });
  }, []);

  const step = useCallback(() => addSamples(5), [addSamples]);

  useEffect(() => {
    rngRef.current = mulberry32(randomSeed());
  }, []);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      // 처음에는 천천히(수렴 과정이 보이게), 점차 batch를 키워 빠르게 정착.
      const batch = totalRef.current < 200 ? 3 : 40;
      addSamples(batch);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, addSamples]);

  // ----- 위 패널: f(x) 곡선 경로 -----
  const x2px = (x: number) => PAD + x * (VB_W - 2 * PAD);
  const fx2py = (fx: number) => TOP_H - PAD - fx * (TOP_H - 2 * PAD); // f∈[0,1]
  const curvePath = (() => {
    const N = 64;
    let d = '';
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      d += `${i === 0 ? 'M' : 'L'} ${x2px(x).toFixed(2)} ${fx2py(f(x)).toFixed(2)} `;
    }
    return d;
  })();

  // ----- 아래 패널: 누적 추정값 꺾은선 -----
  // x축은 N(로그 느낌을 위해 마지막 N 기준 비율), y축은 추정값(참값 주변 확대).
  const Y0 = TOP_H + GAP;
  const yLo = TRUE_VALUE - 0.35;
  const yHi = TRUE_VALUE + 0.35;
  const est2py = (est: number) =>
    Y0 + (BOT_H - PAD) - ((est - yLo) / (yHi - yLo)) * (BOT_H - 2 * PAD);
  const maxN = Math.max(totalRef.current, 10);
  const n2px = (n: number) => PAD + (n / maxN) * (VB_W - 2 * PAD);
  const truePy = est2py(TRUE_VALUE);
  const histPath = history
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${n2px(p.n).toFixed(2)} ${est2py(clamp(p.est, yLo, yHi)).toFixed(2)}`)
    .join(' ');

  const error = Math.abs(stats.est - TRUE_VALUE);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ padding: '0.4rem' }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          style={{ width: '100%', display: 'block' }}
          role="img"
          aria-label="f(x) 곡선과 누적 추정값 수렴 그래프"
        >
          {/* 위 패널 축 */}
          <line x1={PAD} y1={TOP_H - PAD} x2={VB_W - PAD} y2={TOP_H - PAD} stroke="var(--border)" />
          <line x1={PAD} y1={PAD} x2={PAD} y2={TOP_H - PAD} stroke="var(--border)" />
          {/* 표본 막대: x에서 f(x)까지 */}
          {samples.map((s, i) => (
            <line
              key={i}
              x1={x2px(s.x)}
              y1={TOP_H - PAD}
              x2={x2px(s.x)}
              y2={fx2py(s.fx)}
              stroke="var(--accent)"
              strokeOpacity={0.35}
              strokeWidth={1}
            />
          ))}
          {/* f(x) 곡선 */}
          <path d={curvePath} fill="none" stroke="var(--text)" strokeWidth={1.8} />
          <text x={x2px(0.5)} y={PAD - 8} fill="var(--muted)" fontSize={11} textAnchor="middle">
            f(x) = sin(πx) — 표본 위치에서 평가
          </text>

          {/* 아래 패널: 참값 점선 + 누적 추정 꺾은선 */}
          <line
            x1={PAD}
            y1={truePy}
            x2={VB_W - PAD}
            y2={truePy}
            stroke="var(--muted)"
            strokeDasharray="4 4"
          />
          <text x={VB_W - PAD} y={truePy - 5} fill="var(--muted)" fontSize={10} textAnchor="end">
            참값 2/π ≈ {TRUE_VALUE.toFixed(4)}
          </text>
          <line x1={PAD} y1={Y0 + PAD} x2={PAD} y2={Y0 + BOT_H - PAD} stroke="var(--border)" />
          <line
            x1={PAD}
            y1={Y0 + BOT_H - PAD}
            x2={VB_W - PAD}
            y2={Y0 + BOT_H - PAD}
            stroke="var(--border)"
          />
          {history.length > 1 && (
            <path d={histPath} fill="none" stroke="var(--accent)" strokeWidth={1.8} />
          )}
          <text x={x2px(0.5)} y={Y0 + 12} fill="var(--muted)" fontSize={11} textAnchor="middle">
            누적 추정값 Î_N (가로축: 표본 수 N)
          </text>
        </svg>
      </div>

      <ReadoutRow
        items={[
          { label: '표본 수 N', value: stats.n.toLocaleString() },
          { label: '추정 Î_N', value: stats.n > 0 ? stats.est.toFixed(5) : '—' },
          { label: '참값', value: TRUE_VALUE.toFixed(5) },
          { label: '오차', value: stats.n > 0 ? error.toFixed(5) : '—' },
        ]}
      />

      <ControlPanel>
        <button type="button" className="mc-btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? '일시정지' : '재생'}
        </button>
        <button type="button" className="mc-btn" onClick={step} disabled={playing}>
          한 스텝(+5)
        </button>
        <button type="button" className="mc-btn" onClick={reset}>
          다시 시작
        </button>
      </ControlPanel>

      <figcaption>
        위 패널의 옅은 세로선은 무작위로 뽑은 표본 x에서 곡선 높이 f(x)를 읽는 모습입니다.
        아래 패널은 그 값들의 평균(누적 추정값)이 표본이 쌓이며 점선(참값 2/π)으로
        가라앉는 과정입니다. 초반엔 크게 출렁이다가 N이 커질수록 잔잔해집니다.
      </figcaption>

      <McButtonStyles />
    </figure>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
