# 출처 — antialiasing ("안티에일리어싱 — MSAA·FXAA·TAA")

집필 검증일: 2026-06. 1차/권위 자료(MJP "A Quick Overview of MSAA", LearnOpenGL Anti-Aliasing,
Wikipedia TAA, Unity Post-Processing 문서, elopezr "Temporal AA", Hardware Times 비교)로 교차확인.
일부 도메인은 WebFetch 정책 403 → WebSearch 결과 본문(여러 출처 동시 인용)으로 교차검증.

핵심 결론: 본문의 골격(에일리어싱 = 샘플링 부족/Nyquist 위반, SSAA = 고해상도 렌더+다운샘플,
MSAA = 에지에서 coverage 다중 샘플·셰이더는 픽셀당 1회, FXAA/SMAA = 포스트 이미지 기반,
TAA = 지터+히스토리+모션벡터로 시간축 supersampling·ghosting이 대가)은 1차 자료와 일치.

---

## 1. 에일리어싱의 원인 — 샘플링 부족 (Nyquist)

- **Nyquist–Shannon 표본화 정리** — 최고 주파수 $f$ 복원에 $\ge 2f$ 샘플. 래스터화는 픽셀당
  1 샘플(픽셀 중심) → 0.5 cycle/pixel 초과 신호가 저주파 계단/모아레/반짝임으로 접힘.
  https://en.wikipedia.org/wiki/Nyquist–Shannon_sampling_theorem
  - **본문 ↔ 출처:** "픽셀당 1 샘플이 고주파 에지를 못 잡아 계단·지글거림" 일치.
    (이미 검증된 texture-filtering 챕터의 §minification aliasing과 같은 원리 — 교차링크
    `./texture-filtering-mipmapping`.)

## 2. SSAA — 고해상도 렌더 후 다운샘플

- **LearnOpenGL — Anti Aliasing**
  https://learnopengl.com/Advanced-OpenGL/Anti-Aliasing
  - SSAA = 더 높은 해상도로 렌더 후 축소(box/average) → 픽셀당 *여러* 실제 샘플. 품질 최상,
    비용 = 해상도 배수만큼 **셰이딩까지** 늘어 비쌈.
  - **본문 ↔ 출처:** "SSAA는 셰이딩을 N배 → 정답에 가깝지만 비싸다" 일치.

## 3. MSAA — 에지에서 coverage 다중 샘플, 셰이딩은 픽셀당 1회

- **MJP(therealmjp), "A Quick Overview of MSAA"**
  https://therealmjp.github.io/posts/msaa-overview/  (= mynameismjp.wordpress.com 미러)
- **LearnOpenGL — Anti Aliasing (위)**
  - 픽셀당 **여러 coverage/depth 샘플**(서브샘플 위치). 삼각형이 일부 서브샘플만 덮으면
    그만큼만 기여 → 에지에서 부드러움.
  - **프래그먼트(픽셀) 셰이더는 삼각형당 픽셀당 1회만 실행**(픽셀 중심으로 보간), 그 단일 색을
    coverage+depth를 통과한 서브샘플들에 **broadcast**. → 셰이딩 비용은 거의 안 늘고,
    **메모리(depth/stencil/color 버퍼가 N배)**가 늘어남.
  - **resolve**: 마지막에 서브샘플들을 평균해 한 픽셀 색으로. 내부는 삼각형이 안 걸친 픽셀은
    한 색이라 압축됨.
  - **에지에서만 이득**: 삼각형 *내부* 텍스처/셰이더 에일리어싱(specular 반짝임)은 MSAA로
    안 잡힘 → SSAA/TAA가 필요한 이유.
  - **본문 ↔ 출처:** "coverage 샘플 N개, 셰이더 1회, 에지만, depth/color 버퍼 N배, resolve로
    평균" 모두 일치.

## 4. 포스트 기반 — FXAA / SMAA (이미지 공간 에지 검출)

- **Unity Post-Processing — Anti-aliasing**
  https://docs.unity3d.com/Packages/com.unity.postprocessing@2.3/manual/Anti-aliasing.html
- **Hardware Times — TAA vs SMAA vs FXAA vs MSAA**
  https://hardwaretimes.com/taa-vs-smaa-vs-fxaa-vs-msaa-which-one-is-better/
  - **FXAA**: 최종 LDR 이미지의 **luma(휘도) 대비**로 에지를 찾아 따라 블러 → 매우 싸고
    어디서나 동작(디퍼드·투명 무관, 모바일/모션벡터 없는 플랫폼 권장). 대가: 디테일까지
    살짝 흐려짐.
  - **SMAA**: 패턴 기반 에지 검출(향상된 MLAA 계열) → FXAA보다 선명/정확, 약간 비쌈.
  - **본문 ↔ 출처:** "FXAA = luma 에지 블러, 싸고 범용, 약간 흐림", "SMAA = 더 똑똑한 패턴"
    일치.

## 5. TAA — 지터 + 히스토리 + 모션벡터 (시간축 supersampling)

- **Temporal anti-aliasing — Wikipedia**
  https://en.wikipedia.org/wiki/Temporal_anti-aliasing
- **Unity Post-Processing (위)** / **elopezr "Temporal AA and the Quest for the Holy Trail"**
  https://www.elopezr.com/temporal-aa-and-the-quest-for-the-holy-trail/
  - 매 프레임 카메라/투영에 **서브픽셀 지터**(주로 Halton 시퀀스)를 더해 샘플 위치를 흔든다 →
    여러 프레임에 걸쳐 픽셀 면적이 고르게 샘플됨.
  - 이전 프레임 결과를 **history buffer**에 누적, 현재 프레임은 **모션 벡터로 재투영(reproject)**해
    같은 표면점의 과거 색을 가져와 **지수이동평균**으로 섞음
    ($c_t = \alpha\,c_\text{cur} + (1-\alpha)\,c_\text{hist}$, 보통 $\alpha\approx0.1$ 안팎).
  - **ghosting**: 가시성/셰이딩이 프레임 간 바뀌거나 모션벡터가 틀리면 과거 색이 현재와
    안 맞아 잔상. 완화책으로 **이웃 색 AABB clamp/clip**(neighborhood clamping)으로 history를
    현재 주변 색 범위로 제한. disocclusion(가려졌다 드러난 영역)도 ghosting 원인.
  - 디퍼드와 **함께 동작**(MSAA와 달리) + many-light·post와 잘 맞아 현대 표준. 대가: 잔상·
    번짐·플리커, 모션벡터 인프라 필요.
  - **본문 ↔ 출처:** "지터(Halton)·history·모션벡터 재투영·EMA 블렌드·neighborhood clamp·
    ghosting/disocclusion·디퍼드 호환" 모두 일치.

## 6. MSAA × 디퍼드 충돌 (디퍼드 챕터와 공유)

- **MJP MSAA overview(위)** + **NVIDIA "Antialiased Deferred Rendering"**
  https://archive.docs.nvidia.com/gameworks/content/gameworkslibrary/graphicssamples/d3d_samples/antialiaseddeferredrendering.htm
  - 디퍼드에서 MSAA는 G-buffer를 멀티샘플로 만들고 에지 픽셀을 per-sample 라이팅해야 해 비싸고
    까다롭다 → 디퍼드 엔진이 TAA로 기우는 핵심 이유.
  - **본문 ↔ 출처:** "디퍼드+MSAA가 어려워 TAA가 사실상 표준" 일치. (`./deferred-shading` 교차링크.)

---

## 낮은 신뢰도 / 주의

- **TAA 블렌드 계수 $\alpha\approx0.1$, 지터 시퀀스(Halton(2,3) 8/16-tap)**는 *대표값*이며
  엔진마다 다름 → 본문은 "흔히 쓰는 값"으로 제시, 보편 상수로 단정하지 않음.
- **MSAA 샘플 수(2x/4x/8x)별 버퍼 ×N**은 color/depth가 거의 N배라는 표준 서술. 압축(예:
  delta color compression)으로 실측 대역폭은 줄지만, 본문은 "최악/개념상 N배"로 제시.
- **FXAA vs SMAA vs TAA의 품질 우열**은 장면·구현 의존(마케팅 비교 다수) → 본문은 트레이드오프
  표로 제시하고 "상황에 따라 다름"으로 hedge. Hardware Times 같은 매체 비교는 정성적 참고로만.
- **데모는 실제 MSAA/TAA 파이프라인이 아니라** WebGL `antialias` 토글·확대 비교·정적 도식으로
  *현상*을 보인다(브라우저에서 진짜 4x MSAA resolve나 모션벡터 TAA를 만들기 과함). 개념
  전달용 근사임을 명시.
