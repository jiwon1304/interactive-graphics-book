# 핸드오프 — 메모리 대역폭과 Roofline (slug: `memory-bandwidth-roofline`)

섹션: **GPU ↔ 렌더링** (texture-compression / texture-filtering-mipmapping 인근).
작성: 2026-06. 스타일: 새 정책(비유 최소·용어 영어/발음 유지 — `bandwidth`·`roofline`·
`arithmetic intensity`·`ridge point`·`compute-bound`/`bandwidth-bound`·`DCC`·`Morton/Z-order`·
`fast clear`를 영어 그대로). 카탈로그 `topic-catalog-hw-rendering.md` §D(46~58) 흡수.

## chapters.ts 등록 제안 (오케스트레이터가 중앙에서 추가)

```ts
{
  slug: 'memory-bandwidth-roofline',
  title: '메모리 대역폭과 Roofline',
  description: '현대 GPU의 진짜 병목은 연산이 아니라 메모리 대역폭이다 — roofline model, 대역폭 예산, DCC·Morton swizzle',
  section: 'GPU ↔ 렌더링',
}
```

배치 순서 제안: **texture-compression 다음, tile-based-rendering 앞**(§D는 §C 압축 뒤,
§E 타일 앞). 대역폭=전력/타일 주제를 tile-based-rendering으로 넘기므로 그 직전이 자연스럽다.

## 목적과 범위

핵심 명제: "현대 GPU에서 진짜 병목은 연산이 아니라 **메모리 대역폭**이다." FLOPS가 대역폭보다
빨리 늘어(memory wall) 많은 커널이 데이터를 기다린다. 이를 **roofline model**로 형식화
(`P = min(P_peak, I·B)`, ridge point `I* = P_peak/B`) → 대역폭 예산 계산 → 하드웨어의 절약
수법(DCC, fast clear, Morton swizzle).

**멈춘 지점(="더 나아가기" 포인터로만):** Z/depth 압축(Golomb-Rice residual)·FMASK/MSAA HW·
채널/뱅크 인터리빙·displayable DCC. 대역폭=전력 + 타일 온칩 메모리는 1문장 언급 후
tile-based-rendering으로 링크(중복 방지).

## 위젯 (모두 `src/components/demos/memory-bandwidth-roofline/`)

자체 헬퍼 `mbr2d.ts`(re2d/tf2d 패턴 + roofline/대역폭 수학: rooflinePerf/ridgePoint/
frameBandwidthGBps/mortonEncode/linearEncode), `useCanvas2d.ts`(mbr2d import 버전),
`usePointerDrag.ts`(복사본). 격자/막대는 **fillRect**로 그림 → §5.1 putImageData 함정 원천 회피.

| # | 컴포넌트 | 가르치는 것 | 과정/결과 | 조작 |
|---|---|---|---|---|
| 1 | `ComputeVsBandwidth.tsx` | 연산 시간 막대 vs 데이터 대기 막대, 실제=max(둘); 대부분 bandwidth-bound | 과정 | Slider element당 FLOP(1~100) |
| 2 | `Roofline.tsx` | 로그-로그 두 지붕 min, ridge point, bw-bound↔compute-bound 전환 | 과정(점을 끌어 전환) | 커널 점 드래그 + Slider intensity |
| 3 | `BandwidthBudget.tsx` | BW = W·H·bpp·(r+w)·overdraw·fps vs GPU 예산, 초과 시 빨강 | 과정(계산기) | Select 해상도 + Slider bpp/overdraw/fps |
| 4 | `MortonSwizzle.tsx` | linear vs Morton 주소, 2D footprint가 닿는 캐시 라인 수 | 과정(footprint 끌기 + 토글) | Toggle Morton + Slider footprint + 드래그 |
| 5 | `DeltaColorCompression.tsx` | anchor+delta 비트 절감, gradient(잘됨) vs noise(안됨), 무손실 | 정적(데이터플로 구조) | 없음(정적) |

배치(MDX): 훅(FLOPS≫BW 숫자) → 1 → §1 intensity 정의 → §2 roofline 유도 → 2 →
§3 예산 유도 → 3 → §4 DCC+fast clear → 5 → §5 Morton → 4 → §6 조립 → §7 더 나아가기.
(주의: §4가 DCC라 위젯5(DCC)를 먼저, §5가 swizzle이라 위젯4(Morton)를 나중에 — 본문 순서대로.)

## 유도된 수학 (MDX, KaTeX)

- arithmetic intensity: `I = FLOP / byte`.
- roofline: `P ≤ P_peak`, `P ≤ I·B`(단위 byte 약분 → FLOP/s), `P = min(...)`,
  ridge `I* = P_peak/B`. 예시 숫자 40 TFLOP/s, 1 TB/s → I*=40 FLOP/byte.
- 대역폭 예산: `BW = W·H·bpx·(read+write)·overdraw·fps`. 1080p/RGBA8/×2/od3/60fps ≈ 3 GB/s
  (컬러만; depth/텍스처/정점 제외 강조).
- DCC: `크기 = 8 + 15·b_δ bit`(4×4, 8bpc), 절감비 `128/(8+15b_δ)`. b_δ=2 → 3.4×.
- Morton: `addr_linear = y·W + x`; `Morton(x,y) = y2 x2 y1 x1 y0 x0`(비트 인터리브, x 짝수/y 홀수).

## 기술 노트 / 단순화 (적대적 검수 대상)

- **숫자**는 *대표 차수*다(40 TFLOP/s, 1 TB/s, GPU_BUDGET=448 GB/s, I*=40). 특정 칩 스펙 아님 —
  "FLOPS≫BW, I*가 수십 FLOP/byte"라는 *차수*가 메시지. 위젯 내부 PEAK/B는 도식이 잘 보이는
  임의 단위(ComputeVsBandwidth는 20:1, Roofline은 PEAK=20000 GFLOPS·B=1000 GB/s → ridge 20).
- **ComputeVsBandwidth**: 연산·전송이 *완전히 겹친다*고 가정해 실제=max(둘). 실제론 부분 겹침이지만
  roofline의 핵심 직관(둘 중 긴 쪽이 지배)을 보이는 표준 단순화.
- **Roofline**: x=log2(I) 슬라이더(I_MIN..I_MAX=0.25..256), y=GFLOPS 로그. 드래그는 x→log2 I.
  점은 항상 `min(PEAK, I·B)`에 놓여 지붕을 못 넘음(=achievable 정의). 점선=점에서 지붕까지 여유.
- **BandwidthBudget**: read+write=2 고정(블렌딩). **컬러만** 셈한다고 캡션에 명시(depth/텍스처/정점
  제외 — 그래서 "이미 빠듯"이 더 충격적). frameBandwidthGBps는 /1e9(GB=10^9 byte) 일관.
- **MortonSwizzle**: 8×8(BITS=3), cache line=연속 4 주소. footprint(2~4²)가 닿는 *서로 다른
  캐시 라인 수*를 셈해 색칠. "이상적"=ceil(texels/4). 회색 곡선=주소 순서(linear=뱀, Morton=Z).
  실제 GPU swizzle은 벤더/포맷마다 다르고 tiled+Morton 혼합이지만, 원리(2D 지역성→라인 지역성)는 동일.
  드래그=footprint 이동(중심을 포인터에, GRID 경계로 클램프).
- **DeltaColorCompression**: 단일 8-bit 채널로 단순화(RGB 셋이 아님). delta 비트폭 =
  `ceil(log2(maxAbs+1)) + 1`(sign 포함). gradient=60+(x+y)·12(매끈), noise=결정적 LCG(SSR 안전).
  무손실·메타데이터·30~70% 평균 절감은 본문 서술. 막대 good 임계 ratio≥1.4.
- 색: COLORS 의미색(`as const`), 가변 hex는 `string`. TS strict 통과(내 폴더 tsc 0 errors;
  controls의 *.module.css 미해결은 Astro 환경에서만 풀리는 정상 경고).
- 절차적/상수만(외부 fetch 없음). SSR 안전. KaTeX는 MDX 본문만(캡션엔 $ 안 씀 — Roofline 캡션은
  P=I·B 등을 일반 텍스트로).

## 펜딩 — 브라우저 시각 검증 (빌드/타입 통과 ≠ 올바른 렌더)

- **ComputeVsBandwidth**: FLOP 슬라이더 ↑ 시 파랑 막대 자라고, 어느 지점에서 점선(실제시간)이
  파랑으로 옮겨가며 "compute-bound"로 바뀌나(20:1이므로 flops≈80에서 전환). 모바일 좁폭 라벨.
- **Roofline**: 점 드래그(iOS 터치 포함)가 따라오나. ridge=20 점선 위치, 점이 지붕 못 넘는지,
  bound 색/문구가 ridge 좌우로 바뀌나. y축 라벨(250/1k/…) 겹침. **canvas y-down** — 위가 고성능.
- **BandwidthBudget**: 4K+FP16+od높음+144fps에서 필요 막대 빨강+예산선 넘김. 720p 낮은 설정은 초록.
  막대 안 숫자가 막대 짧을 때 밖으로 나오나.
- **MortonSwizzle**: 토글 시 회색 곡선이 뱀↔Z로, 같은 footprint에서 라인 수(색 가짓수)가 Morton에서
  줄어드나. 드래그로 블록 이동. 모바일에서 8×8 격자가 잘리지 않나.
- **DeltaColorCompression**: 두 블록 나란히, anchor 보라 테두리, gradient 막대 짧음(초록)·noise 김(빨강).
  좁폭(≤400px)에서 두 블록·막대·캡션 겹침/잘림.
- 라이트/다크 모두.

## 확장 / 관련

- Z/depth 압축·FMASK·채널 인터리빙·displayable DCC → 후속 위젯/챕터(현재 더 나아가기 포인터).
- 교차링크(bare 상대 슬러그): `tile-based-rendering`(대역폭=전력·온칩 타일 — **아직 미작성** 챕터),
  `texture-compression`(블록 압축), `rendering-execution-model`(early-Z·overdraw 픽셀 백엔드).
  ⚠️ `tile-based-rendering`은 아직 .mdx가 없으므로, 그 챕터 작성 전엔 링크가 죽는다 —
  오케스트레이터가 등록/작성 순서를 맞추거나, 미작성이면 일시적으로 평문으로 둘 것.
