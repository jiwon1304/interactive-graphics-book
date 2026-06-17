/*
 * 몬테카를로 데모용 공용 도구 모음.
 *
 * 핵심 원칙: 모든 무작위성은 "시드(seed)"가 주어진 결정적 PRNG에서 나옵니다.
 * 같은 시드 → 같은 수열이므로, "다시 시작"으로 시드를 바꾸기 전까지는
 * 재생/일시정지/한 스텝을 아무리 반복해도 결과가 똑같이 재현됩니다.
 *
 * 또한 PRNG 호출은 절대 모듈 최상위나 렌더 중에 하지 않습니다.
 * (SSR에서 서버/클라이언트 값이 어긋나는 hydration mismatch 방지)
 * 항상 이벤트 핸들러나 useEffect 안에서만 생성·소비하세요.
 */

/** mulberry32: 작고 빠른 32비트 시드 PRNG. [0, 1) 범위의 난수를 반환합니다. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 새 시드를 만들 때 쓰는 헬퍼.
 * 클라이언트에서만 호출되므로 Date.now/Math.random을 써도 SSR과 무관합니다.
 */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}

/**
 * Box–Muller 변환: 균등 난수 두 개로 표준정규 N(0,1) 표본 하나를 만듭니다.
 * 중요도 표집 데모에서 "봉우리 근처에 몰린 표본"을 만들 때 사용합니다.
 */
export function gaussian(rng: () => number, mean = 0, std = 1): number {
  // u1 == 0이면 log가 발산하므로 작은 하한으로 보정
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  const mag = Math.sqrt(-2 * Math.log(u1));
  return mean + std * mag * Math.cos(2 * Math.PI * u2);
}

/** 평균. 빈 배열이면 0. */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** 표본표준편차(모표준편차에 가까운 1/n 정의 — 시각화용이라 충분). */
export function std(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / xs.length);
}

/**
 * 캔버스 요소의 계산된 스타일에서 CSS 변수를 읽어 트림된 문자열로 반환.
 * 캔버스 2D 컨텍스트는 var(--x)를 직접 못 쓰므로, 그릴 때마다 이 함수로 실제 색을 읽어
 * 라이트/다크 테마 전환에 자동으로 반응하게 합니다.
 */
export function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/**
 * 고해상도(레티나) 캔버스 셋업.
 * CSS 크기(cssW×cssH)와 devicePixelRatio(상한 2)로 실제 픽셀 버퍼를 잡고,
 * 컨텍스트를 dpr배 확대해 좌표를 CSS 픽셀 단위로 다룰 수 있게 합니다.
 * 반환된 ctx에는 이미 setTransform이 적용돼 있습니다.
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
