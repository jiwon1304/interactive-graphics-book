# 출처 — ambient-occlusion ("앰비언트 오클루전 — SSAO/HBAO")

이 챕터는 아래 1차/전문가 자료를 기준으로 작성·검증했다. LearnOpenGL 본문 페이지는 직접 fetch가
403이라, (a) JoeyDeVries/LearnOpenGL **GitHub raw 셰이더 소스**(canonical 구현)로 공식·수치를 확정하고,
(b) 검색 스니펫 + Wikipedia/NVIDIA로 역사·HBAO/GTAO를 교차확인했다.

---

## 1. ambient 항이 평평한 이유 + AO의 정의

- **Ambient occlusion — Wikipedia**
  - https://en.wikipedia.org/wiki/Ambient_occlusion
- 검증사실:
  - 고정 ambient 항 $k_a$는 모든 방향에서 균일한 입사광을 가정 → 모든 점이 같은 양의 간접광을 받는
    것으로 처리되어 **틈·구석·접촉부가 어두워지지 않는다**(형태가 평평하게 보임).
  - AO는 각 점에서 반구 위 방향들이 **얼마나 가려져 있는지(visibility)** 의 비율로, ambient를
    조절(modulate)하는 스칼라 $[0,1]$. 가려진 곳일수록 0(어둡게).
  - **AO 적분(코사인 가중 visibility):**
    $$A(p) = \frac{1}{\pi}\int_{\Omega} V(p,\omega)\,(n\cdot\omega)\,d\omega$$
    $V$는 방향 $\omega$가 막혔으면 0, 트였으면 1. $n\cdot\omega$는 코사인(람베르트) 가중. $1/\pi$로
    정규화하면 완전히 트인 점은 $A=1$.
  - **검증사실 ↔ 본문:** `AmbientFlatVsAO`(고정 ambient vs AO 곱), `HemisphereKernel`(반구·코사인 가중
    샘플), 본문 적분 유도.

## 2. SSAO — Crytek (Mittring, Crysis 2007) + LearnOpenGL 구현

- **Martin Mittring, "Finding Next Gen — CryEngine 2" (SIGGRAPH 2007 course)** — SSAO 최초 도입.
- **LearnOpenGL — SSAO** (Joey de Vries) — 교육용 표준 구현.
  - 본문: https://learnopengl.com/Advanced-Lighting/SSAO  (403 — 아래 raw로 확정)
  - **셰이더 raw(직접 확인):**
    https://raw.githubusercontent.com/JoeyDeVries/LearnOpenGL/master/src/5.advanced_lighting/9.ssao/9.ssao.fs
  - C++ raw: https://github.com/JoeyDeVries/LearnOpenGL/blob/master/src/5.advanced_lighting/9.ssao/ssao.cpp
- 검증사실(raw 셰이더 직접 확인):
  - **G-buffer 입력**: `gPosition`(view-space 위치), `gNormal`(view-space 법선), `texNoise`(4×4 랜덤
    회전 벡터, 화면에 타일링 — `noiseScale = (W/4, H/4)`).
  - **kernelSize = 64, radius = 0.5, bias = 0.025** (대표값).
  - **반구 커널을 법선축(TBN)으로 회전:**
    ```glsl
    vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
    vec3 bitangent = cross(normal, tangent);
    mat3 TBN = mat3(tangent, bitangent, normal);
    ```
  - **샘플 위치 → 화면 투영 → 깊이 비교 → range check:**
    ```glsl
    vec3 samplePos = fragPos + (TBN * samples[i]) * radius;
    // projection으로 화면좌표 구해 gPosition에서 sampleDepth 읽음
    float rangeCheck = smoothstep(0.0, 1.0, radius / abs(fragPos.z - sampleDepth));
    occlusion += (sampleDepth >= samplePos.z + bias ? 1.0 : 0.0) * rangeCheck;
    ```
  - **최종:** `occlusion = 1.0 - (occlusion / kernelSize);`
  - **커널 분포(C++ 측)**: 단위 반구 안의 점을 만들고 `scale = lerp(0.1, 1.0, scale*scale)`로
    **중심에 가깝게 가속 분포**(가까운 차폐에 더 큰 가중).
  - **검증사실 ↔ 본문:** `HemisphereKernel`(반구 샘플·가속 분포), `OcclusionTest2D`(깊이 비교 +
    range check가 무엇을 막는지), 본문 SSAO 알고리즘 절.

## 3. range check / haloing, bias / self-occlusion

- 검증사실(raw 셰이더 + 검색 스니펫):
  - **range check**: 샘플 깊이가 현재 프래그먼트와 너무 멀면(`radius`보다 큰 깊이 차) 그 차폐를
    무시(smoothstep로 페이드). **전경 물체 가장자리에서 멀리 있는 배경이 가짜로 차폐로 잡히는 haloing**
    아티팩트를 막는다.
  - **bias**: 같은 평면 위 샘플이 수치 오차로 "자기 자신보다 약간 뒤"로 읽혀 평면이 스스로를 차폐하는
    self-occlusion(밴딩/줄무늬)을 막으려고 깊이 비교에 작은 여유(0.025)를 더한다.
  - **검증사실 ↔ 본문:** `OcclusionTest2D`에서 range check on/off, bias 슬라이더로 줄무늬 발생/제거.

## 4. 노이즈 + 블러 (4×4 회전 → 노이즈 → 블러로 제거)

- 검증사실:
  - 적은 샘플로 부드러운 결과를 얻으려고 커널을 픽셀마다 랜덤 회전 → 결과에 고주파 노이즈가 생김 →
    회전 텍스처와 같은 크기(4×4)의 박스 블러로 노이즈를 평탄화(에지 보존은 안 함, 단순 평균).
  - **검증사실 ↔ 본문:** 본문 "노이즈+블러" 절(도식·서술), `OcclusionTest2D`의 샘플 수에 따른 노이즈.

## 5. HBAO / GTAO (한 줄~짧게)

- **Louis Bavoil, Miguel Sainz, "Image-Space Horizon-Based Ambient Occlusion" (2008, NVIDIA)** — HBAO.
- **Jorge Jimenez et al., "Practical Realtime Strategies for Accurate Indirect Occlusion" (GTAO, 2016)**
- **Ambient occlusion / HBAO — Wikipedia**, **NVIDIA HBAO+**
  - https://en.wikipedia.org/wiki/Ambient_occlusion
  - https://developer.nvidia.com/rendering-technologies/horizon-based-ambient-occlusion-plus
- 검증사실(검색 스니펫·위키 교차확인):
  - **HBAO**: depth buffer를 height field로 보고, 여러 방위(azimuth) 슬라이스마다 ray-march로
    **horizon angle**(지평선 각)을 찾아 가려진 입체각을 적분. SSAO의 점-샘플 깊이비교보다 기하를
    더 잘 안다.
  - **GTAO**(ground-truth AO): HBAO 계열을 offline ray-traced AO에 **calibration**해 정확도↑,
    temporal로 안정화. 코사인 가중 visibility를 두 horizon으로 해석적으로 적분.
  - **검증사실 ↔ 본문:** "더 나아가기"에서 SSAO=빠른 hack / HBAO=geometry-aware / GTAO=레퍼런스
    보정 으로 한 단락 요약. `HorizonDiagram`(2D 하이트필드에서 horizon angle) 정적 도식.

## 6. 화면공간(screen-space)의 한계

- 검증사실:
  - depth/normal 버퍼만 보므로 **화면 밖·뒤·가려진 기하의 정보가 없다** → 카메라 밖 물체의 차폐 누락,
    뷰 의존, 얇은 물체 과다 차폐, radius·해상도 의존 등. (월드공간 AO bake나 ray-traced AO와 대비.)
  - **검증사실 ↔ 본문:** "한계" 절. 본문에서 ray tracing(`raytracing-hardware`)·오프라인 bake 언급.

---

### 플래그(불확실/대표값)
- kernelSize=64, radius=0.5, bias=0.025, 4×4 noise, `lerp(0.1,1.0,s²)`는 **LearnOpenGL 구현의 대표값**
  (raw 셰이더로 확정). 프로덕션은 장면 스케일에 맞춰 radius/bias를 조정함 — 본문에 "대표값" 명시.
- 본 챕터의 SSAO 데모는 **풀 G-buffer SSAO를 GPU로 구현하지 않는다**(외부 패키지 금지·복잡도). 대신
  반구 커널·깊이비교·range check를 보여주는 2D 인터랙티브 도식 + AO on/off 렌더 비교(three
  `aoMap`/간단 contact darkening)로 개념을 전달. 본문에서 "도식/근사"임을 명시.
- HBAO/GTAO 원논문 PDF는 직접 fetch 미확보(검색·위키 교차확인) — horizon-angle 적분의 "요지"만 사용,
  구체 수식은 다루지 않음.
