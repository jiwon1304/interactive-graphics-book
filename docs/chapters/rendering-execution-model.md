# 핸드오프 노트 — 렌더링에서의 GPU 실행 (rendering-execution-model)

## 목적과 범위
[`gpu-execution-model`](../../src/pages/chapters/gpu-execution-model.mdx)에서 세운 실행 모델
(워프 32 레인 락스텝 / SIMT)을 **픽셀 셰이딩**으로 내려보내는 후속 챕터. 핵심 명제 두 개:

1. **픽셀 셰이딩은 2×2 쿼드 단위로 돈다** — 그 이유가 화면공간 미분(`ddx`/`ddy`)이고,
   그 미분이 텍스처 LOD($\lambda = \log_2 \rho$)를 정한다. 대가는 헬퍼 레인(쿼드 오버셰이딩).
2. **셰이딩은 비싸니 그 전에 거른다** — early-Z(픽셀), Hi-Z(타일), 깊이 프리패스(전체)가 모두
   "셰이딩하기 전에 가려질 것을 버린다"는 한 철학의 세 층위. 모두 *앞→뒤 정렬*에서 가장 잘 듣는다.

어디서 멈췄나: LOD는 *선택*까지만(밉 사이 보간=삼선형, 이방성은 "더 나아가기"로 넘김).
워프 단위 픽셀 다이버전스, TBR, 가시성 버퍼/Nanite는 포인터만 남기고 다음 챕터로.

상위 카탈로그: `docs/topic-catalog-hw-rendering.md` §A(1,2,3,5,8,10,11번 항목을 이 챕터로 흡수).

## 크로스링크
- 본문 3곳에서 `[…](gpu-execution-model)` **bare 상대 슬러그**로 링크. gpu-execution-model.mdx가
  `command-queues`를 링크하는 방식과 동일 — 현재 페이지(`/base/chapters/<slug>`) 기준 상대라
  `astro.config.mjs`의 `base`를 자동 존중한다(절대경로 안 씀).

## 위젯 목록 (모두 INTERACTIVE 2D canvas, 캔버스 안 글자 최소 · 설명은 figcaption)
폴더: `src/components/demos/rendering-execution-model/`

| # | 컴포넌트 | 가르치는 것 | 과정/결과 | 조작 | 카운터 |
|---|---|---|---|---|---|
| 1 | `PixelQuads.tsx` | 삼각형이 닿은 2×2 쿼드 전체가 셰이딩됨; covered(파랑 채움) vs helper(주황 빗금) | **과정**(래스터화가 쿼드째 번진다) | 삼각형 3꼭짓점 드래그 | 헬퍼 % (작을수록 ↑) |
| 2 | `QuadDerivatives.tsx` | `ddx = right − me`, `ddy = below − me` 유한차분 | **과정**(미분의 출처) | 쿼드 hover/drag 선택 | ddx·ddy·u값 |
| 3 | `EarlyZvsLateZ.tsx` | 그리기순서 × early/late 토글이 PS 호출 수를 바꿈 | **과정**(front-to-back+early-Z=최소) | SelectControl 순서 + ToggleControl earlyZ | PS 호출 / 낭비 |
| 4 | `HiZTileCull.tsx` | 타일 [zMin,zMax]로 삼각형을 통과/기각/테스트 분류 | **과정**(타일째 컬링) | Slider 삼각형 깊이 z | 통과·기각·테스트 타일 수 |
| 5 | `OverdrawPrepass.tsx` | 오버드로 히트맵 + 깊이 프리패스가 식힘 | **과정**(겹침 비용→프리패스로 1회) | Toggle 프리패스 + Slider 레이어·겹침 | 평균 셰이딩 ×/픽셀 |

배치 의도: 1(훅: 쿼드가 번진다) → 2(왜 쿼드인가=미분) → 본문 §1에서 LOD 유도 후 §2 헬퍼 →
3(early-Z) → 4(Hi-Z) → 5(조립: 오버드로+프리패스). 본문 §1에서 1·2를 회수해 "왜 2×2"를 닫는다.

## 공용 코드
- **`re2d.ts`** (이전 런이 작성, 재사용): `setupCanvas`/`readTheme`/`observeTheme`(HiDPI·테마),
  `blitImage`(putImageData 변환 함정 회피, AUTHORING §5.1), `withAlpha`/`hexToRgb`/`mixRgb`,
  `COLORS`(의미색: covered/helper/pass/reject/maybe/front/back), `roundRect`/`hatch`/`label`/`monoFont`,
  `pointerToCanvas`. **COLORS는 `as const`** — 변수에 담아 재대입하면 리터럴 좁힘 에러 날 수 있으니
  필요하면 `string`으로 명시(현재 코드는 직접 read만 해서 문제없음).
- **`usePointerDrag.ts`** (이전 런이 작성, 재사용): iOS Safari 안전판. 네이티브 `{passive:false}`
  리스너 + `useRef` 드래그 상태 + `setPointerCapture` try/catch. PixelQuads·QuadDerivatives가 사용.
- **`useCanvas2d.ts`** (이번 런이 추가): re2d 프리미티브를 묶어 리사이즈/테마 변경/deps 변화 시
  재드로우. raymarching-sdf의 동명 훅과 같은 패턴(단 좌표 매퍼는 위젯마다 달라 제외 — 각 위젯이
  픽셀 좌표로 직접 그림). 5개 위젯 전부 이 훅으로 그린다.

## 기술 노트 / 단순화한 부분 (적대적 검수 대상)
- **깊이 규약**: 전 위젯에서 **값이 클수록 멀다**(0=가까움, 1=멈). HiZ/EarlyZ가 일관.
- **HiZTileCull**: 삼각형을 *평평한 단일 깊이* `zTri`로 단순화(실제 삼각형은 타일 안에서 깊이가
  변함). 도식 목적상 충분. 분류는 보수적 Hi-Z 규칙(`>zMax`만 기각, 걸치면 정밀 테스트).
- **EarlyZvsLateZ**: 영역을 A-only/overlap/B-only 3구간으로 추상화하고 면적 가중치는 고정 정수.
  "뒤→앞 순서에선 early-Z를 켜도 B 겹침 셰이딩을 못 막는다"가 핵심 결론 — 코드 `invocations()`가
  이를 정확히 모델링(backToFront면 overlapB가 항상 AREA_OVERLAP, frontToBack+earlyZ면 0).
- **OverdrawPrepass**: 오버드로 = "그 픽셀을 덮는 디스크 수". 프리패스 ON이면 픽셀당 1회로 클램프.
  정사각 히트맵을 화면 정사각 영역(side×side)에만 그리려고 `blitImage`(캔버스 전체용) 대신 임시
  오프스크린+`drawImage(off, ox, oy, side, side)`로 직접 그림 — **putImageData를 dpr ctx에 직접
  찍지 않으므로 §5.1 함정 회피**(off→drawImage는 변환 존중). `imageSmoothingEnabled=false`로 셀 또렷.
- **PixelQuads 헬퍼 %**: 렌더 중 `setStats`를 호출하되 값이 바뀔 때만(가드) — 무한 리렌더 방지.
  deps에 `stats`가 들어가 있지만 동일 값이면 setState가 no-op이라 안정.

## 수식 (본문에서 유도)
- 유한차분: `∂f/∂x ≈ f(1,0)−f(0,0)` (h=1 픽셀이라 나눗셈 사라짐).
- LOD: `ρ = T·|∇uv|`, `λ = log₂ max(ρx,ρy)`. 거리 2배 → λ +1(밉 한 레벨). $\log_2$의 의미 강조.
- 헬퍼 비율 `~ 둘레/면적 ~ 1/√A` → 작은 삼각형에서 폭발(1px 삼각형=75%).
- early-Z: `late=D, early(앞→뒤)=1`, 절약 `D−1`.
- 프리패스 손익: `(1+ε) vs D` → `D>1+ε`면 이득.

## 서사/재미 의도
- 훅: "워프가 락스텝으로 돈다고 했다 — 그런데 픽셀 셰이더는 2×2 쿼드 단위로 돈다." (지난 챕터 회수)
- naive 실패: late-Z가 가려질 픽셀을 다 셰이딩하는 것을 EarlyZ 위젯에서 토글로 보임.
- predict-then-reveal: ① T=33 워프(지난 챕터 콜백 아님) 대신 — 거리 2배→λ+1(밉이 천천히 흐려짐),
  ② 작은 삼각형 헬퍼 75%.
- 직관 손잡이: ddx="오른쪽 친구가 나보다 얼마나 더 갔나", Hi-Z="문틈으로 방 들여다보기",
  프리패스="안 보일 걸 알면 칠하지도 않는다".
- 2-독자 `<details>`: coarse/fine, early-Z 끄는 조건(discard/SV_Depth), Hi-Z 무력화 조건.

## TODO / 확장
- 텍스처 필터링 챕터(삼선형·이방성)로 LOD를 *쓰는* 쪽 이어가기 — 이 챕터는 *선택*까지만.
- 워프 단위 픽셀 다이버전스 위젯(인접 픽셀=같은 분기, 머티리얼 경계에서 다이버전스 부활) 별도 챕터.
- 브라우저 검증 후 필요 시 캔버스 높이/폰트 크기 모바일 미세조정.

## chapters.ts 등록 제안 (오케스트레이터가 중앙 등록 — 이 챕터는 건드리지 않음)
새 섹션 **`GPU ↔ 렌더링`** 아래, `gpu-execution-model` 바로 다음:
```ts
{
  slug: 'rendering-execution-model',
  title: '렌더링에서의 GPU 실행 — 픽셀 쿼드와 깊이 컬링',
  description: '워프 락스텝이 픽셀 셰이딩으로 — 2×2 쿼드·화면공간 미분과 밉 LOD·early-Z/Hi-Z/오버드로',
  section: 'GPU ↔ 렌더링',
}
```
(같은 섹션에 `command-queues`·`gpu-execution-model`도 함께 묶는 것을 제안. 현재 그들의 section 값을
확인해 일치시킬 것.)

## 브라우저 검증 체크리스트 (제출 전 눈으로)
- [ ] **PixelQuads**: 꼭짓점 드래그(특히 iOS 터치)로 점이 따라오나; 삼각형 줄이면 헬퍼 % ↑; 빗금=헬퍼.
- [ ] **QuadDerivatives**: 데스크톱 hover로 쿼드 선택; 위(먼 쪽)로 갈수록 ddx/ddy 커지나; 화살표 방향
      (right=가로, below=세로) 맞나 — **canvas y-down 부호 주의**(§5.5).
- [ ] **EarlyZvsLateZ**: 뒤→앞+earlyZ ON에서도 낭비가 남고, 앞→뒤+earlyZ ON에서 낭비 0 되나.
- [ ] **HiZTileCull**: z 슬라이더 올리면 빨강(기각) 타일 증가; 범위 넓은 타일은 오래 "테스트"로 남나.
- [ ] **OverdrawPrepass**: 프리패스 토글 시 히트맵이 빨강→파랑으로 식나; 평균 1.00×; 레이어↑면 대비↑.
- [ ] 라이트/다크 테마 둘 다, 모바일 폭에서 캔버스·컨트롤 레이아웃 정상.
