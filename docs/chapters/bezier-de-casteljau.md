# 핸드오프 — 베지에 곡선과 드 카스텔조

## 목적

베지에 곡선을 "선형 보간의 반복"이라는 단 하나의 직관으로 설명한다. 핵심 주인공은 결과가
아니라 **드 카스텔조 구성(과정/메커니즘)**. 여섯 위젯이 모두 정적 결과가 아닌 **과정**을
보여 주도록 설계했다.

## 파일 구성

- 챕터(글): `src/pages/chapters/bezier-de-casteljau.mdx`
- 공유 수학: `src/components/demos/bezier-de-casteljau/geometry.ts`
- 공유 캔버스 유틸: `src/components/demos/bezier-de-casteljau/canvasKit.ts`
- 공유 그리기 프리미티브: `src/components/demos/bezier-de-casteljau/draw.ts`
- 공유 React 훅: `src/components/demos/bezier-de-casteljau/useBezierCanvas.ts`
- 위젯 6개: 같은 폴더의 `*.tsx`

> `src/chapters.ts`에는 아직 등록하지 않았다(작업 지시상 편집 금지). 사이드바 노출이 필요하면
> `{ slug: 'bezier-de-casteljau', title: '베지에 곡선과 드 카스텔조', section: ... }`를 추가하면 된다.

## 공유 모듈 메모

### geometry.ts (순수 수학, DOM 무관)
- `Pt`, `lerp(a,b,t)`
- `deCasteljau(points,t)` → `{ levels, point }` — **모든 중간 단계**를 반환. 사다리/자취/분할의 토대.
- `bezierPoint`, `sampleBezier(points,n)` (n+1 샘플), `bernstein(n,i,t)`, `binomial(n,k)`
- `subdivide(points,t)` → `{ left, right }` — left = 각 레벨의 첫 점, right = 각 레벨의 마지막 점(차수
  순서 위해 reverse). 즉 드 카스텔조 삼각 스킴의 좌/우 변이 곧 두 반쪽 곡선의 제어 다각형.

### canvasKit.ts
- 가상 좌표계는 고정 `[0,1] × [0,1]` 박스 + `PAD` 여백. `toCanvas`/`toVirtual`로 매핑(y 뒤집기 포함).
- `hitTest`(픽셀 거리 기반, 기본 반경 16px → 터치 친화), `clampVirtual`.
- `readPalette(el)` — 캔버스 요소의 CSS 변수(`--bg`/`--accent` 등)를 **그릴 때마다** 읽어 라이트/다크 자동 적응.
- `setupHiDPICanvas` — dpr(상한 2.5) 보정, CSS 픽셀 좌표로 그리도록 transform 설정.
- `levelAlpha(r,total)` — 단계 깊이에 따른 알파(깊을수록 진하게).

### useBezierCanvas.ts (핵심 훅)
- 입력: `points`, `onPointsChange`(null이면 드래그 비활성), `draw` 콜백, `{ aspect, hitRadiusPx }`.
- ResizeObserver로 래퍼 폭 측정 → 종횡비로 높이 산출 → dpr 보정 후 `draw` 호출.
- pointerdown/move/up + setPointerCapture로 제어점 드래그. clientX/Y → rect 보정 → 가상좌표.
- `redraw()`로 외부 상태(슬라이더 t, 애니메이션 t) 변화 시 수동 리드로우.
- 콜백/포인트는 ref로 들어 이벤트 핸들러 재구독 최소화.

### draw.ts
- `fillBackground`, `strokePolyline`, `drawControlPolygon`(점선), `drawBezierCurve`(샘플 폴리라인),
  `drawDot`, `drawLabel`. 모두 `toCanvas` + 팔레트 색 사용.

## 위젯별 (전부 PROCESS 중심)

| # | 파일 | 보여주는 것 | PROCESS/RESULT | 핵심 상태/파라미터 |
|---|------|-------------|----------------|--------------------|
| 1 | `DraggablePlayground.tsx` | 3차 곡선, 점 드래그 시 곡선·제어 다각형 실시간 갱신, P0..P3 라벨 | **PROCESS**(끌면 곡선이 끌려옴) | `points: Pt[4]` |
| 2 | `DeCasteljauLadder.tsx` ★ | t에서의 모든 보간 단계(3→2→1 선분/점)를 진해지는 강조색으로, 최종 B(t) | **PROCESS**(재귀 시각화) | `points`, `t`, `showLabels` |
| 3 | `TracePoint.tsx` | t를 0→1 애니메이션, 점이 곡선 자취를 칠함, 사다리 동시 표시 토글 | **PROCESS**(시간에 따른 자취) | `t`(ref, rAF), `playing`, `speed`, `showLadder` |
| 4 | `BernsteinWeights.tsx` | 번스타인 기저 누적 영역 플롯 + 세로 t-마커(가중치 합=1) | **PROCESS**(t 따라 가중치 변화) | `degree`(2/3/4), `t` |
| 5 | `DegreeCompare.tsx` | 2/3/4차 세 패널이 **공유 t**로 동시에 드 카스텔조 점을 움직임 | **PROCESS**(t가 모든 점 구동) | 공유 `t`, 패널별 `points`(모두 드래그 가능) |
| 6 | `SubdivideSplit.tsx` | t에서 좌/우 두 베지에로 분할, 두 새 제어 다각형을 다른 톤으로 | **PROCESS**(분할점·중간점이 새 제어점) | `points`, `t`, `showOriginal` |

## 수식 메모 (글에 포함, 검증 완료)

- 선형 보간: `lerp(A,B,t) = (1-t)A + tB`
- 드 카스텔조 재귀: `P_i^(r) = (1-t)P_i^(r-1) + t·P_{i+1}^(r-1)`, `P_i^(0)=P_i`, `B(t)=P_0^(n)`
- 번스타인/베지에 형식: `B(t) = Σ C(n,i)(1-t)^(n-i) t^i P_i`, 기저 `B_{i,n}(t)=C(n,i)(1-t)^(n-i)t^i`
- 단위 분할: `Σ B_{i,n}(t) = ((1-t)+t)^n = 1`
- 분할: 드 카스텔조 삼각 스킴의 좌변/우변 = 두 반쪽 곡선의 제어 다각형

## 참여 의도(engagement intent)

- 1번은 "손맛" 도입(끌어 보게). 2번이 메커니즘의 클라이맥스. 3번은 정적 t를 시간으로 풀어
  "곡선=자취"를 체화. 4번은 대수(가중치)↔기하 연결. 5번은 차수 감각. 6번은 드 카스텔조의
  공짜 보너스(분할)로 마무리하며 실전 응용(렌더/충돌/편집기) 동기 부여.

## 한계 / TODO

- 2D 캔버스만 사용(three.js/r3f 미사용 — 지시대로). 3D 베지에 표면(텐서곱)은 범위 밖.
- `BernsteinWeights`는 누적 영역 칠에 `color-mix(in srgb, ...)`를 캔버스 fillStyle로 사용한다.
  최신 브라우저는 지원하나, 매우 구형 브라우저에서 색이 투명으로 떨어질 수 있다(곡선 윤곽선은
  항상 보이므로 치명적이지 않음). 필요 시 rgba 보간으로 교체 가능.
- 곡선 샘플 수는 고정(80~120). 매우 굴곡 심한 고차 곡선에서 미세한 각짐 가능 → 적응 샘플링으로 확장 여지.
- 균일(uniform) 파라미터화만 다룸 — 호장(arc-length) 등속, 유리(rational)/NURBS, C¹ 연결(스플라인)은
  후속 챕터 소재.

## 확장 방법

- 차수 토글을 모든 위젯에 공유하려면 `points` 길이를 상태로 올리고 기본 제어점 프리셋 맵을 둔다.
- 분할을 **재귀**로 확장(SubdivideSplit에 깊이 슬라이더)하면 "곡선→폴리라인 근사" 렌더링을 보여줄 수 있다.
- 호장 등속 애니메이션: `sampleBezier`로 길이 테이블을 만들어 t를 재매개화하면 TracePoint가 등속 이동.
- 새 위젯은 `useBezierCanvas` + `draw.ts` 프리미티브 + `readPalette`만 쓰면 테마/터치/리사이즈/HiDPI가 공짜.
