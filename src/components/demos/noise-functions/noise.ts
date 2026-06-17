// 노이즈 함수 공용 모듈.
// 모든 난수는 정수 해시 기반의 결정적(deterministic) PRNG로 만든다.
// 같은 (좌표, seed) ⇒ 항상 같은 값. 따라서 SSR(서버 렌더)과 클라이언트가 일치하고,
// seed 슬라이더로 "같은 무작위성"을 재현/재시드할 수 있다.
//
// 여기 있는 함수들은 순수 함수이므로 렌더 중 호출해도 안전하지만,
// 무거운 필드 생성은 항상 클라이언트 effect/이벤트 안에서 수행한다(데모 규칙).

/* ───────────────────────── 정수 해시 ───────────────────────── */

// 32비트 정수 해시. 입력을 잘 섞어 [0, 2^32) 범위의 의사난수 정수를 만든다.
// (Wang/Jenkins 류의 비트 믹싱) >>> 0 으로 부호 없는 32비트를 유지.
function hashU32(n: number): number {
  let x = n | 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = (x + (x << 3)) | 0;
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return x >>> 0;
}

// 두 좌표(+seed)를 하나의 정수로 섞어 해시. 큰 소수로 좌표를 분리한다.
function hash2i(x: number, y: number, seed: number): number {
  // 정수 격자 좌표를 받는다고 가정. 큰 소수 가중으로 섞은 뒤 비트 해시.
  const h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  return hashU32(h);
}

/** 정수 격자점 (ix, iy)의 무작위 스칼라 값 ∈ [0, 1). seed로 재현 가능. */
export function valueAt(ix: number, iy: number, seed: number): number {
  return hash2i(ix, iy, seed) / 4294967296; // / 2^32
}

/** 1D 정수 격자점 ix의 무작위 스칼라 값 ∈ [0, 1). */
export function valueAt1D(ix: number, seed: number): number {
  return hashU32(Math.imul(ix, 374761393) ^ Math.imul(seed, 2147483647)) / 4294967296;
}

/** 정수 격자점의 무작위 단위 그래디언트 벡터(2D). Perlin/simplex에서 사용. */
export function gradientAt(ix: number, iy: number, seed: number): [number, number] {
  // 해시로 각도를 만들고 단위 벡터로 변환 → 방향이 고르게 분포.
  const h = hash2i(ix, iy, seed);
  const angle = (h / 4294967296) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
}

/* ───────────────────────── 보간/완화 함수 ───────────────────────── */

/** 선형 보간. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** smoothstep 완화: 3t² − 2t³. 격자점에서 1차 도함수 = 0. */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** quintic 완화: 6t⁵ − 15t⁴ + 10t³. 격자점에서 1·2차 도함수 = 0 (가장 부드러움). */
export function quintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export type Smoothing = 'linear' | 'smoothstep' | 'quintic';

/** 선택된 완화 함수를 적용. */
export function ease(t: number, kind: Smoothing): number {
  if (kind === 'smoothstep') return smoothstep(t);
  if (kind === 'quintic') return quintic(t);
  return t; // linear
}

/* ───────────────────────── value noise (2D) ───────────────────────── */

/**
 * 2D value noise ∈ [0, 1).
 * 정수 격자 코너 4개의 무작위 값을, 완화된 보간 비율로 양선형(bilinear) 보간.
 */
export function valueNoise2D(x: number, y: number, seed: number, smoothing: Smoothing): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const v00 = valueAt(ix, iy, seed);
  const v10 = valueAt(ix + 1, iy, seed);
  const v01 = valueAt(ix, iy + 1, seed);
  const v11 = valueAt(ix + 1, iy + 1, seed);

  const ux = ease(fx, smoothing);
  const uy = ease(fy, smoothing);

  const top = lerp(v00, v10, ux);
  const bottom = lerp(v01, v11, ux);
  return lerp(top, bottom, uy);
}

/* ───────────────────────── Perlin gradient noise (2D) ───────────────────────── */

/**
 * 2D Perlin(그래디언트) 노이즈. 반환값은 대략 [−0.7, 0.7] (정규화로 ×√2 보정 가능).
 * 각 코너의 그래디언트와 (점 − 코너) 오프셋의 내적을 보간한다.
 * ⇒ 정수 격자점에서는 오프셋이 0이라 노이즈가 정확히 0.
 */
export function perlin2D(x: number, y: number, seed: number, smoothing: Smoothing): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  // 네 코너의 그래디언트 · (점 − 코너) 내적
  const dot = (cx: number, cy: number): number => {
    const [gx, gy] = gradientAt(cx, cy, seed);
    return gx * (x - cx) + gy * (y - cy);
  };

  const n00 = dot(ix, iy);
  const n10 = dot(ix + 1, iy);
  const n01 = dot(ix, iy + 1);
  const n11 = dot(ix + 1, iy + 1);

  const ux = ease(fx, smoothing);
  const uy = ease(fy, smoothing);

  const top = lerp(n00, n10, ux);
  const bottom = lerp(n01, n11, ux);
  return lerp(top, bottom, uy);
}

/** Perlin 값을 [0,1)로 매핑(시각화용). 출력 범위 ±√2/2 ≈ ±0.707을 가정해 정규화. */
export function perlin2D01(x: number, y: number, seed: number, smoothing: Smoothing): number {
  const n = perlin2D(x, y, seed, smoothing);
  return n * 0.7071 + 0.5; // ×(1/√2) 후 0.5 중심으로 이동
}

/* ───────────────────────── Simplex noise (2D) ───────────────────────── */

// 2D 단순(simplex) 격자 상수.
const F2 = 0.5 * (Math.sqrt(3) - 1); // skew
const G2 = (3 - Math.sqrt(3)) / 6; // unskew

/**
 * 2D simplex noise ∈ 대략 [−1, 1].
 * 정사각 격자를 비스듬히 기울여(skew) 삼각형 격자로 만들고,
 * 점이 속한 삼각형의 세 꼭짓점만으로 기여를 합산한다(코너 4→3 ⇒ 차원 비용↓).
 * 각 꼭짓점 기여 = (0.5 − r²)⁴ · (그래디언트 · 오프셋), r²는 꼭짓점까지 거리².
 */
export function simplex2D(xin: number, yin: number, seed: number): number {
  // 입력 좌표를 simplex 격자로 skew
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);

  const t = (i + j) * G2;
  const X0 = i - t; // unskew → 셀 원점의 실제 좌표
  const Y0 = j - t;
  const x0 = xin - X0; // 셀 원점 기준 오프셋
  const y0 = yin - Y0;

  // 점이 위/아래 삼각형 중 어디에 있는지 판정
  let i1: number;
  let j1: number;
  if (x0 > y0) {
    i1 = 1;
    j1 = 0; // 아래쪽 삼각형
  } else {
    i1 = 0;
    j1 = 1; // 위쪽 삼각형
  }

  // 나머지 두 꼭짓점에 대한 오프셋
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  // 한 꼭짓점의 기여 계산
  const corner = (cx: number, cy: number, dx: number, dy: number): number => {
    let tt = 0.5 - dx * dx - dy * dy;
    if (tt < 0) return 0; // 영향 반경 밖
    const [gx, gy] = gradientAt(cx, cy, seed);
    tt *= tt; // (0.5 − r²)²
    return tt * tt * (gx * dx + gy * dy); // (0.5 − r²)⁴ · (g·d)
  };

  const n0 = corner(i, j, x0, y0);
  const n1 = corner(i + i1, j + j1, x1, y1);
  const n2 = corner(i + 1, j + 1, x2, y2);

  // 스케일 보정 → 대략 [−1, 1]
  return 70 * (n0 + n1 + n2);
}

/** simplex 값을 [0,1)로 매핑(시각화용). */
export function simplex2D01(x: number, y: number, seed: number): number {
  return simplex2D(x, y, seed) * 0.5 + 0.5;
}

/* ───────────────────────── fBm (fractal Brownian motion) ───────────────────────── */

export type BaseNoise = 'value' | 'perlin';

/** 단일 옥타브의 부호 있는 노이즈(중심 0). value/perlin을 선택 가능. */
export function signedNoise(
  x: number,
  y: number,
  seed: number,
  base: BaseNoise,
  smoothing: Smoothing,
): number {
  if (base === 'perlin') return perlin2D(x, y, seed, smoothing) * 1.4142; // ×√2 정규화
  return valueNoise2D(x, y, seed, smoothing) * 2 - 1; // [0,1)→[−1,1)
}

/**
 * fBm: 옥타브 합. 옥타브마다 주파수 ×lacunarity, 진폭 ×gain.
 *   fBm(p) = Σ_{i=0}^{n−1} gain^i · noise(lacunarity^i · p)
 * 반환값은 [0,1)로 매핑(시각화용).
 */
export function fbm(
  x: number,
  y: number,
  opts: {
    seed: number;
    octaves: number;
    lacunarity: number;
    gain: number;
    base: BaseNoise;
    smoothing: Smoothing;
  },
): number {
  const { seed, octaves, lacunarity, gain, base, smoothing } = opts;
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0; // 진폭 합 → 정규화에 사용
  for (let o = 0; o < octaves; o++) {
    // 옥타브마다 seed를 살짝 바꿔 층끼리 상관(겹쳐 보임)되지 않게.
    sum += amp * signedNoise(x * freq, y * freq, seed + o * 1013, base, smoothing);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  const v = norm > 0 ? sum / norm : 0; // [−1,1) 근처로 정규화
  return v * 0.5 + 0.5; // [0,1)
}

/** fBm의 단일 옥타브 기여(중심 0.5로 매핑, 썸네일용). o는 0-기반 옥타브 인덱스. */
export function fbmOctave(
  x: number,
  y: number,
  o: number,
  opts: { seed: number; lacunarity: number; base: BaseNoise; smoothing: Smoothing },
): number {
  const { seed, lacunarity, base, smoothing } = opts;
  const freq = Math.pow(lacunarity, o);
  const n = signedNoise(x * freq, y * freq, seed + o * 1013, base, smoothing);
  return n * 0.5 + 0.5;
}
