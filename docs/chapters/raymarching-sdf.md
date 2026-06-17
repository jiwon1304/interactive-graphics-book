# 챕터 핸드오프: 레이마칭과 거리장(SDF)

- **slug**: `raymarching-sdf`
- **section**: 절차적 생성
- **mdx**: `src/pages/chapters/raymarching-sdf.mdx`
- **데모 디렉터리**: `src/components/demos/raymarching-sdf/`

> 주의: `src/chapters.ts` 등록은 이 작업 범위 밖이라 **건드리지 않았습니다.** 사이드바/이전·다음에
> 노출하려면 상위(L1) 작업에서 `chapters` 배열에
> `{ slug: 'raymarching-sdf', title: '레이마칭과 거리장(SDF)', description: '스피어 트레이싱·거리장·스무스 민', section: '절차적 생성' }`
> 를 순서에 맞게 추가하세요.

## 챕터 목적

거리장(SDF) 위에서의 **스피어 트레이싱 과정**을 직관적으로 이해시키는 것이 목표입니다. 결과
이미지보다 “광선이 한 칸씩 어떻게 전진하는가, 왜 표면 근처에서 스텝이 촘촘해지는가, 예산이
부족하면 무엇이 먼저 깨지는가”를 만져 보게 합니다. 2D 위젯 5개로 과정을 분해하고, 마지막
3D 셰이더 위젯에서 모든 조각을 합쳐 결과물을 보여줍니다.

## 공용 유틸 (위젯 6개가 공유)

- `sdf2d.ts` — 2D 벡터 연산, SDF 프리미티브(`sdCircle`/`sdBox`), `smin`/`smax`/`combine`,
  씬↔픽셀 매퍼(`makeMapper`, 씬 가로범위 x∈[-2,2]), 테마 색 읽기(`readTheme`), 색 램프
  (`distanceColor`, `iterColor`), HiDPI 캔버스 셋업(`setupCanvas`, dpr 상한 2),
  포인터→캔버스 좌표, `observeTheme`(html[data-theme] 변경 감시).
- `useCanvas2d.ts` — 2D 위젯 공용 훅. HiDPI 셋업 + ResizeObserver + 테마 변경 재드로우 +
  deps 변경 재드로우. `draw(ctx,w,h,theme,map)` 콜백 한 개로 모든 위젯을 그린다.

모든 2D 위젯은 같은 씬(원 + 박스의 smooth-union)을 약간씩 변형해 쓰고, 색은 전역 CSS 변수를
읽어 **라이트/다크에 자동 적응**합니다.

## 위젯별 정리

### 1. SdfHeatmap.tsx — 과정(장 읽기)
- **개념**: 거리장은 표면뿐 아니라 공간 전체에서 정의된 실수값. 부호거리 히트맵 + 등거리선 +
  커서 탐침으로 “안전원”(반경=거리값)을 보여줌.
- **PROCESS/RESULT**: PROCESS (장을 읽는 행위).
- **주요 상태**: `probe`(커서 씬좌표), `showIso`. 씬은 상수(`CIRCLE_C/R`, `BOX_C/B`, `BLEND_K`).
- 커서는 포인터 이벤트로 추적, `setPointerCapture` 사용.

### 2. SphereTraceSteps.tsx — 핵심(스텝)
- **개념**: 안전 거리 $h$만큼 점프하는 스피어 트레이싱. 각 점에서 안전원 + 점프 + 스텝 번호,
  라이브 스텝 카운터, t·h 읽기값.
- **PROCESS/RESULT**: PROCESS (마칭 한 스텝씩).
- **주요 상태**: `origin`(드래그), `angleDeg`(슬라이더/탭), `stepIdx`(스텝 슬라이더).
- **파라미터**: `MAX_STEPS=40`, `EPS=0.01`, `FAR=6`.
- 원점 핸들 근처 클릭 시 드래그, 그 외 탭은 그 방향으로 광선 각도 설정.

### 3. StepBudget.tsx — 과정(이미지 신뢰도)
- **개념**: 전체 이미지가 형성되는 과정. 직교 카메라로 **열(column)마다** 위→아래(-y) 광선을
  하나씩 마칭(`marchColumn`)해 히트/미스 판정. 히트면 법선 램버트 셰이딩, 미스면 배경.
- **PROCESS/RESULT**: PROCESS (예산에 따른 이미지 붕괴).
- **컨트롤**: `최대 스텝 수`(4..128), `엡실론 ε`(0.0005..0.1), `스텝 수 히트맵` 토글
  (`iterColor`, 보라→노랑).
- 스텝을 낮추면 **스치는 실루엣(가장자리)부터** 침식됨 — 거기서 안전원이 작아 스텝이 많이 듦.

### 4. SmoothMinBlend.tsx — 과정(거리장 산술)
- **개념**: 두 원(A·B)의 거리장을 연산으로 합성. 등거리선 + 부호거리 히트맵으로 시각화.
- **PROCESS/RESULT**: PROCESS (필드 합성).
- **컨트롤**: `연산`(합집합 smin / 교집합 smax / 차집합), `스무스 민 k`(0..1).
- A·B 원을 드래그(포인터). `combine(a,b,op,k)`로 합성.

### 5. NormalsShadow.tsx — 과정(부산물)
- **개념**: 법선($\nabla f$, 중심차분)과 소프트 섀도우($\min(k\,h/t)$ 누적)는 $f$의 부산물.
  표면 둘레에 법선 화살표, 바닥 평면에 소프트 섀도우 음영.
- **PROCESS/RESULT**: PROCESS (셰이딩 재료가 따라옴).
- **컨트롤**: `그림자 선명도 k`(2..48), `법선 화살표` 토글. 광원(노란 점)을 드래그.
- `projectToSurface`: 뉴턴 스텝 `p -= f(p)*n`을 8회 반복해 표면 위 점을 찾음.

### 6. RaymarchScene.tsx — 결과물(R3F GLSL3 셰이더)
- **개념**: 풀스크린 프래그먼트 셰이더로 구+박스 smooth-union을 바닥 평면 위에 실시간 렌더.
- **PROCESS/RESULT**: 주로 RESULT, 단 “스텝 히트맵” 토글이 PROCESS 창을 겸함.
- **컨트롤(모두 `<Canvas>` 밖)**: `스무스 민 k`(0..1.2), `광원 회전`(0..360°),
  `소프트 섀도우`, `앰비언트 오클루전`, `스텝 히트맵` 토글.
- **카메라**: OrbitControls 미사용. `yaw`/`pitch`를 ref로 들고 래핑 div의 포인터 드래그로 구동,
  매 프레임 유니폼에 반영. 구면 좌표 반지름 4.2.

## 셰이더 / 수학 노트

- **풀스크린 쿼드**: `<planeGeometry args={[2,2]}/>` + `gl_Position = vec4(position.xy,0,1)`.
  `frustumCulled={false}`, `depthTest/Write=false`. `THREE.ShaderMaterial`(소문자 JSX가 아니라
  `useMemo`로 생성해 `<primitive>`로 attach) + `glslVersion: THREE.GLSL3`. GLSL3이므로
  `in/out`, `out vec4 outColor` 사용. `ShaderMaterial`은 `position`/`projectionMatrix` 등을
  자동 주입하지만 여기선 클립공간 직접 출력이라 사용 안 함.
- **smin (IQ 다항식)**: `h = max(k-|a-b|,0)/k; return min(a,b) - h*h*k*0.25;` (2D `sdf2d.ts`와
  셰이더가 동일 공식 — 둘 다 정규화 형태라 결과가 일치).
- **스피어 트레이싱 루프**: `t=0; p=ro+rd*t; h=map(p); t+=h; h<EPS=히트, t>FAR=미스`.
  셰이더 `MAX_STEPS=96`, `EPS=0.001`, `FAR=30`.
- **법선(4-탭 테트라헤드론)**: `e=(1,-1)*0.0008` 네 방향 `map` 평가의 가중합 정규화.
- **소프트 섀도우**: 표면점에서 광원으로 마칭, `res=min(res,k*h/t)`, `h<0.001`이면 완전 그림자.
- **AO**: 법선 방향 5개 샘플의 `(hr - map(p+n*hr))` 누적.
- **테마 적응**: 매 프레임 `--surface`/`--accent`를 `getComputedStyle`로 읽어 sRGB→선형 변환 후
  유니폼에 복사.

## 인터랙션/몰입 의도

- 오프닝 훅: “삼각형 하나 없이 매끄러운 곡면을?”
- 각 위젯 아래 **직접 해보세요** 콜아웃으로 정확히 무엇을 드래그/관찰할지, 그리고 “놀라운
  포인트”(예: 스치는 실루엣이 먼저 무너짐, 메타볼 용접)를 짚어 줌.
- 질문 던지기(“왜 표면 근처에서 스텝이 촘촘해질까요?”) → 다음 위젯이 답이 되도록 배치.

## 한계 / TODO

- 2D 위젯들은 **개념 설명용 예시**입니다. 실제 3D 마칭과 1:1 대응은 아니며(특히 StepBudget의
  직교 열-마칭), 직관 전달이 목적입니다.
- 3D 셰이더는 **WebGL2/GLSL3 전용**. WebGPU 미사용(모바일 호환성). 셰이더는 매 프레임 풀스크린
  레이마칭이라 저사양 모바일에서 발열/배터리 부담 가능 — `client:visible`로 가시 시에만 로드하고
  DemoCanvas dpr 상한 2를 그대로 사용.
- 2D 위젯은 픽셀 블록(2~3px)으로 샘플링해 성능을 확보(완전 픽셀단위 아님).
- 등거리선은 마칭스퀘어가 아니라 `|f-level|<tol` 픽셀에 점을 찍는 간이 방식 — 굵기/연속성이
  완벽하진 않음.

## 확장 방법

- **프리미티브 추가**: 셰이더 `mapScene`에 새 SDF(원환 `sdTorus`, 캡슐 등)를 추가하고 `smin`로
  합성. 2D는 `sdf2d.ts`에 대응 함수 추가.
- **무한 반복**: `p = mod(p+0.5*c, c) - 0.5*c`로 도메인 반복(타일링) 추가.
- **반사/굴절**: 히트 후 반사 방향으로 한 번 더 마칭(2차 광선)하고 합성.
- **팔레트 교체**: `iterColor`/`heatRamp`의 색 스톱을 바꾸면 히트맵 색을 교체 가능.
- **AO/섀도우 품질**: AO 샘플 수, 섀도우 `k`/스텝 수 조정.
