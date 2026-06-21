# 출처 — raymarching-sdf ("레이마칭과 거리장(SDF)")

이 챕터의 공식·알고리즘 명칭·고유명사를 1차 논문과 Inigo Quilez 표준 자료에 대조해 검증했다.
조사일: 2026-06.

> 검증 메모: `iquilezles.org`는 WebFetch 403이라 검색 스니펫 + 다수 미러/강의자료로 IQ 공식을 교차확인했다.
> Hart 1996 원논문 메타데이터는 Springer/Semantic Scholar로 확인.

---

## 1. 부호거리함수(SDF) 정의 · 기본 도형 공식

- **Inigo Quilez — "distance functions"** https://iquilezles.org/articles/distfunctions/
  - SDF: 안<0, 표면=0, 밖>0. 구 $\lVert p-c\rVert-r$, 평면 $p\cdot n - h$. 본문 §1 일치. ✔
  - **박스(원점 중심, 반치수 $b$)**: $q=|p|-b$일 때
    $f(p)=\lVert\max(q,0)\rVert+\min(\max(q_x,q_y,q_z),0)$.
    본문 §1 박스 공식 ("$q=|p|-b$, $\lVert\max(|p|-b,0)\rVert+\min(\max(q_x,q_y,q_z),0)$")과 일치 — IQ 표준 공식. ✔
    (바깥: 양수 성분 길이 / 안쪽: 가장 덜 음수인 면까지 거리.)

## 2. 스피어 트레이싱 — Hart 1996 (★ 1차 출처)

- **J. C. Hart, "Sphere tracing: a geometric method for the antialiased ray tracing of implicit
  surfaces", The Visual Computer 12, pp. 527–545 (1996).**
  https://link.springer.com/article/10.1007/s003710050084
  (PDF 미러: http://graphics.cs.illinois.edu/sites/default/files/zeno.pdf )
  - 거리값 $h=f(p)$만큼 광선을 전진시켜도 표면을 절대 통과하지 않음(반지름 $h$ 공 안에 표면 없음).
    이름 "sphere tracing"의 유래. 본문 §2 "안전 거리만큼 점프" 일치. ✔
  - 종료: $h<\varepsilon$이면 히트, $t>t_{\max}$면 미스, 스텝 소진이면 종료. 표준 마칭 루프. 본문 §2 일치. ✔
  - 표면을 스치면(grazing) $h$가 작아져 스텝이 촘촘 ⇒ 스텝 수 폭증. 본문 §2·§3 일치. ✔

## 3. 스텝 예산 — 실루엣 가장자리부터 무너짐

- Hart 1996 + IQ/Shadertoy 표준 경험.
  - 최대 스텝↓이면 안전원이 작은 grazing 실루엣에서 먼저 예산이 떨어져 깨짐. $\varepsilon$↑이면 표면이
    두툼해지고 디테일이 뭉개짐. 본문 §3 일치(정성적 사실). ✔

## 4. 스무스 민(smooth-min) — IQ 다항식 버전 (★)

- **Inigo Quilez — "smooth minimum"** https://iquilezles.org/articles/smin/
  - 다항식(quadratic) smin: $\operatorname{smin}(a,b,k)=\min(a,b)-\dfrac{h^2 k}{4},\ h=\max(1-\frac{|a-b|}{k},0)$.
    본문 §4 식과 일치 — IQ의 표준 polynomial smin. ✔
    (검색 교차확인: glsl-smooth-min, 다수 Shadertoy/강의 자료가 동일 형태 인용.)
  - 부울 연산: 합집합 $\operatorname{smin}(a,b,k)$, 교집합 $\operatorname{smax}=-\operatorname{smin}(-a,-b,k)$,
    차집합 $\operatorname{smax}(a,-b,k)$. 본문 §4 일치. ✔ ($k\to0$이면 보통 $\min$.)

## 5. 법선 = 거리장 기울기(유한차분) · 4-탭

- IQ — distance functions / "normals for an SDF".
  - $n\approx\nabla f/\lVert\nabla f\rVert$, $\nabla f$는 중심차분(central difference)으로 근사.
    실전은 4-탭 tetrahedron 방식이 효율적. 본문 §5 일치. ✔

## 6. 소프트 섀도우 — IQ

- **Inigo Quilez — "soft shadows in raymarched SDFs"** https://iquilezles.org/articles/rmshadows/
  - 광원 방향 마칭 중 $\text{res}\leftarrow\min(\text{res},\,k\,h/t)$를 누적해 반그림자(penumbra) 생성.
    본문 §5 식과 일치 — IQ 표준 soft shadow. ✔

## 7. 결과물 — 풀스크린 프래그먼트 셰이더 / 스텝 히트맵 / 간이 AO

- 표준 Shadertoy 패턴(IQ). 픽셀마다 스피어 트레이싱, 4-탭 법선, soft shadow, 간이 AO.
  비용은 픽셀당 장면함수 다중 평가 — 복잡 장면에서 비쌈. 본문 §6·마무리 일치. ✔

---

### 플래그(불확실/대표값)
- 모든 핵심 공식이 IQ 표준 자료/Hart 1996과 일치. **수정 없음.**
- $\varepsilon$·스텝 수 등 구체 수치는 데모 구현 파라미터(도식용)로, 사양 보장값 아님.
