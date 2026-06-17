// 베지에 곡선 · 드 카스텔조 공유 수학 헬퍼.
// 모든 위젯이 이 모듈의 함수를 가져다 쓴다. 순수 함수만 두며 DOM/캔버스에 의존하지 않는다.

/** 2D 점. 가상 좌표계(보통 0..1 정규화 박스)에서의 좌표. */
export type Pt = { x: number; y: number };

/**
 * 선형 보간(linear interpolation).
 *   lerp(A, B, t) = (1 - t)·A + t·B
 * t=0이면 A, t=1이면 B. 드 카스텔조의 모든 단계가 이 한 줄로 이루어진다.
 */
export function lerp(a: Pt, b: Pt, t: number): Pt {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/**
 * 드 카스텔조 구성(de Casteljau construction).
 * 제어점 배열을 받아 매 단계마다 인접한 점들을 t로 보간하며 점이 하나 남을 때까지 반복한다.
 *
 *   P_i^(r)(t) = (1 - t)·P_i^(r-1)(t) + t·P_{i+1}^(r-1)(t),   P_i^(0) = P_i
 *
 * @returns levels — 모든 중간 단계.
 *   levels[0] = 제어점(원본), levels[k]는 levels[k-1]을 한 번 보간한 결과,
 *   levels[n] = 점 하나(= 곡선 위 점).
 * @returns point — 마지막 단계의 단일 점 = B(t).
 *
 * 이 한 함수가 사다리(ladder)·자취(trace)·분할(subdivision) 위젯을 모두 떠받친다.
 */
export function deCasteljau(points: Pt[], t: number): { levels: Pt[][]; point: Pt } {
  const levels: Pt[][] = [points.slice()];
  let current = points;
  // 점이 하나만 남을 때까지 인접 쌍을 보간한다.
  while (current.length > 1) {
    const next: Pt[] = [];
    for (let i = 0; i < current.length - 1; i++) {
      next.push(lerp(current[i], current[i + 1], t));
    }
    levels.push(next);
    current = next;
  }
  // current.length === 1 (제어점이 1개뿐이면 그 점 자체)
  return { levels, point: current[0] };
}

/** 드 카스텔조로 계산한 곡선 위 한 점 B(t). */
export function bezierPoint(points: Pt[], t: number): Pt {
  return deCasteljau(points, t).point;
}

/**
 * 곡선을 그리기 위한 샘플들. t를 0..1로 n등분해 n+1개의 점을 반환한다.
 * 폴리라인으로 이으면 곡선이 된다.
 */
export function sampleBezier(points: Pt[], n: number): Pt[] {
  if (points.length === 0) return [];
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    out.push(bezierPoint(points, i / n));
  }
  return out;
}

/** 이항계수 C(n, k). 작은 차수만 다루므로 곱셈 누적으로 충분히 정확하다. */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  // 대칭성으로 곱셈 횟수를 줄인다.
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < kk; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

/**
 * 번스타인 기저 다항식
 *   B_{i,n}(t) = C(n, i) · (1 - t)^(n - i) · t^i
 * 이 기저들의 가중합이 베지에 곡선이며, 임의의 t에서 항상 합이 1이다(단위 분할).
 */
export function bernstein(n: number, i: number, t: number): number {
  return binomial(n, i) * Math.pow(1 - t, n - i) * Math.pow(t, i);
}

/**
 * 곡선을 t에서 둘로 나눈다(subdivision).
 * 드 카스텔조 삼각형 스킴에서
 *   - 왼쪽 곡선의 제어점 = 각 단계의 "첫" 점들
 *   - 오른쪽 곡선의 제어점 = 각 단계의 "마지막" 점들(차수 순서를 맞추려 뒤집음)
 * 이 두 폴리라인이 그대로 두 반쪽 곡선의 제어 다각형이 된다 — 이것이 드 카스텔조의 우아한 사실.
 */
export function subdivide(points: Pt[], t: number): { left: Pt[]; right: Pt[] } {
  const { levels } = deCasteljau(points, t);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (const level of levels) {
    left.push(level[0]);
    right.push(level[level.length - 1]);
  }
  // right는 단계가 깊어질수록(점이 줄수록) 끝점을 모은 것이라 차수 순서를 위해 뒤집는다.
  right.reverse();
  return { left, right };
}
