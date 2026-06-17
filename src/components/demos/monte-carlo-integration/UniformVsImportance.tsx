import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlPanel } from '../../controls';
import { mulberry32, randomSeed, gaussian } from './prng';
import { ReadoutRow, McButtonStyles } from './DartboardPi';

/**
 * 위젯 4 — 균등표집 vs 중요도표집(변수 감소). 경로추적으로 가는 다리.
 *
 * 뾰족한 적분 대상:
 *     f(x) = exp(−(x − μ)² / (2 s²)),   μ = 0.5,  s = 0.05  on [0,1]
 *
 * 참값:  I = ∫₀¹ f dx = s√(2π) · [Φ((1−μ)/s) − Φ((−μ)/s)]
 *        (μ=0.5, s=0.05이면 양 끝이 10σ 밖이라 사실상 s√(2π) ≈ 0.125331)
 *
 * 일반 추정량:  Î = (1/N) Σ f(x_i)/p(x_i),  x_i ~ p
 *  - 왼쪽(균등): p = 1 → Î = (1/N) Σ f(x_i). 표본 대부분이 봉우리 밖이라 0에 가까워
 *    낭비되고, 가끔 봉우리에 꽂히면 추정값이 크게 출렁임 → 분산 큼.
 *  - 오른쪽(중요도): p(x) = N(x; μ, s)/Z (봉우리 근처에 집중). 가중치 f/p가 거의 상수라
 *    분산이 급감. 이게 바로 경로추적이 반구 위 균등이 아니라 BRDF·cos에 비례해
 *    방향을 뽑는 이유입니다.
 */

const MU = 0.5;
const S = 0.05;
const f = (x: number) => Math.exp(-((x - MU) * (x - MU)) / (2 * S * S));
const normPdfRaw = (x: number) => Math.exp(-((x - MU) * (x - MU)) / (2 * S * S)) / (S * Math.SQRT2 * Math.sqrt(Math.PI));

// erf 근사(Abramowitz & Stegun 7.1.26): 참값과 절단상수 Z 계산용.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}
// 표준정규 CDF
const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));
// 절단상수 Z: [0,1]로 자른 정규분포의 정규화 상수
const Z = Phi((1 - MU) / S) - Phi((0 - MU) / S);
// 절단 정규분포의 pdf(중요도표집의 p)
const importancePdf = (x: number) => normPdfRaw(x) / Z;
const TRUE_VALUE = S * Math.SQRT2 * Math.sqrt(Math.PI) * Z; // = s√(2π)·Z

const VB_W = 360;
const PANEL_H = 120;
const PAD = 26;

const MAX_TICKS = 250;
const MAX_HISTORY = 500;

interface PanelState {
  sum: number; // 균등: Σ f ; 중요도: Σ f/p
  n: number;
  ticks: number[]; // 표본 x 위치(클라우드)
  history: { n: number; est: number }[];
}
const emptyPanel = (): PanelState => ({ sum: 0, n: 0, ticks: [], history: [] });

export default function UniformVsImportance() {
  const rngRef = useRef<() => number>(mulberry32(1));
  const rafRef = useRef<number | null>(null);
  const uniRef = useRef<PanelState>(emptyPanel());
  const impRef = useRef<PanelState>(emptyPanel());

  const [playing, setPlaying] = useState(false);
  const [, force] = useState(0); // ref 변경 후 강제 리렌더용

  const addBatch = useCallback((batch: number) => {
    const rng = rngRef.current;
    const uni = uniRef.current;
    const imp = impRef.current;
    for (let i = 0; i < batch; i++) {
      // 균등표집: x ~ U(0,1), p=1
      const xu = rng();
      uni.sum += f(xu);
      uni.n += 1;
      uni.ticks.push(xu);

      // 중요도표집: x ~ 절단정규(거부표집으로 [0,1] 안만 채택)
      let xi = gaussian(rng, MU, S);
      let guard = 0;
      while ((xi < 0 || xi > 1) && guard < 20) {
        xi = gaussian(rng, MU, S);
        guard++;
      }
      xi = Math.min(1, Math.max(0, xi));
      imp.sum += f(xi) / importancePdf(xi);
      imp.n += 1;
      imp.ticks.push(xi);
    }
    // 틱·히스토리 상한 관리
    if (uni.ticks.length > MAX_TICKS) uni.ticks = uni.ticks.slice(-MAX_TICKS);
    if (imp.ticks.length > MAX_TICKS) imp.ticks = imp.ticks.slice(-MAX_TICKS);
    uni.history.push({ n: uni.n, est: uni.sum / uni.n });
    imp.history.push({ n: imp.n, est: imp.sum / imp.n });
    if (uni.history.length > MAX_HISTORY) uni.history = uni.history.slice(-MAX_HISTORY);
    if (imp.history.length > MAX_HISTORY) imp.history = imp.history.slice(-MAX_HISTORY);
    force((c) => c + 1);
  }, []);

  const reset = useCallback(() => {
    setPlaying(false);
    rngRef.current = mulberry32(randomSeed());
    uniRef.current = emptyPanel();
    impRef.current = emptyPanel();
    force((c) => c + 1);
  }, []);

  const step = useCallback(() => addBatch(3), [addBatch]);

  useEffect(() => {
    rngRef.current = mulberry32(randomSeed());
  }, []);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const batch = uniRef.current.n < 150 ? 2 : 25;
      addBatch(batch);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, addBatch]);

  const uni = uniRef.current;
  const imp = impRef.current;
  const uniEst = uni.n > 0 ? uni.sum / uni.n : 0;
  const impEst = imp.n > 0 ? imp.sum / imp.n : 0;
  const uniErr = Math.abs(uniEst - TRUE_VALUE);
  const impErr = Math.abs(impEst - TRUE_VALUE);

  return (
    <figure className="demo">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.6rem',
        }}
      >
        <Panel title="균등표집 (p = 1)" state={uni} est={uniEst} err={uniErr} />
        <Panel title="중요도표집 (p ∝ f)" state={imp} est={impEst} err={impErr} />
      </div>

      <ReadoutRow
        items={[
          { label: '표본 수 N', value: uni.n.toLocaleString() },
          { label: '참값', value: TRUE_VALUE.toFixed(5) },
          { label: '균등 오차', value: uni.n > 0 ? uniErr.toFixed(5) : '—' },
          { label: '중요도 오차', value: imp.n > 0 ? impErr.toFixed(5) : '—' },
        ]}
      />

      <ControlPanel>
        <button type="button" className="mc-btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? '일시정지' : '재생'}
        </button>
        <button type="button" className="mc-btn" onClick={step} disabled={playing}>
          한 스텝(+3)
        </button>
        <button type="button" className="mc-btn" onClick={reset}>
          다시 시작
        </button>
      </ControlPanel>

      <figcaption>
        두 패널은 <strong>같은 N, 같은 난수 흐름</strong>으로 같은 뾰족한 적분을 추정합니다.
        왼쪽(균등)은 표본이 고르게 흩어져 대부분 봉우리 밖에서 낭비되고, 추정값이 크게 출렁입니다.
        오른쪽(중요도)은 봉우리 근처에 표본을 몰고 f(xᵢ)/p(xᵢ)로 가중해 훨씬 빨리 안정됩니다.
        경로추적이 반구 위 균등 대신 BRDF·cos에 비례해 방향을 뽑는 이유가 바로 이것입니다.
      </figcaption>

      <McButtonStyles />
    </figure>
  );
}

/** 한 패널: 위에 f(x)+표본 클라우드, 아래에 누적 추정 꺾은선(참값 점선). */
function Panel({
  title,
  state,
  est,
  err,
}: {
  title: string;
  state: PanelState;
  est: number;
  err: number;
}) {
  const W = VB_W / 2;
  const TOP = PANEL_H;
  const BOT = PANEL_H;
  const GAP = 18;
  const H = TOP + GAP + BOT;

  const x2px = (x: number) => PAD + x * (W - 2 * PAD);
  // 위: f(x) 곡선(최대 1) + 표본 위치 점
  const fy = (v: number) => TOP - PAD - v * (TOP - 2 * PAD);
  const curve = (() => {
    const N = 80;
    let d = '';
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      d += `${i === 0 ? 'M' : 'L'} ${x2px(x).toFixed(2)} ${fy(f(x)).toFixed(2)} `;
    }
    return d;
  })();

  // 아래: 추정값 꺾은선. 참값 주변 [0, 2·참값] 범위로 확대.
  const Y0 = TOP + GAP;
  const yHi = TRUE_VALUE * 2.2;
  const ey = (v: number) => Y0 + (BOT - PAD) - (Math.min(Math.max(v, 0), yHi) / yHi) * (BOT - 2 * PAD);
  const maxN = Math.max(state.n, 10);
  const nx = (n: number) => PAD + (n / maxN) * (W - 2 * PAD);
  const histPath = state.history
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${nx(p.n).toFixed(2)} ${ey(p.est).toFixed(2)}`)
    .join(' ');
  const trueY = ey(TRUE_VALUE);

  return (
    <div className="demo-canvas" style={{ padding: '0.3rem' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center', padding: '0.2rem 0' }}>
        {title}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label={title}>
        {/* 위 패널 축 */}
        <line x1={PAD} y1={TOP - PAD} x2={W - PAD} y2={TOP - PAD} stroke="var(--border)" />
        {/* f(x) 곡선 */}
        <path d={curve} fill="none" stroke="var(--text)" strokeWidth={1.5} />
        {/* 표본 클라우드: 축 바로 위 작은 점 */}
        {state.ticks.map((x, i) => (
          <circle key={i} cx={x2px(x)} cy={TOP - PAD - 3} r={1.5} fill="var(--accent)" fillOpacity={0.5} />
        ))}

        {/* 아래 패널: 참값 점선 + 추정 꺾은선 */}
        <line x1={PAD} y1={trueY} x2={W - PAD} y2={trueY} stroke="var(--muted)" strokeDasharray="3 3" />
        <line x1={PAD} y1={Y0 + PAD} x2={PAD} y2={Y0 + BOT - PAD} stroke="var(--border)" />
        <line x1={PAD} y1={Y0 + BOT - PAD} x2={W - PAD} y2={Y0 + BOT - PAD} stroke="var(--border)" />
        {state.history.length > 1 && (
          <path d={histPath} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
        )}
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          fontSize: '0.72rem',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--text)',
          paddingBottom: '0.2rem',
        }}
      >
        <span>Î = {state.n > 0 ? est.toFixed(4) : '—'}</span>
        <span style={{ color: 'var(--muted)' }}>오차 {state.n > 0 ? err.toFixed(4) : '—'}</span>
      </div>
    </div>
  );
}
