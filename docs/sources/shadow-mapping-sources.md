# 출처 — shadow-mapping ("그림자 매핑")

이 챕터는 아래 1차/표준 자료를 기준으로 작성·교차검증했다. 핵심 사실은 LearnOpenGL(공식 튜토리얼)·
Microsoft Learn(DirectX 테크 아티클)·opengl-tutorial.org·three.js docs를 ≥2 출처로 대조했다.

---

## 1. 기본 알고리즘 — 광원 시점 depth map → 비교

- **LearnOpenGL, "Shadow Mapping"**
  - https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping
  - 검증사실:
    - 1패스: 광원 시점으로 장면을 렌더해 **depth map**(광원에서 가장 가까운 표면까지 거리)을 저장.
    - 2패스: 카메라 시점에서 각 프래그먼트를 광원 클립공간으로 변환해, 그 위치의 depth map 값과
      자신의 광원-거리(currentDepth)를 비교. `currentDepth > closestDepth` 면 그 사이에 다른
      표면이 있다는 뜻 → **그림자**.
    - directional light는 **orthographic** 광원 카메라, point/spot은 perspective.
  - **검증사실 ↔ 본문:** `DepthMapView`(광원 시점 depth 렌더), `ShadowCompare`(비교 판정), 전체 알고리즘.

- **opengl-tutorial.org, "Tutorial 16: Shadow mapping"**
  - http://www.opengl-tutorial.org/intermediate-tutorials/tutorial-16-shadow-mapping/
  - 검증사실: 동일 2패스 구조, bias 식 예시(아래 §3), front-face culling으로 peter-panning 완화.

## 2. Shadow acne — 원인

- **LearnOpenGL(위)** + **DigitalRune, "Shadow Acne"**
  - https://digitalrune.github.io/DigitalRune-Documentation/html/3f4d959e-9c98-4a97-8d85-7a73c26145d7.htm
  - 검증사실: depth map은 **유한 해상도**라 한 texel이 표면의 한 영역(보통 비스듬한 사면)을 하나의
    깊이값으로 양자화한다. 그 영역 안에서 실제 표면은 texel 깊이보다 앞/뒤로 갈리며, 뒤로 간 부분이
    자기 자신을 그림자로 판정 → **줄무늬(스트라이프) acne**. 광선이 표면에 비스듬할수록(grazing) 심하다.
  - **검증사실 ↔ 본문:** `BiasSlider` 위젯(acne↔peter-panning), acne의 기하 그림.

## 3. Bias / slope-scaled bias / peter-panning

- **LearnOpenGL(위)**: `bias = max(0.05 * (1.0 - dot(N, L)), 0.005)` — 면이 광원에 비스듬할수록
  bias를 키운다(grazing에서 acne가 심하므로). 너무 크면 **peter-panning**(그림자가 물체에서 떨어져
  떠 보임). 해결책: front-face culling(깊이 패스에서 앞면 컬). 
- **opengl-tutorial.org(위)**: `bias = 0.005 * tan(acos(dot(N,L)))`, clamp. 같은 slope-scaled 아이디어.
- **Microsoft Learn, "Common Techniques to Improve Shadow Depth Maps"**
  - https://learn.microsoft.com/en-us/windows/win32/dxtecharts/common-techniques-to-improve-shadow-depth-maps
  - 검증사실: 하드웨어 **slope-scaled depth bias**(삼각형 기울기에 따라 bias 증가), peter-panning은
    과도한 bias로 깊이 테스트가 잘못 통과해 생긴다. **normal offset**(표면 법선 방향으로 비교점을
    밀어내기)도 표준 완화책.
- **three.js docs, LightShadow.bias / normalBias**
  - https://threejs.org/docs/#api/en/lights/shadows/LightShadow.bias
  - https://threejs.org/docs/#api/en/lights/shadows/LightShadow.normalBias
  - 검증사실: three.js는 `shadow.bias`(깊이 오프셋, 보통 작은 음수 ~ -0.0005)와
    `shadow.normalBias`(법선 방향 오프셋, 곡면 acne에 효과)를 둘 다 노출. acne↔peter-panning
    트레이드오프가 그대로 존재.
  - **검증사실 ↔ 본문:** `BiasSlider`가 three 내장 `directionalLight.shadow.bias`를 직접 제어.

## 4. PCF (Percentage-Closer Filtering)

- **LearnOpenGL, "Shadow Mapping"(위)** + three.js 셰도우 타입
  - https://threejs.org/docs/#api/en/constants/Renderer (PCFShadowMap / PCFSoftShadowMap / BasicShadowMap)
  - 검증사실: 한 점만 비교하면 그림자 경계가 depth map texel 크기로 **계단(aliasing)** 진다. 경계
    주변 여러 texel을 비교해 **그림자 안에 든 비율(0~1)을 평균** → 부드러운 경계(soft edge).
    표본을 늘릴수록 부드러워지나 비용 증가. three.js의 `PCFShadowMap`/`PCFSoftShadowMap`가 이를 내장.
  - **참고:** 최신 three.js에서 `PCFSoftShadowMap`은 deprecated 경향(이슈/포럼), `PCFShadowMap`도
    soft. 본문은 "PCF 토글로 hard↔soft"라는 개념만 사용하고 특정 enum 권장은 피한다.
  - **검증사실 ↔ 본문:** `PcfToggle` 위젯(BasicShadowMap=hard vs PCFSoftShadowMap=soft, mapSize 슬라이더).

## 5. Cascaded Shadow Maps (CSM) — 개요

- **Microsoft Learn, "Cascaded Shadow Maps"**
  - https://learn.microsoft.com/en-us/windows/win32/dxtecharts/cascaded-shadow-maps
  - 검증사실: 하나의 큰 depth map으로 넓은 야외 씬을 덮으면 카메라 근처 해상도가 부족(perspective
    aliasing). CSM은 **view frustum을 거리로 여러 구간(cascade)으로 쪼개**, 가까운 구간엔 작은 영역에
    같은 해상도를 배정(고밀도), 먼 구간엔 넓은 영역(저밀도). 프래그먼트는 자기 깊이가 속한 cascade의
    map을 샘플. split은 linear/logarithmic 혼합(λ).
- **NVIDIA, "Cascaded Shadow Maps" (Dimitrov, 2007)**
  - https://developer.download.nvidia.com/SDK/10.5/opengl/src/cascaded_shadow_maps/doc/cascaded_shadow_maps.pdf
  - 검증사실: 동일 — 근거리 고해상/원거리 저해상으로 perspective aliasing 완화. cascade 경계 전환
    artifact 및 blend 필요.
- **검증사실 ↔ 본문:** `CascadeSplit` 정적/간단 시각화 + "더 나아가기"에서 CSM 개요.

---

### 플래그(불확실/대표값)
- bias의 구체 수치(`-0.0005`, `0.005` 등)는 **씬·해상도·near/far에 의존**하는 대표값. 본문은
  "절대 정답 없음, 트레이드오프를 손으로 맞춘다"로 명시.
- three.js의 PCF enum 권장 상태는 버전마다 변한다(PCFSoftShadowMap deprecated 경향). 본문은
  enum 이름에 의존하지 않고 "hard vs PCF soft"라는 동작 차이만 가르친다.
- CSM 위젯은 실제 다중 cascade 렌더가 아니라 **개념 시각화**(frustum 분할·해상도 배분)임을 명시.
- 본 챕터의 모든 인터랙티브는 three.js **내장 shadow map**(WebGL2 depth texture)을 사용 — 커스텀
  depth 패스를 직접 작성하지 않는다. depth map "시각화"는 내장 shadow map의 동작을 그림으로 설명.
