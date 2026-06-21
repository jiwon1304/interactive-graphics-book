# 출처 — monte-carlo-integration ("몬테카를로 적분")

이 챕터의 수식·수렴률·기법 명칭을 표준 교재(PBRT)와 1차 자료(Veach)에 대조해 검증했다. 조사일: 2026-06.

> 검증 메모: PBRT 온라인북(pbr-book.org)과 Veach 논문/박사논문, scratchapixel로 교차확인.

---

## 1. 렌더링 = 고차원 적분 · 차원의 저주

- **PBRT (4th ed) — 2.1 Monte Carlo: Basics** https://pbr-book.org/4ed/Monte_Carlo_Integration/Monte_Carlo_Basics
  - 빛 전달은 고차원 적분이며 MC가 차원에 강건하다는 동기. 본문 §"왜 무작위가 필요한가" 일치. ✔
  - 결정적 구적법(사다리꼴/심프슨)은 $d$차원에서 점 수가 지수적으로 증가(curse of dimensionality):
    한 축 $m$칸이면 $m^d$. 본문 "$100^{10}$" 예시 일치. ✔ (대표 예시 수치.)

## 2. 다트로 π — 면적비

- 표준 MC 예제. 사분원 넓이 $\pi/4$, 정사각형 넓이 1 ⇒ 안쪽 비율 $\approx\pi/4$ ⇒ $\pi\approx4\cdot\frac{안}{전체}$.
  본문 §"다트로 π 추정" 일치(초등 기하). ✔

## 3. MC 추정량 · 편향 없음(unbiased)

- **PBRT — Monte Carlo Basics**
  - 추정량 $\hat I_N=\frac1N\sum_i \dfrac{f(x_i)}{p(x_i)},\ x_i\sim p$. 본문 식과 일치. ✔
  - 편향 없음: $E[f(x)/p(x)]=\int \frac{f(x)}{p(x)}p(x)\,dx=\int f(x)\,dx$. 본문 유도 그대로. ✔
  - 균등표집 $p=1/(b-a)$ ⇒ $\int_a^b f\approx\frac{b-a}{N}\sum_i f(x_i)$. 본문 일치. ✔
  - 검증 적분: $\int_0^1\sin(\pi x)\,dx=[-\cos(\pi x)/\pi]_0^1=2/\pi\approx0.63662$. 손계산 확인 ✔.

## 4. 오차 $\propto 1/\sqrt N$ · 차원 무관

- **PBRT — Monte Carlo Basics** (variance / convergence)
  - $\operatorname{Var}[\hat I_N]=\sigma^2/N$ ⇒ 표준오차 $=\sigma/\sqrt N\propto N^{-1/2}$. 본문 식 일치. ✔
  - 수렴률에 **차원이 등장하지 않음** — 고차원에서 결정적 구적법을 이기는 이유. 본문 일치. ✔
  - 오차 절반 ⇒ 표본 4배. 본문 일치. ✔
  - log–log에서 기울기 $-1/2$: $\log|\text{err}|\approx-\frac12\log N+\text{const}$. 본문 §"오차" 일치. ✔
    (단, 이는 표준오차의 기댓값 추세선이며 개별 런은 흩어짐 — 본문도 "추세선"으로 서술. OK.)

## 5. 분산 줄이기 · 중요도표집(importance sampling)

- **PBRT — 2.2 Improving Efficiency / Importance Sampling**
  https://pbr-book.org/4ed/Monte_Carlo_Integration/Improving_Efficiency
  - 적분 기여가 큰 곳에 표본을 몰면 분산↓. $p\propto f$이면 $f(x_i)/p(x_i)$가 상수가 되어 분산→0(이상적).
    본문 §"분산 줄이기" 일치. ✔
  - 검증 적분: 가우시안 $f(x)=e^{-(x-0.5)^2/(2\cdot0.05^2)}$, $\int_0^1\approx\sigma\sqrt{2\pi}=0.05\sqrt{2\pi}
    \approx0.12533$. 본문 참값 일치. ✔ (경계 $[0,1]$ 꼬리 누락은 무시할 수준.)

## 6. 경로추적과의 다리 · MIS · 층화/QMC

- **E. Veach, "Robust Monte Carlo Methods for Light Transport Simulation", PhD thesis, Stanford 1997.**
  https://graphics.stanford.edu/papers/veach_thesis/
  (MIS 원논문: Veach & Guibas, SIGGRAPH 1995, "Optimally Combining Sampling Techniques".)
  - BRDF 중요도표집: 방향을 $p(\omega)\propto f_r(\omega)\cos\theta$로 뽑음 — 본문 §"분산 줄이기"·§"더 나아가기" 일치. ✔
  - **MIS**: 광원 표집 vs BRDF 표집을 가중 결합. 본문 일치(개요). ✔
  - 층화표집/준몬테카를로(QMC, 저불일치 수열)는 $1/\sqrt N$보다 빠른 수렴 가능. 본문 §"더 나아가기" 일치. ✔
    (참고: QMC 수렴률은 적분함수 매끄러움 등에 의존 — 본문 "얻을 수 있다"는 신중한 표현이라 OK.)

---

### 플래그(불확실/대표값)
- "$100^{10}$" 등은 차원의 저주를 보이는 **대표 예시 수치**. OK.
- 모든 핵심 수식이 PBRT/Veach와 일치. **수정 없음.**
