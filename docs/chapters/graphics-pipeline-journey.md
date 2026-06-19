# 핸드오프: 삼각형의 여정 — 정점에서 픽셀까지

- **slug**: `graphics-pipeline-journey`
- **section**: `GPU ↔ 렌더링`
- **파일**: `src/pages/chapters/graphics-pipeline-journey.mdx` + `src/components/demos/graphics-pipeline-journey/`
- **레벨/성격**: 개요(overview) 챕터. 한 삼각형이 하드웨어 파이프라인을 처음부터 끝까지
  통과하는 전 과정. 깊은 단계별 챕터(`gpu-execution-model`, `rendering-execution-model`)로
  내려가는 허브 역할. 참고 출처: Fabian Giesen, "A Trip Through the Graphics Pipeline 2011".

## 목적과 범위

IA → VS → PA → 클리핑·컬링 → 원근 분할(÷w)·뷰포트 → 삼각형 셋업(에지 함수) →
래스터화(커버리지·2×2 쿼드) → early-Z → 픽셀 셰이더 → ROP(깊이 테스트·블렌드·쓰기)를
**한 삼각형의 시점**으로 직선 서사로 걷는다. 각 단계의 *깊은* 메커니즘(쿼드 다이버전스,
Hi-Z, 타일 비닝 등)은 일부러 다루지 않고 다음 챕터로 포인터만 남긴다.

**통일 테마**: 에지 함수 한 줄
`E(x,y)=(x−x0)(y1−y0)−(y−y0)(x1−x0)`이 컬링(부호 있는 면적)·커버리지(세 부호 일치)·
보간(무게중심 = 에지 함수 비율) 셋을 모두 떠받친다는 점을 반복적으로 못 박는다.

## 유도한 수학 (본문 KaTeX)

- 인덱스 버퍼 절약: 닫힌 메시 `T ≈ 2V` → 정점 복제 `3T≈6V` vs 인덱스 `V + 6V 정수`.
- 부호 있는 면적 2배 = 2D 외적 = `E_AB(C)`. 부호 → 와인딩(CW/CCW). 캔버스 y-down이라
  화면상 시계가 양수임을 명시.
- Sutherland–Hodgman 교점 보간 `t = f0/(f0−f1)`. 면 하나=사각형, 모서리=오각형.
- 원근 분할 `x_ndc = x_c/w_c ∈ [−1,1]`, 뷰포트 변환(y 뒤집기 포함).
- 원근 보정 보간: 속성을 1/w 가중으로 보간 후 재분할(공식 본문에 전개).
- 에지 함수 유도 + 내부 조건(세 부호 일치) + **점진적 평가**(한 칸 이동 = 상수 덧셈
  `+a`, `+b`) → 셋업이 변마다 계수 2개만 계산하면 래스터화가 덧셈만으로 도는 이유.
- 무게중심 좌표 `λ_A = E_BC(P)/2Area` 등, 합=1이 에지 함수 합 항등식에서 자동.
- early-Z 비용 어림: 오버드로 `d` → 셰이딩 비용 `d` vs `O(log d 또는 1)`.

## 인터랙티브 위젯 (6개; 도식 안 글자는 라벨만, 설명은 figcaption)

1. **PipelineFlow** (STATIC) — 전체 단계 사슬을 2행 뱀(boustrophedon) 배치로. 세 영역
   색 구분(지오메트리/래스터/프래그먼트) + 범례. 짧은 단계명만(IA, VS, ÷w …). 챕터 지도.
2. **EdgeFunctions** (INTERACTIVE, 과정) — 정점 A·B·C 드래그. 픽셀 격자를 훑어 세 에지
   함수 부호가 모두 같은 픽셀을 초록으로 칠함. 슬라이더: 픽셀 크기(앨리어싱 체감),
   토글: 에지 라벨. **핵심 위젯** — 래스터화의 부호 판정을 직접 본다.
3. **BackfaceCulling** (INTERACTIVE, 과정) — 정점 드래그로 와인딩을 뒤집어 부호 있는
   면적이 0을 지나 부호가 바뀌고 정면↔후면 토글(후면은 빨강 빗금 + "컬링"). 순회 화살표
   A→B→C, 상태 패널(2·면적·와인딩·판정). 토글: 정면=CW/CCW 규칙.
4. **Clipping** (INTERACTIVE, 과정) — 빈 공간 잡아 삼각형 전체 이동 / 핸들로 정점 이동.
   클립 사각형(가시 영역)에 대해 4면 Sutherland–Hodgman을 적용, 새로 생긴 꼭짓점은 보라
   점. 결과 다각형의 꼭짓점 수를 우상단에 표시(삼각형→사각형→오각형). 토글: 핸들 표시.
5. **PerspectiveDivide** (INTERACTIVE, 과정) — 좌 패널: 클립 공간(÷w 전, 정점 드래그).
   우 패널: ÷w 후 NDC→뷰포트. 슬라이더: 정점 A·C의 w(깊이 단축). 우 패널에 텍스처 좌표
   u의 줄무늬를 **원근 보정 on/off**(토글)로 그려, off면 휘는 걸 보인다(naive 실패 시연).
6. **RopBlend** (STATIC) — ROP 3관문 흐름도: ① 깊이 테스트(실패→버림 분기) → ② 블렌딩
   (`src·α + dst·(1−α)`, dst를 프레임버퍼에서 읽는 화살표) → ③ 쓰기(프레임버퍼 셀로).

## 기술 노트 / 단순화

- **좌표계**: 인터랙티브 삼각형은 캔버스 픽셀 공간(y-down)을 "스크린 공간"으로 *직접*
  쓴다(매퍼 없음). 실제 래스터라이저 좌표계와 일치 → 직관과 부합. 그래서 본문에서
  "캔버스 y-down이라 화면상 시계가 양수"라고 부호 방향을 명시했다(AUTHORING §5.5).
- **헬퍼**: 자급자족 폴더. `gpj2d.ts`(테마/HiDPI/그리기 + 에지함수·부호넓이·바리센트릭·
  Sutherland–Hodgman 수학), `useCanvas2d.ts`(매퍼 없는 버전), `usePointerDrag.ts`(복사본).
  HiDPI는 setupCanvas(dpr≤2)로, 벡터/픽셀 직접 그리기라 `putImageData` 안 씀(§5.1 안전).
- **드래그**: 전부 `usePointerDrag`(네이티브 {passive:false} + useRef drag + touch-action:none).
  iOS Safari 함정 회피(§5.2). 정점 픽킹은 최근접 핸들 24~26px 반경.
- **Clipping**: 클립 사각형은 클립 박스의 2D 단면(좌우상하 4면). 근/원평면(±w)은 본문
  텍스트로만 설명. 실제 GPU 가드밴드 최적화는 `<details>`로 솔직히 단서.
- **PerspectiveDivide**: w는 0.5~4 양수로만 → ÷w 부호 안전. 클립 XY를 패널 [0..1]로
  정규화 후 `(n*2−1)/w`로 NDC화. 보간은 화면(post-÷w) 바리센트릭 + invW 가중.
- **COLORS는 `as const`** (literal 타입). 모든 사용처는 `color: string` 파라미터로 넘겨
  widening되므로 literal-narrowing 에러 없음. 가변 색 변수는 없음.

## 서사/재미 의도

- 훅: "삼각형은 좌표 3개인데 어떻게 수천 픽셀이 되나?" → 전체 지도 → 한 단계씩.
- gpu-execution-model의 보이스 매칭: 직관 손잡이 박스, "여기서 가장 헷갈리는 지점",
  predict-then-reveal(모서리 넘기면 오각형), 2-독자 `<details>`(가드밴드/2×2 쿼드).
- naive 실패 시연: PerspectiveDivide의 원근보정 off → 텍스처 휨(PS1 텍스처 흔들림 비유).
- 클로징: "모든 게 부호 하나를 재는 같은 곱셈으로 엮여 있었다."

## chapters.ts 등록 (오케스트레이터가 중앙 등록)

```ts
{
  slug: 'graphics-pipeline-journey',
  title: '삼각형의 여정 — 정점에서 픽셀까지',
  description: '삼각형 하나가 GPU 파이프라인을 통과하는 전 과정 — IA·정점 셰이더·클리핑·원근 분할·에지 함수 래스터화·early-Z·픽셀 셰이더·ROP',
  section: 'GPU ↔ 렌더링',
}
```

순서 제안: `gpu-execution-model` / `rendering-execution-model`과 같은 섹션. 이 챕터가
*개요*이므로 두 심화편 **앞**에 두는 게 자연스럽다(개요→깊이). `command-queues`,
`transformations`로도 상호 링크(본문은 base-respecting 상대 slug 링크 사용).

## 상호 링크 (본문에 이미 있음)

- `gpu-execution-model`(워프/락스텝/코어 수), `rendering-execution-model`(2×2 쿼드/
  early-Z·Hi-Z 심화), `command-queues`(드로우 콜 제출), `transformations`(변환 행렬 유도).

## TODO / 확장

- (선택) 클립 후 다각형 → 삼각형 부채꼴 분할을 보이는 작은 위젯.
- (선택) 컨서버티브 래스터화 / MSAA 커버리지 위젯.
- 타일 기반(모바일) 래스터화에서 이 단계들이 온칩 타일로 재배치되는 챕터로의 포인터.

## 브라우저 검증 권장 (빌드 통과 ≠ 올바른 렌더)

- **EdgeFunctions**: 삼각형 안 픽셀만 초록인지, 픽셀 크기 슬라이더로 계단 변화, 정점
  드래그가 모바일 터치에서도 따라오는지.
- **BackfaceCulling**: C를 AB 너머로 끌 때 *정확히* 일직선 순간에 토글되는지, 빗금/패널
  텍스트가 안 깨지는지, 화살표가 A→B→C 방향(시계/반시계)으로 올바른지.
- **Clipping**: 한 면 넘김=사각형, 모서리 넘김=오각형, 완전 밖=버림 카운터. 새 꼭짓점
  보라 점 위치. 전체 이동(빈 공간 드래그) vs 정점 이동(핸들).
- **PerspectiveDivide**: 좌/우 2패널 레이아웃이 좁은 모바일에서 안 겹치는지(가능하면
  세로 비율 점검), 원근보정 off 시 줄무늬가 *휘는지*, w 키우면 우 삼각형이 단축되는지.
- **PipelineFlow / RopBlend**: 라이트/다크 양쪽에서 박스·텍스트 대비, 박스 겹침/넘침 없는지.
- 모든 위젯 라이트/다크 토글, 모바일 폭(≤400px)에서 캔버스 라벨 안 깨지는지.
