# 출처 — bezier-de-casteljau ("베지에 곡선과 드 카스텔조")

이 챕터의 수식·역사·성질을 1차/표준 자료에 대조해 검증했다. 조사일: 2026-06.

> 검증 메모: 베지에/드 카스텔조는 표준 CAGD(Computer-Aided Geometric Design) 수학이라
> 1차 역사 자료(de Casteljau, Bézier, Bernstein 연대)와 표준 정의를 교차확인했다.

---

## 1. 역사: de Casteljau(1959, Citroën) · Bézier · Bernstein(1912)

- **Wikipedia — Paul de Casteljau** https://en.wikipedia.org/wiki/Paul_de_Casteljau
- **Wikipedia — Bézier curve** https://en.wikipedia.org/wiki/B%C3%A9zier_curve
- **Wikipedia — De Casteljau's algorithm** https://en.wikipedia.org/wiki/De_Casteljau%27s_algorithm
  - Paul de Casteljau가 **1959년 Citroën**에서 곡선 평가 알고리즘을 개발. Citroën의 비공개 정책으로
    **1974년경까지 미공개**였고, 그 사이 **Pierre Bézier**(Renault)가 독립적으로 발견·널리 알려 "베지에"라는
    이름이 굳음. 수학적 기저인 **Bernstein 다항식은 1912년**(Sergei Bernstein) 확립, 약 50년 뒤 그래픽스에 적용.
  - 본문은 인물·연대를 본문에 직접 서술하지 않고 알고리즘 명칭("드 카스텔조 구성")만 사용 — 명칭 정확. ✔
  - (참고: 챕터 본문에 역사 단락을 두지 않았으므로 사실 오류 없음. 참고자료로 출처만 노출.)

## 2. 선형 보간(lerp)과 드 카스텔조 재귀

- **Wikipedia — De Casteljau's algorithm**
  - 재귀식 $P_i^{(r)}=(1-t)P_i^{(r-1)}+t\,P_{i+1}^{(r-1)},\ P_i^{(0)}=P_i$, 곡선 점 $B(t)=P_0^{(n)}$.
    본문 §"드 카스텔조 구성" 식과 일치. ✔
  - 차수 $n$이면 $n$단계 보간 뒤 점 하나가 남는다(3차=4점=3단계). 본문 일치. ✔

## 3. 번스타인 기저 · 단위 분할(partition of unity) · 볼록 껍질

- **Wikipedia — Bernstein polynomial** https://en.wikipedia.org/wiki/Bernstein_polynomial
- **Wikipedia — Bézier curve** (Bernstein form, convex hull property)
  - $B(t)=\sum_{i=0}^n \binom ni (1-t)^{n-i}t^i P_i$, 기저 $B_{i,n}(t)=\binom ni(1-t)^{n-i}t^i$.
    본문 식과 일치. ✔
  - 단위 분할: $\sum_i B_{i,n}(t)=((1-t)+t)^n=1$ (이항정리). 본문 유도 그대로. ✔
  - 가중치가 비음수이고 합이 1 ⇒ 곡선이 제어점들의 **볼록 껍질** 안에 머문다(convex hull property).
    본문 일치. ✔
  - 끝점 보간: $B(0)=P_0,\ B(1)=P_n$ (양 끝 제어점을 정확히 지남). 본문 도입부 관찰과 일치. ✔

## 4. 분할(subdivision): 중간점이 두 반쪽의 새 제어 다각형

- **Wikipedia — De Casteljau's algorithm (subdivision)** + 표준 CAGD(Farin).
  - $t$에서 드 카스텔조 삼각 도식의 **왼쪽 변**(각 단계 첫 점들)이 $[0,t]$ 반쪽의 제어점,
    **오른쪽 변**(각 단계 마지막 점들)이 $[t,1]$ 반쪽의 제어점이 된다. 별도 계산 불필요.
    본문 §"곡선 쪼개기" 서술과 일치. ✔
  - 응용: 곡선 렌더링(재귀 분할로 직선 근사), 충돌 검사, 편집기 — 표준 용도. 본문 일치. ✔

---

### 플래그(불확실/대표값)
- 없음. 모든 수식·성질이 표준 정의와 일치(수정 없음).
- 역사 단락이 본문에 없어 연대 오류 위험 없음. 참고자료 섹션으로 1차 역사 출처만 노출.
