# 챕터 핸드오프 — 몬테카를로 적분 (Monte Carlo integration)

- **섹션**: 레이트레이싱
- **slug**: `monte-carlo-integration`
- **MDX**: `src/pages/chapters/monte-carlo-integration.mdx`
- **데모 폴더**: `src/components/demos/monte-carlo-integration/`

## 이 챕터의 목적

레이트레이싱/경로추적이 본질적으로 **고차원 적분 문제**임을 보이고, 무작위 표본으로 그 적분을
추정하는 몬테카를로 방법을 소개한다. 챕터의 주인공은 **"추정값이 참값으로 수렴하는 과정"** 이다.
모든 위젯은 완성된 숫자 하나가 아니라, 표본이 쌓이며 추정값이 움직이고 오차가 줄어드는 과정을
실시간으로 보여준다. 마지막에는 중요도표집을 경로추적의 BRDF 표집과 연결한다.

## 공통 설계

- **2D 위젯만** 사용. three.js / react-three-fiber / DemoCanvas는 쓰지 않음(3D 전용).
  선/산점도는 **SVG**(테마 자동: `stroke="var(--text)"` 등), 점이 수천 개인 다트 산점도만 **canvas 2D**.
- **결정적 PRNG**: `prng.ts`의 `mulberry32(seed)`. "다시 시작" 시 `randomSeed()`로 새 시드를 뽑아
  재시드한다. 재생/일시정지/한 스텝은 같은 시드 안에서 재현 가능.
- **SSR 안전**: 모든 난수는 이벤트 핸들러나 `useEffect`(클라이언트 전용) 안에서만 생성. 모듈 최상위·렌더
  중에는 `Math.random` 호출 없음. `requestAnimationFrame` 루프는 `useEffect`에서 시작하고
  cleanup에서 `cancelAnimationFrame`으로 해제. 일시정지(`playing=false`)면 rAF를 돌리지 않음(배터리 절약).
- **테마**: SVG는 `var(--*)` 직접 사용. canvas(다트)는 그릴 때마다 `cssVar(el, '--accent')` 식으로
  CSS 변수를 다시 읽어 라이트/다크 토글에 반응.
- **고해상도 canvas**: `setupCanvas`가 `devicePixelRatio`(상한 2)로 버퍼를 잡고 컨텍스트를 스케일.
- **컨트롤**: 슬라이더/토글/셀렉트는 `src/components/controls`의 프리미티브 사용. 재생/스텝/리셋
  **버튼**은 프리미티브에 없어 `.mc-btn` 클래스의 인라인 `<style>`(`McButtonStyles`)로 제공.
  버튼/숫자 readout(`ReadoutRow`)/버튼 스타일(`McButtonStyles`)은 `DartboardPi.tsx`에 정의하고
  다른 위젯이 import해 재사용한다.
- import 깊이: 데모가 `demos/monte-carlo-integration/`(한 단계 더 깊음)에 있으므로 controls는
  `'../../controls'`. (RotatingBox는 `'../controls'`였음.)

## 위젯별 정리 (모두 "과정"을 보여줌 — 결과만 보여주는 위젯 없음)

### 1. DartboardPi — π 추정
- **파일**: `DartboardPi.tsx`
- **개념**: $[0,1]^2$에 다트를 던져 사분원(반지름 1) 안쪽 비율로 $\pi \approx 4\cdot(\text{안}/\text{전체})$.
- **과정**: canvas 산점도(안=`--accent`, 밖=`--muted`). $\hat\pi$가 3.14159…로 수렴하고 오차가 주는 걸
  실시간 readout으로 보여줌. 재생=프레임당 200개, 한 스텝=30개, 다시 시작=재시드.
- **참값**: $\pi = 3.14159265\ldots$
- **컨트롤**: 재생/일시정지, 한 스텝(+30), 다시 시작, "바깥쪽 점 표시" 토글.
- **주의**: 산점도 점 상한 `MAX_POINTS = 60000`(메모리). 새 점만 덧그려(`drawnRef`) 비용 절감,
  리사이즈/테마 변화 시 `ResizeObserver`로 전부 재그림.

### 2. ConvergenceCurve — 정적분 수렴
- **파일**: `ConvergenceCurve.tsx`
- **함수/참값**: $f(x)=\sin(\pi x)$, $\int_0^1 = 2/\pi \approx 0.636620$.
- **과정**: SVG 두 패널. (위) 곡선 + 표본 위치의 $f(x)$ 막대, (아래) 누적 추정값 꺾은선 + 참값 점선.
  표본이 쌓이며 추정선이 출렁이다 점선으로 정착. 재생 초반은 batch=3(느리게)→이후 40.
- **컨트롤**: 재생/일시정지, 한 스텝(+5), 다시 시작.
- **상한**: 막대 `MAX_TICKS=400`, 꺾은선 `MAX_HISTORY=600`.

### 3. ErrorVsN — $O(1/\sqrt N)$ 법칙
- **파일**: `ErrorVsN.tsx`
- **함수/참값**: 동일 적분 $2/\pi$. 한 "런"은 새 시드로 $N$을 로그 간격($1 \to 10^5$)으로 키우며
  각 지점 절대오차를 점으로 기록(런당 36점).
- **과정**: 산점도에 런을 겹쳐 추세를 또렷하게. "로그-로그 축" 토글 시 구름이 기울기 $-1/2$ 기준선
  (점선, $c/\sqrt N$, $c=0.3$)을 따름. 재생은 8프레임마다 런 추가.
- **컨트롤**: 재생/일시정지, 런 추가, 다시 시작, "로그-로그 축" 토글.
- **상한**: 점 `2000`개.

### 4. UniformVsImportance — 변수 감소(경로추적 다리)
- **파일**: `UniformVsImportance.tsx`
- **함수/참값**: 뾰족한 가우시안 봉우리 $f(x)=e^{-(x-0.5)^2/(2\cdot 0.05^2)}$ on $[0,1]$.
  참값 $I = s\sqrt{2\pi}\cdot Z \approx 0.125331$ (여기서 $s=0.05$, 절단상수 $Z\approx 1$;
  코드의 `erf`/`Phi`로 계산). 봉우리가 좁아 양 끝이 $10\sigma$ 밖 → $Z=1$.
- **추정량**: 일반식 $\hat I=\frac1N\sum f(x_i)/p(x_i)$.
  - 왼쪽(균등): $p=1$. 표본 대부분 봉우리 밖 → 낭비, 큰 분산.
  - 오른쪽(중요도): $p(x)=N(x;\mu,s)/Z$(거부표집으로 $[0,1]$만 채택). 가중치 $f/p$가 거의 상수 → 분산 급감.
- **과정**: 같은 N·같은 PRNG 흐름. 두 패널 각각 (위) 곡선+표본 클라우드, (아래) 추정 꺾은선+참값 점선,
  하단에 Î·오차. 재생 한 번으로 둘 동시 진행.
- **프로즈 연결**: 경로추적이 반구 균등 대신 $p(\omega)\propto f_r\cos\theta$로 방향을 뽑는 이유.
- **컨트롤**: 재생/일시정지, 한 스텝(+3), 다시 시작.

### 5. ManyRuns — 추정값의 퍼짐(히스토그램)
- **파일**: `ManyRuns.tsx`
- **함수/참값**: 동일 적분 $2/\pi$. 독립 추정기 200개, 각각 표본 $N$개(슬라이더 1~1024).
- **과정**: SVG 히스토그램(41 bin, x범위 = 참값±0.5 고정). 막대가 프레임당 6런씩 채워짐.
  $N$ 슬라이더를 키우면 분포가 참값 주변으로 좁아짐(표준편차 $\propto 1/\sqrt N$). 평균·표준편차 readout.
  $N$ 변경 시 자동 재굴림(`useEffect([n])`).
- **컨트롤**: $N$ 슬라이더, 다시 굴리기(재시드).

## 수식 노트 (MDX의 KaTeX)
- 추정량 $\int f \approx \frac1N\sum f(x_i)/p(x_i)$, 균등이면 $\frac{b-a}{N}\sum f(x_i)$.
- 무편향: $E[f/p]=\int f$.
- 분산 $\sigma^2/N$, 표준오차 $\propto 1/\sqrt N$ (차원 무관 → 고차원 렌더링에서 강함).
- 중요도표집: $p\propto f$면 분산 → 0. BRDF 표집 $p(\omega)\propto f_r\cos\theta$로 연결.
- π: 사분원 넓이 $\pi/4$ → $\pi\approx 4\cdot(\text{안}/\text{전체})$.

## 참여 의도(engagement intent)
각 위젯은 "직접 해보세요" 넛지를 갖고, 재생을 눌러 **수렴이 일어나는 과정**을 보게 한다.
특히 (1) 초반의 큰 출렁임 → 잔잔해짐, (3) 로그-로그에서 $-1/2$ 추세, (4) 같은 N에서 균등 vs 중요도의
출렁임 차이, (5) N 4배 → 표준편차 절반을 손으로 확인하게 유도.

## 한계 / TODO
- (3) ErrorVsN의 기준선 상수 `REF_C=0.3`은 시각적 가운데맞춤용 어림값(이론적 $\sigma$가 아님).
  단일 런은 노이즈가 커서 추세선이 흐릿할 수 있어 "런 추가"로 겹치도록 안내함.
- (4) 중요도표집의 절단정규는 거부표집(guard 20회)으로 구현. $\mu=0.5,s=0.05$에선 거부가 사실상 0이라
  무해하지만, 파라미터를 봉우리가 경계에 닿게 바꾸면 거부율이 오를 수 있음.
- `erf`는 A&S 7.1.26 근사(상대오차 ~1e-7). 참값 표시·$Z$ 계산엔 충분.
- 위젯들은 각자 상태를 들고 있어 서로 동기화되지 않음(의도된 독립성).

## 확장 방법
- 적분 대상 함수를 SelectControl로 바꿔 끼우게 만들면 좋음(여러 $f$, 각자 closed-form 참값).
- (3)에 여러 런의 RMS 오차를 추가로 그려 깔끔한 $1/\sqrt N$ 곡선을 덧대기.
- (4)에 층화표집(stratified) 패널을 하나 더 추가해 3-way 비교로 확장.
- 준몬테카를로(예: van der Corput/Halton) 표본을 선택지로 추가하면 "더 나아가기"와 직접 연결.

## 등록 안내 (중요)
- 작업 지시에 따라 `src/chapters.ts`는 **건드리지 않았다.** 사이드바·이전/다음·홈 목차에 나오게 하려면
  `chapters` 배열에 아래 항목을 **레이트레이싱 섹션 순서에 맞게** 추가해야 한다:
  ```ts
  { slug: 'monte-carlo-integration', title: '몬테카를로 적분',
    description: '무작위 표본으로 적분을 추정하고 수렴 과정을 직접 본다', section: '레이트레이싱' }
  ```
  (정확한 `section` 라벨/순서는 기존 `chapters.ts` 컨벤션에 맞춰 조정할 것.)
