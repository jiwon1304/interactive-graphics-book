import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { mulberry32, randomSeed, mean, std } from './prng';
import { ReadoutRow, McButtonStyles } from './DartboardPi';

/**
 * 위젯 5 — 추정값들의 퍼짐(분산)을 히스토그램으로.
 *
 * 같은 적분 I = ∫₀¹ sin(πx) dx = 2/π 를, 서로 독립인 추정기 200개로 각각 추정합니다.
 * 추정기 하나당 표본 N개(슬라이더로 조절). 200개의 추정값을 히스토그램으로 모으면:
 *   - N이 작으면 → 넓게 퍼짐(분산 큼)
 *   - N을 키우면 → 참값 주변으로 좁아짐(표준편차 ∝ 1/√N)
 *
 * "분산 ∝ 1/N"을 손에 잡히게 보여주는 위젯입니다.
 * 막대가 한 번에 다 쌓이지 않고 한 프레임에 몇 개씩 채워져 채워지는 과정을 보여줍니다.
 */

const TRUE_VALUE = 2 / Math.PI;
const f = (x: number) => Math.sin(Math.PI * x);
const NUM_RUNS = 200;

const VB_W = 360;
const VB_H = 200;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 28;

// 히스토그램 x축 범위(참값 주변 고정 → N을 바꿔도 좁아지는 게 보임)
const X_LO = TRUE_VALUE - 0.5;
const X_HI = TRUE_VALUE + 0.5;
const BINS = 41;

export default function ManyRuns() {
  const rngRef = useRef<() => number>(mulberry32(1));
  const rafRef = useRef<number | null>(null);
  const estimatesRef = useRef<number[]>([]); // 완성된 추정값들
  const doneRef = useRef(0); // 지금까지 끝난 런 수

  const [n, setN] = useState(16);
  const [estimates, setEstimates] = useState<number[]>([]);
  const [running, setRunning] = useState(false);

  // 추정기 하나: 현재 N으로 합 평균.
  const oneEstimate = useCallback((N: number): number => {
    const rng = rngRef.current;
    let s = 0;
    for (let i = 0; i < N; i++) s += f(rng());
    return s / N;
  }, []);

  // 전부 다시 굴리기: 새 시드 + 빈 상태 + 애니메이션 시작.
  const reroll = useCallback(() => {
    rngRef.current = mulberry32(randomSeed());
    estimatesRef.current = [];
    doneRef.current = 0;
    setEstimates([]);
    setRunning(true);
  }, []);

  useEffect(() => {
    rngRef.current = mulberry32(randomSeed());
    reroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // N이 바뀌면 자동으로 다시 굴림(좁아짐/넓어짐을 바로 비교).
  useEffect(() => {
    reroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  // 채우기 애니메이션: 한 프레임에 런 몇 개씩 완성.
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const perFrame = 6;
      for (let k = 0; k < perFrame && doneRef.current < NUM_RUNS; k++) {
        estimatesRef.current.push(oneEstimate(n));
        doneRef.current += 1;
      }
      setEstimates(estimatesRef.current.slice());
      if (doneRef.current >= NUM_RUNS) {
        setRunning(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [running, n, oneEstimate]);

  // 히스토그램 비닝
  const counts = new Array<number>(BINS).fill(0);
  for (const e of estimates) {
    const t = (e - X_LO) / (X_HI - X_LO);
    let b = Math.floor(t * BINS);
    if (b < 0) b = 0;
    if (b >= BINS) b = BINS - 1;
    counts[b] += 1;
  }
  const maxCount = Math.max(1, ...counts);

  const plotW = VB_W - PAD_L - PAD_R;
  const plotH = VB_H - PAD_T - PAD_B;
  const binW = plotW / BINS;
  const v2px = (v: number) => PAD_L + ((v - X_LO) / (X_HI - X_LO)) * plotW;
  const c2h = (c: number) => (c / maxCount) * plotH;

  const m = mean(estimates);
  const sd = std(estimates);
  const truePx = v2px(TRUE_VALUE);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ padding: '0.4rem' }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          style={{ width: '100%', display: 'block' }}
          role="img"
          aria-label="추정값 200개의 히스토그램"
        >
          {/* 축 */}
          <line x1={PAD_L} y1={VB_H - PAD_B} x2={VB_W - PAD_R} y2={VB_H - PAD_B} stroke="var(--border)" />
          {/* 막대 */}
          {counts.map((c, i) => {
            const h = c2h(c);
            const x = PAD_L + i * binW;
            return (
              <rect
                key={i}
                x={x + 0.5}
                y={VB_H - PAD_B - h}
                width={Math.max(0, binW - 1)}
                height={h}
                fill="var(--accent)"
                fillOpacity={0.65}
              />
            );
          })}
          {/* 참값 세로선 */}
          <line
            x1={truePx}
            y1={PAD_T}
            x2={truePx}
            y2={VB_H - PAD_B}
            stroke="var(--text)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <text x={truePx} y={PAD_T - 2} fill="var(--muted)" fontSize={10} textAnchor="middle">
            참값 2/π
          </text>
          {/* x축 라벨 */}
          <text x={v2px(X_LO)} y={VB_H - 8} fill="var(--muted)" fontSize={10} textAnchor="start">
            {X_LO.toFixed(2)}
          </text>
          <text x={v2px(X_HI)} y={VB_H - 8} fill="var(--muted)" fontSize={10} textAnchor="end">
            {X_HI.toFixed(2)}
          </text>
          <text
            x={(PAD_L + VB_W - PAD_R) / 2}
            y={VB_H - 8}
            fill="var(--muted)"
            fontSize={11}
            textAnchor="middle"
          >
            추정값 Î (200개 추정기)
          </text>
        </svg>
      </div>

      <ReadoutRow
        items={[
          { label: '추정기당 표본 N', value: n.toLocaleString() },
          { label: '완성된 런', value: `${estimates.length} / ${NUM_RUNS}` },
          { label: '평균(≈참값)', value: estimates.length > 0 ? m.toFixed(4) : '—' },
          { label: '표준편차(퍼짐)', value: estimates.length > 0 ? sd.toFixed(4) : '—' },
        ]}
      />

      <ControlPanel>
        <Slider
          label="추정기당 표본 수 N"
          value={n}
          min={1}
          max={1024}
          step={1}
          onChange={(v) => setN(Math.round(v))}
          format={(v) => `${Math.round(v)}`}
        />
        <button type="button" className="mc-btn" onClick={reroll}>
          다시 굴리기
        </button>
      </ControlPanel>

      <figcaption>
        막대 200개는 각각 표본 N개로 적분을 추정한 결과입니다. <strong>N을 키워 보세요</strong> —
        히스토그램이 참값(2/π) 주변으로 눈에 띄게 좁아집니다. 표준편차는 대략 1/√N로 줄어드니,
        N을 4배로 늘리면 퍼짐이 절반이 됩니다. 분산 ∝ 1/N을 직접 확인하세요.
      </figcaption>

      <McButtonStyles />
    </figure>
  );
}
