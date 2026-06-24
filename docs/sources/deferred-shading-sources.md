# 출처 — deferred-shading ("디퍼드 셰이딩과 G-버퍼")

집필 검증일: 2026-06. 1차/권위 자료(LearnOpenGL, NVIDIA GPU Gems, Real-Time Rendering 블로그,
Wikipedia, humus.name 클러스터드 셰이딩 발표자료)로 교차확인. WebFetch가 일부 도메인에서
정책상 403을 반환해 WebSearch 결과 본문(여러 출처 동시 인용)으로 교차검증함.

핵심 결론: 본문의 골격(포워드 비용 = lights × objects, 디퍼드 = geometry 1회 + lights를
화면공간에서, MRT로 G-buffer 한 번에 채우기, 단점: 투명/블렌딩·MSAA·대역폭·단일 머티리얼
모델, 그리고 tiled/clustered/forward+가 many-light 문제의 현대적 해법)은 모두 1차 자료와 일치.

---

## 1. 디퍼드 셰이딩의 기본 개념과 G-buffer

- **LearnOpenGL — Deferred Shading**
  https://learnopengl.com/Advanced-Lighting/Deferred-Shading
  - geometry pass에서 per-pixel·light-independent 값(position, normal, albedo, specular/gloss)을
    **render-to-texture로 G-buffer에 기록**. 이 단계는 조명 계산을 하지 않으므로 저렴하다.
  - **MRT(multiple render targets)**로 한 번의 패스에서 여러 채널을 동시에 기록.
  - lighting pass는 **화면 전체 사각형(fullscreen quad)** 위에서 G-buffer를 샘플해 픽셀당 1회
    조명 계산. "디퍼드는 포워드보다 *훨씬 더 많은 광원*을 감당할 수 있다."
  - **본문 ↔ 출처:** "지오메트리 1회 기록 → 라이팅을 화면공간에서 픽셀당 1회"·"MRT 한 패스"·
    "many-light에 유리" 일치.

- **Deferred shading — Wikipedia**
  https://en.wikipedia.org/wiki/Deferred_shading
  - "screen-space shading technique ... second rendering pass." 조명 입력값을 **G-Buffer**에
    저장, 이 단계에선 light를 적용하지 않음.
  - "Forward rendering may typically shade many more pixels than deferred shading, as the
    expensive lighting math is generally performed immediately, even on pixels that may be
    overwritten later." → 디퍼드는 **가려진 픽셀을 셰이딩하지 않을 수 있어** overdraw 셰이딩
    비용을 줄인다.
  - **본문 ↔ 출처:** "overdraw 셰이딩 낭비 제거"·"화면공간 2차 패스" 일치.

## 2. 포워드의 비용 구조 (lights × objects)

- **LearnOpenGL (위)** + **Wikipedia (위)** 모두: 포워드는 광원이 많아질수록 각 프래그먼트가
  모든(혹은 영향 광원 전부) 광원을 순회 → 비용이 (셰이딩되는 프래그먼트) × (광원 수)로 늘고,
  나중에 덮일 픽셀에도 조명을 계산해 낭비.
  - **본문 ↔ 출처:** "포워드 ≈ O(objects의 픽셀 × lights), 디퍼드 ≈ O(G-buffer 픽셀 + lights)"
    의 직관과 일치. (정확한 점근 표기는 도식용 단순화임 — 아래 "주의" 참조.)

## 3. MRT / G-buffer 채널 구성 (대표값)

- **NVIDIA GPU Gems 2, Ch.9 "Deferred Shading in S.T.A.L.K.E.R."**
  https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-9-deferred-shading-stalker
  - 실제 타이틀의 G-buffer 레이아웃 사례(position/normal/albedo/material 채널). 채널 수·포맷은
    엔진마다 다름 → 본문은 albedo·normal·depth·material을 **대표 구성**으로 제시.
  - **본문 ↔ 출처:** "채널 구성은 엔진마다 다르다"는 hedge와 일치.

## 4. 단점 — 투명/블렌딩, MSAA, 대역폭, 단일 머티리얼

- **LearnOpenGL (위)** / **Wikipedia (위)**:
  - **투명/블렌딩 불가:** G-buffer는 픽셀당 하나의 표면만 저장 → 반투명은 별도 forward 패스로
    처리해야 함.
  - **MSAA가 어렵다:** "MSAA does not work well with deferred shading"(아래 §5 안티에일리어싱
    출처와도 교차). G-buffer를 멀티샘플하면 대역폭이 폭증하고 라이팅을 per-sample로 풀어야 함.
  - **대역폭:** G-buffer는 화면 해상도 × 여러 채널 → 기록/읽기 대역폭이 크다(특히 고해상도·
    HDR·멀티샘플 시). 모바일 TBR에서 특히 부담 → `./tile-based-rendering`·
    `./memory-bandwidth-roofline`로 교차링크.
  - **단일 머티리얼 모델:** G-buffer 포맷이 고정이라 셰이딩 모델 다양성이 제한됨.
  - **본문 ↔ 출처:** 네 단점 모두 일치.

## 5. 현대적 해법 — tiled / clustered / forward+

- **Humus (Emil Persson), "Practical Clustered Shading"**
  https://www.humus.name/Articles/PracticalClusteredShading.pdf
- **A. Ortiz, "A Primer On Efficient Rendering Algorithms & Clustered Shading"**
  http://www.aortiz.me/2018/12/21/CG.html
- **Tiled Deferred Shading — Leif Node**
  https://leifnode.com/2015/05/tiled-deferred-shading/
  - 화면을 타일(예: 16×16)로 나눠 **타일별 영향 광원 목록**을 만들고, 셰이딩 시 그 타일의
    광원만 순회 → many-light에서 광원 순회 비용을 줄인다.
  - **Clustered**는 깊이까지 쪼개(view-frustum 3D 클러스터) 타일링보다 광원-샘플 대응이 정확.
  - **Forward+**는 같은 light-culling을 forward에 적용 → MSAA·투명을 살리면서 many-light 처리.
    "Forward+ ... < 2048 lights에서 tiled deferred보다 빠른 경향"(researchgate/aortiz 비교).
  - **본문 ↔ 출처:** "타일/클러스터로 광원을 컬링", "forward+가 MSAA·투명 친화" 한 줄 요약 일치.

## 6. MSAA가 디퍼드와 충돌하는 이유 (안티에일리어싱 챕터와 공유)

- **MJP(therealmjp), "A Quick Overview of MSAA"**
  https://therealmjp.github.io/posts/msaa-overview/
  - MSAA는 G-buffer를 멀티샘플 텍스처로 만들어야 하고, 라이팅 패스에서 에지 픽셀을 per-sample로
    풀어야 비용이 살아난다 → 구현 복잡·대역폭 증가.
  - **NVIDIA, "Antialiased Deferred Rendering"**
    https://archive.docs.nvidia.com/gameworks/content/gameworkslibrary/graphicssamples/d3d_samples/antialiaseddeferredrendering.htm
  - **본문 ↔ 출처:** "디퍼드에서 MSAA는 가능은 하나 비싸고 까다롭다 → TAA로 가는 동기" 일치.

---

## 낮은 신뢰도 / 주의

- **점근 표기 $O(\text{픽셀}\times\text{광원})$ 등은 "도식용 단순화"**다. 실제 포워드 엔진은
  per-object light culling, light volume, early-Z prepass로 비용을 크게 줄이므로 순진한
  "lights × objects"는 *교육용 상한*으로 이해해야 한다. 본문에서 이 점을 명시.
- **G-buffer 채널 수·비트 포맷**(예: "보통 3~5 타깃")은 엔진/플랫폼마다 다른 대표값. 특정 수치를
  보편 사실로 단정하지 않음.
- **데모는 실제 MRT가 아니라** 채널별 단순 머티리얼 스왑으로 G-buffer를 *시각화*한다(WebGL2/
  three.js로 진짜 MRT 디퍼드 파이프라인을 한 위젯에 담는 건 과함). 개념 전달용 근사임을 명시.
- "Forward+ vs tiled deferred 성능 교차점(~2048 lights)"은 특정 구현·하드웨어의 벤치마크값 →
  본문에서 수치 단정 대신 "구현에 따라 다름"으로 hedge.
