import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlPanel, ToggleControl } from '../../controls';
import { mulberry32, randomSeed } from './prng';
import { ReadoutRow, McButtonStyles } from './DartboardPi';

// 각 "런"은 자체 시드 PRNG를 새로 만들어 독립적으로 N을 키우며 오차를 측정합니다.

/**
 * 위젯 3 — 오차의 O(1/√N) 법칙을 눈으로.
 *
 * 같은 적분 I = ∫₀¹ sin(πx) dx = 2/π 를 균등표집으로 추정하면서,
 * 표본 수 N이 늘 때마다 절대오차 |Î_N − I|를 점으로 찍습니다.
 *
 * 로그-로그 축에서 보면 오차 구름은 기울기 −1/2 직선을 따릅니다.
 * (log|error| ≈ −½ log N + const) → N을 4배로 늘리면 오차는 절반.
 * 비교용 점선(기울기 −1/2, 즉 c/√N)을 함께 그립니다.
 */

const TRUE_VALUE = 2 / Math.PI;
const f = (x: number) => Math.sin(Math.PI * x);

const VB_W = 360;
const VB_H = 240;
const PAD_L = 44;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 32;

// 측정 지점: N을 로그 간격으로 1 → 100000 까지.
const N_MIN = 1;
const N_MAX = 100000;
const POINTS_PER_RUN = 36; // 한 런에서 찍을 (N, error) 점 개수

interface ErrPoint {
  n: number;
  err: number;
}

export default function ErrorVsN() {
  const rafRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [logLog, setLogLog] = useState(true);
  const [points, setPoints] = useState<ErrPoint[]>([]);
  const [runs, setRuns] = useState(0);

  // 한 런: 새 시드로 N을 로그 간격으로 키우며 각 지점의 절대오차를 기록.
  const runOnce = useCallback(() => {
    const rng = mulberry32(randomSeed());
    const targets: number[] = [];
    for (let i = 0; i < POINTS_PER_RUN; i++) {
      const t = i / (POINTS_PER_RUN - 1);
      const n = Math.round(N_MIN * Math.pow(N_MAX / N_MIN, t));
      targets.push(Math.max(1, n));
    }
    let sum = 0;
    let count = 0;
    const result: ErrPoint[] = [];
    let ti = 0;
    const maxTarget = targets[targets.length - 1];
    for (let k = 1; k <= maxTarget; k++) {
      sum += f(rng());
      count = k;
      while (ti < targets.length && targets[ti] === count) {
        result.push({ n: count, err: Math.abs(sum / count - TRUE_VALUE) });
        ti++;
      }
    }
    return result;
  }, []);

  const addRun = useCallback(() => {
    const r = runOnce();
    setPoints((prev) => {
      const merged = prev.concat(r);
      // 점 누적 상한(여러 런을 겹쳐 추세가 또렷해지되 메모리 보호).
      return merged.length > 2000 ? merged.slice(merged.length - 2000) : merged;
    });
    setRuns((c) => c + 1);
  }, [runOnce]);

  const reset = useCallback(() => {
    setPlaying(false);
    setPoints([]);
    setRuns(0);
  }, []);

  const step = useCallback(() => addRun(), [addRun]);

  useEffect(() => {
    addRun(); // 시작 시 한 런은 보여줌
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      // 너무 빠르지 않게 몇 프레임마다 한 런씩 추가.
      if (frame % 8 === 0) addRun();
      frame++;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, addRun]);

  // ----- 좌표 변환 -----
  const plotW = VB_W - PAD_L - PAD_R;
  const plotH = VB_H - PAD_T - PAD_B;
  // 선형 축 범위(고정): N ∈ [0, N_MAX], err ∈ [0, 0.5]
  // 로그 축 범위(고정): log10 N ∈ [0, 5], log10 err ∈ [-5, 0]
  const ERR_FLOOR = 1e-6; // log에서 0 방지

  const toXY = useCallback(
    (n: number, err: number): [number, number] => {
      if (logLog) {
        const lx = Math.log10(Math.max(n, 1)); // 0..5
        const ly = Math.log10(Math.max(err, ERR_FLOOR)); // -6..0, 표시는 -5..0
        const px = PAD_L + (lx / 5) * plotW;
        const py = PAD_T + (1 - (ly + 5) / 5) * plotH;
        return [px, py];
      }
      const px = PAD_L + (n / N_MAX) * plotW;
      const py = PAD_T + (1 - Math.min(err, 0.5) / 0.5) * plotH;
      return [px, py];
    },
    [logLog, plotW, plotH],
  );

  // 기준선: err = c/√N. 로그-로그에서 기울기 −1/2 직선.
  // c는 대략 표준오차 규모(σ/1)로 잡되, 점 구름 가운데를 지나도록 0.3 정도로 설정.
  const REF_C = 0.3;
  const refLine = (() => {
    const a = toXY(N_MIN, REF_C / Math.sqrt(N_MIN));
    const b = toXY(N_MAX, REF_C / Math.sqrt(N_MAX));
    return { x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
  })();

  const latest = points.length > 0 ? points[points.length - 1] : null;

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ padding: '0.4rem' }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          style={{ width: '100%', display: 'block' }}
          role="img"
          aria-label="표본 수 대비 절대오차 산점도"
        >
          {/* 축 */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={VB_H - PAD_B} stroke="var(--border)" />
          <line
            x1={PAD_L}
            y1={VB_H - PAD_B}
            x2={VB_W - PAD_R}
            y2={VB_H - PAD_B}
            stroke="var(--border)"
          />
          {/* 축 라벨 */}
          <text x={(PAD_L + VB_W - PAD_R) / 2} y={VB_H - 6} fill="var(--muted)" fontSize={11} textAnchor="middle">
            {logLog ? '표본 수 N (log₁₀)' : '표본 수 N'}
          </text>
          <text
            x={12}
            y={(PAD_T + VB_H - PAD_B) / 2}
            fill="var(--muted)"
            fontSize={11}
            textAnchor="middle"
            transform={`rotate(-90 12 ${(PAD_T + VB_H - PAD_B) / 2})`}
          >
            {logLog ? '절대오차 (log₁₀)' : '절대오차'}
          </text>

          {/* 기준선 c/√N (기울기 −1/2) */}
          <line
            x1={refLine.x1}
            y1={refLine.y1}
            x2={refLine.x2}
            y2={refLine.y2}
            stroke="var(--muted)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
          <text
            x={refLine.x2}
            y={refLine.y2 - 6}
            fill="var(--muted)"
            fontSize={10}
            textAnchor="end"
          >
            기울기 −1/2 (∝ 1/√N)
          </text>

          {/* 오차 점 구름 */}
          {points.map((p, i) => {
            const [px, py] = toXY(p.n, p.err);
            return <circle key={i} cx={px} cy={py} r={1.7} fill="var(--accent)" fillOpacity={0.5} />;
          })}
        </svg>
      </div>

      <ReadoutRow
        items={[
          { label: '런(run) 수', value: runs.toLocaleString() },
          { label: '찍힌 점', value: points.length.toLocaleString() },
          { label: '마지막 N', value: latest ? latest.n.toLocaleString() : '—' },
          { label: '그 오차', value: latest ? latest.err.toExponential(2) : '—' },
        ]}
      />

      <ControlPanel>
        <button type="button" className="mc-btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? '일시정지' : '재생'}
        </button>
        <button type="button" className="mc-btn" onClick={step}>
          런 추가
        </button>
        <button type="button" className="mc-btn" onClick={reset}>
          다시 시작
        </button>
        <ToggleControl label="로그-로그 축" checked={logLog} onChange={setLogLog} />
      </ControlPanel>

      <figcaption>
        각 점은 어떤 표본 수 N에서의 절대오차입니다. <strong>로그-로그 축</strong>으로 바꾸면
        구름이 점선(기울기 −1/2)을 따라 내려갑니다. 즉 오차는 대략 1/√N로 줄어듭니다 —
        N을 4배로 늘려야 오차가 절반이 됩니다. 런을 여러 번 겹치면 추세가 또렷해집니다.
      </figcaption>

      <McButtonStyles />
    </figure>
  );
}
