# 출처 — microfacet-brdf ("마이크로패싯 BRDF와 PBR")

이 챕터의 공식·항·재매핑·고유명사를 1차 논문과 업계 표준 문서에 대조해 검증했다. 조사일: 2026-06.

> 검증 메모: 원논문 PDF 일부와 `iquilezles.org`는 WebFetch 403이 잦아, 검색 스니펫 + 다수의
> 권위 출처(Cornell 원문 페이지, Epic/Karis 노트, Disney 노트, learnopengl)로 교차확인했다.

---

## 1. 마이크로패싯 모델 · Cook–Torrance(1982) 구조

- **R. Cook, K. Torrance, "A Reflectance Model for Computer Graphics", ACM TOG 1(1), pp. 7–24 (1982).**
  https://dl.acm.org/doi/10.1145/357290.357293
  - 미세면(microfacet)을 완벽한 거울로 보고, 스펙큘러 BRDF를 $D$(분포)·$G$(기하 감쇠)·$F$(프레넬)로 분해.
  - 스펙큘러 항 $f_{\text{spec}}=\dfrac{D\,F\,G}{4(n\cdot l)(n\cdot v)}$. **분모의 $4(n\cdot l)(n\cdot v)$**가
    미세면→거시 표면 환산의 기하/야코비안 보정. 본문 §"반사 방정식"·§"Cook–Torrance 조립" 식과 일치. ✔

## 2. 반사 방정식 단일 광원 축약

- **PBRT / LearnOpenGL — PBR Theory** https://learnopengl.com/PBR/Theory
  - 일반 반사 방정식 $L_o(v)=\int_\Omega f_r(l,v)L_i(n\cdot l)\,d\omega_i$. 단일 방향광이면
    $L_o(v)=f_r(l,v)L_i(n\cdot l)$. 본문 식과 일치. ✔ ($(n\cdot l)$ = 람베르트 코사인 항.)

## 3. 하프 벡터 $h=(l+v)/\lVert l+v\rVert$

- LearnOpenGL / Cook–Torrance: $h$를 법선으로 갖는 미세면만이 $l$을 정확히 $v$로 반사.
  본문 §"하프 벡터" 일치. ✔

## 4. D 항 — GGX / Trowbridge–Reitz (★ 출처와 명칭)

- **B. Walter, S. Marschner, H. Li, K. Torrance, "Microfacet Models for Refraction through Rough
  Surfaces", EGSR 2007.** (Cornell 원문) https://www.graphics.cornell.edu/~bjw/microfacetbsdf.pdf
  - GGX 분포를 그래픽스에 도입. (Walter 2021 EGSR Test-of-Time.)
  - GGX는 사실상 **Trowbridge–Reitz(1975)** 분포의 재발견 — 본문 "GGX(Trowbridge–Reitz)" 명칭 정확. ✔
    (참고: Matt Pharr, "Let's Stop Calling it 'GGX'", https://pharr.org/matt/blog/2022/05/06/trowbridge-reitz )
  - 분포식 $D(h)=\dfrac{\alpha^2}{\pi((n\cdot h)^2(\alpha^2-1)+1)^2}$. 본문 §"D 항" 식과 일치. ✔

## 5. $\alpha=\text{roughness}^2$ 재매핑 (Disney / Burley 2012)

- **B. Burley, "Physically-Based Shading at Disney", SIGGRAPH 2012 course.**
  https://media.disneyanimation.com/uploads/production/publication_asset/48/asset/s2012_pbs_disney_brdf_notes_v3.pdf
  - Disney가 거칠기를 $\alpha=\text{roughness}^2$로 재매핑 — 슬라이더 변화가 **지각적으로 선형**에 가깝게.
    본문 §"D 항"의 "$\alpha=\text{roughness}^2$로 제곱하는 이유는 지각적 선형성" 서술과 일치. ✔

## 6. G 항 — Smith · Schlick–GGX · $k$ 재매핑 (★ Karis/UE4)

- **B. Karis, "Real Shading in Unreal Engine 4", SIGGRAPH 2013 course.**
  https://cdn2.unrealengine.com/Resources/files/2013SiggraphPresentationsNotes-26915738.pdf
  (slides: https://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_slides.pdf)
  - Smith로 마스킹/섀도잉 분리해 곱: $G=G_1(v)\,G_1(l)$. 본문 일치. ✔
  - Schlick–GGX $G_1(x)=\dfrac{n\cdot x}{(n\cdot x)(1-k)+k}$. 본문 §"G 항" 식과 일치. ✔
  - **직접광(analytic light)** $k=\dfrac{(\text{roughness}+1)^2}{8}$. 본문 식과 일치. ✔
    (Karis: Disney의 roughness+1 재매핑으로 "hotness" 완화, **직접광 전용**.)
  - **IBL**은 $k=\dfrac{\text{roughness}^2}{2}=\alpha/2$ (= Schlick의 원래 $\alpha/2$). 본문 §"G 항"의
    "IBL은 $k=\text{roughness}^2/2$ 사용" 서술과 일치. ✔
    (참고: Karis는 직접광 재매핑을 IBL에 쓰면 grazing이 너무 어두워진다고 경고.)

## 7. F 항 — Schlick 프레넬 근사 · $F_0$

- **C. Schlick, "An Inexpensive BRDF Model for Physically-based Rendering", Eurographics 1994.**
  https://onlinelibrary.wiley.com/doi/10.1111/1467-8659.1330233
  - $F=F_0+(1-F_0)(1-(v\cdot h))^5$. 본문 §"F 항" 식과 일치. ✔
  - 유전체 $F_0\approx0.04$, 금속은 $F_0$가 색을 띰 — LearnOpenGL/Disney 표준. 본문 일치. ✔
  - $F_0=\text{mix}(0.04,\ \text{baseColor},\ \text{metalness})$ — metallic workflow 표준. 본문 일치. ✔

## 8. 에너지 보존 디퓨즈 항 · 감마 보정

- LearnOpenGL — PBR Lighting.
  - $k_d=(1-F)(1-\text{metalness})$, $f_{\text{diff}}=k_d\,\text{baseColor}/\pi$ (람베르트, $1/\pi$ 정규화).
    본문 §"Cook–Torrance 조립" 일치. ✔
  - sRGB 감마 보정 $\text{color}^{1/2.2}$ — 표준 근사(정확한 sRGB는 piecewise지만 $1/2.2$가 흔한 근사).
    본문 일치. ✔ (대표 근사값으로 명시 OK.)

## 9. 더 나아가기 — IBL / 멀티스캐터 / BRDF LUT

- IBL split-sum + BRDF LUT: Karis 2013. 멀티스캐터(에너지 보존): Kulla–Conty 2017
  ("Revisiting Physically Based Shading at Imageworks"). 본문 §"더 나아가기"의 항목들과 일치(개요 수준). ✔

---

### 플래그(불확실/대표값)
- $F_0\approx0.04$, 감마 $1/2.2$는 **업계 표준 대표값/근사**(정확값 아님) — 본문도 근사로 서술. OK.
- 모든 핵심 공식이 1차 논문/업계 표준과 일치. **수정 없음.**
