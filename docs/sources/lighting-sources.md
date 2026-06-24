# 출처 — lighting ("조명 모델 — Lambert에서 Blinn-Phong까지")

이 챕터는 아래 1차/표준 자료를 기준으로 작성·교차검증했다. 핵심 사실은 모두
LearnOpenGL(공식 튜토리얼)·Wikipedia·Real-Time Rendering 관행을 ≥2 출처로 대조했다.

---

## 1. Lambert(diffuse) — N·L 코사인 법칙

- **LearnOpenGL, "Basic Lighting"**
  - https://learnopengl.com/Lighting/Basic-Lighting
  - 검증사실: diffuse 기여 = `max(dot(N, L), 0)`. 면이 광원을 정면으로 받을 때(N∥L) 최대,
    비스듬할수록 같은 빛이 더 넓은 면적에 퍼져 단위면적당 도달량이 cosθ로 줄어든다(Lambert cosine law).
  - **검증사실 ↔ 본문:** `LambertSphere` / `NdotLField` 위젯의 근거. N·L의 기하적 유도.

- **Wikipedia, "Lambert's cosine law"**
  - https://en.wikipedia.org/wiki/Lambert%27s_cosine_law
  - 검증사실: 이상적 diffuse(Lambertian) 면의 복사휘도(radiance)는 관찰 방향과 무관, 입사
    irradiance는 입사각 코사인에 비례. → diffuse 셰이딩이 시점에 독립인 이유.

## 2. 거리 감쇠(attenuation) — 역제곱과 constant/linear/quadratic

- **LearnOpenGL, "Light casters"** (point light attenuation)
  - https://learnopengl.com/Lighting/Light-casters
  - 검증사실: 실무 감쇠식 `att = 1 / (Kc + Kl·d + Kq·d²)`. 상수항은 0 나눗셈/근거리 폭발 방지,
    선형·이차항이 거리 증가에 따른 감소를 만든다.
- **Valve Developer Community, "Constant-Linear-Quadratic Falloff"**
  - https://developer.valvesoftware.com/wiki/Constant-Linear-Quadratic_Falloff
  - 검증사실: `Att = 1/(Kc + Kl·d + Kq·d²)` 동일 형식, 세 계수의 역할.
- **물리적 근거(역제곱):** 점광원이 방출한 에너지가 반지름 r 구면(`4πr²`)에 퍼지므로 단위면적당
  세기는 `1/r²`. (구면 면적 공식에서 직접 유도 — 본문 유도와 일치.) 다수 실시간 엔진은
  순수 `1/d²`가 근거리에서 너무 가파르다고 보아 Kc/Kl을 섞어 완화한다.
  - **검증사실 ↔ 본문:** `AttenuationCurve` 위젯(1/d² vs Kc+Kl·d+Kq·d² 비교).

## 3. Phong specular(reflect 벡터) vs Blinn-Phong(half 벡터)

- **LearnOpenGL, "Advanced Lighting" (Blinn-Phong)**
  - https://learnopengl.com/Advanced-Lighting/Advanced-Lighting
  - 검증사실:
    - Phong: 반사벡터 `R = reflect(-L, N)`, specular = `pow(max(dot(R, V), 0), shininess)`.
    - Blinn-Phong: half 벡터 `H = normalize(L + V)`, specular = `pow(max(dot(N, H), 0), shininess)`.
    - **차이의 핵심:** Phong은 R·V가 90°를 넘으면 specular가 0으로 끊겨(cutoff), 낮은 shininess에서
      하이라이트가 부자연스럽게 잘린다. Blinn-Phong의 N·H는 이 cutoff가 없어 더 부드럽다.
    - **같은 모양을 내려면 Blinn-Phong shininess는 Phong보다 크게**(대략 2~4배) 잡아야 한다.
- **Wikipedia, "Blinn–Phong reflection model"**
  - https://en.wikipedia.org/wiki/Blinn%E2%80%93Phong_reflection_model
  - 검증사실: H의 정의 `H = (L+V)/|L+V|`. N·H는 R·V 절반 각도에 대응 → shininess 보정 필요.
    Blinn-Phong이 OpenGL/Direct3D 고정 파이프라인의 기본 모델이었다는 사실.
  - **검증사실 ↔ 본문:** `PhongVsBlinn` 위젯(reflect vs half 벡터, cutoff 시각화),
    `HalfVectorViz`(H가 V와 L 사이를 따라가는 과정).

## 4. ambient·광원 합산

- **LearnOpenGL, "Basic Lighting" / "Multiple lights"**
  - https://learnopengl.com/Lighting/Multiple-lights
  - 검증사실: 최종색 = ambient + Σ(광원별 diffuse + specular). ambient는 간접광을 대신하는 상수항
    근사(전역 균일 가산)로, 그림자 영역이 완전히 검게 죽는 것을 막는다. 여러 광원은 선형으로 합산
    (빛은 가산적).
  - **검증사실 ↔ 본문:** `LightingLab` 종합 위젯(ambient + 다광원 합산, 항별 토글).

---

### 플래그(불확실/대표값)
- 감쇠 계수 Kc/Kl/Kq의 "표준값"은 엔진·씬마다 다르다. 본문 수치는 **도식용 대표값**이며 절대값이
  아니라 곡선 모양·상대 거동을 보이기 위한 것.
- "Blinn-Phong shininess ≈ Phong의 2~4배"는 근사 경험칙(정확한 환산은 각도·BRDF 정규화에 따라 다름).
  본문은 "더 크게 잡아야 비슷"이라는 정성적 사실로만 사용.
- 본문의 Lambert/Phong/Blinn-Phong은 **비물리(ad hoc)** 모델임을 명시하고, 에너지 보존·미세면
  기반의 물리적 모델은 `microfacet-brdf` 챕터로 넘긴다.
