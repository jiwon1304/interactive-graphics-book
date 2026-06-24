# 출처 — post-processing ("포스트 프로세싱 — 톤매핑·블룸·노출")

이 챕터는 아래 1차/전문가 자료를 기준으로 작성·검증했다. three.js docs·예제는 직접 fetch가 403을
반환하는 경우가 있어, (a) 로컬 `node_modules/three`의 실제 소스(constants.js)로 상수를 확정하고,
(b) 검색 스니펫 + 전문가 블로그(Narkowicz, 64.github.io, Filmic Worlds)로 공식·수치를 교차확인했다.

---

## 1. Reinhard 톤매핑 (HDR→LDR의 가장 단순한 연산자)

- **Reinhard, Stark, Shirley, Ferwerda, "Photographic Tone Reproduction for Digital Images"
  (SIGGRAPH 2002)** — 원논문.
- **"Tone Mapping" — 64.github.io/tonemapping** (전문가 정리, 공식 교차확인용)
  - https://64.github.io/tonemapping/
- 검증사실(검색 스니펫·전문가 정리 교차확인):
  - **단순 Reinhard:** $L_{out} = \dfrac{L}{1+L}$. $[0,\infty)$를 $[0,1)$로 단조 매핑.
  - **extended Reinhard (white point):** $L_{out} = \dfrac{L\left(1 + L/L_{white}^2\right)}{1+L}$.
    $L = L_{white}$ 이상은 정확히 1로 매핑되어, 가장 밝은 정의된 값을 흰색으로 고정.
  - **휘도(luminance)** 기준 적용이 권장: $L = 0.2126\,R + 0.7152\,G + 0.0722\,B$ (Rec.709/sRGB
    primaries). RGB 채널마다 따로 Reinhard를 적용하면 채도(hue)가 변할 수 있어, 휘도만 톤매핑하고
    RGB는 비례 보존하는 방식이 색을 더 잘 지킨다.
  - **검증사실 ↔ 본문:** `ToneCurveChart`(입력 휘도→출력 곡선), `ToneMapCompare`의 Reinhard 모드.

## 2. ACES Filmic 근사 (Narkowicz fit) — 언리얼·표준 filmic 곡선

- **Krzysztof Narkowicz, "ACES Filmic Tone Mapping Curve" (2016)**
  - https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
- 검증사실(검색 스니펫 교차확인 — 페이지 직접 fetch는 403):
  - **공식(GLSL):**
    ```glsl
    vec3 ACESFilm(vec3 x) {
      float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
    }
    ```
  - 입력에 흔히 `x *= 0.6` (또는 노출 바이어스)을 곱한 형태로 쓴다. 이 근사는 실제 ACES RRT+ODT를
    유리식(rational) 한 줄로 맞춘 fit이며, 밝은 색을 약간 oversaturate한다(더 정확한 fit 대비).
  - ACES는 어두운 부분에 toe(완만한 발), 밝은 부분에 shoulder(어깨)를 가진 S-자 곡선이라 하이라이트가
    Reinhard보다 천천히 클리핑되고 대비가 더 살아 있다.
  - **검증사실 ↔ 본문:** `ToneCurveChart`의 ACES 곡선, `ToneMapCompare`의 ACES 모드.
    three.js의 `ACESFilmicToneMapping`이 정확히 이 계열(Stephen Hill의 fit를 sRGB 기준으로 적용)임은
    아래 §4로 확정.

## 3. Hable / Uncharted 2 filmic (배경·역사 — 본문 보조 언급)

- **John Hable, "Filmic Tonemapping Operators" / "Uncharted 2: HDR Lighting" (GDC 2010)**
  - https://filmicworlds.com/blog/filmic-tonemapping-operators/
  - https://filmicworlds.com/blog/filmic-tonemapping-with-piecewise-power-curves/
- 검증사실(검색 스니펫):
  - Uncharted 2 곡선 파라미터: A=0.15, B=0.50, C=0.10, D=0.20, E=0.02, F=0.30, exposure bias 2.0,
    white scale ≈ 11.2. Hejl/Burgess-Dawson 곡선을 제어 가능하게 확장.
  - **검증사실 ↔ 본문:** "filmic 곡선은 toe/shoulder를 가진 S-curve"라는 일반 framing의 역사적 근거.
    구체 수치는 본문에서 다루지 않고 ACES/Reinhard에 집중.

## 4. three.js의 톤매핑 상수 / 노출 / 색공간

- **로컬 소스 확정:** `node_modules/three/src/constants.js` (three r0.184)
  ```
  NoToneMapping=0, LinearToneMapping=1, ReinhardToneMapping=2, CineonToneMapping=3,
  ACESFilmicToneMapping=4, CustomToneMapping=5, AgXToneMapping=6, NeutralToneMapping=7
  ```
- **three.js docs — Renderer constants / WebGLRenderer**
  - https://threejs.org/docs/#api/en/constants/Renderer
- 검증사실(로컬 소스 + 검색 스니펫):
  - `renderer.toneMapping`에 위 상수를 설정. `renderer.toneMappingExposure`(기본 1.0)는 톤매핑 직전에
    선형 HDR 색에 곱해지는 **노출 배율**. 노출을 키우면 곡선의 더 높은 입력 구간을 쓰게 되어 전체가 밝아진다.
  - three는 기본 `outputColorSpace = SRGBColorSpace`라, 톤매핑 후 셰이더가 **선형→sRGB(≈감마 2.2)**
    변환을 자동으로 해준다(즉 톤매핑은 선형 공간에서, 감마는 그 뒤 출력 단계에서).
  - **검증사실 ↔ 본문:** `ToneMapCompare`는 r3f `useThree`로 `gl.toneMapping`/`gl.toneMappingExposure`를
    실시간 변경해 동일 HDR 장면이 연산자/노출에 따라 어떻게 매핑되는지 비교.

## 5. 블룸 (bright-pass threshold → blur → composite)

- **Real-Time Rendering, 4th ed. (Akenine-Möller et al.)** — bloom 파이프라인(임계 추출→다운샘플
  가우시안 블러→가산 합성)의 표준 서술.
- **LearnOpenGL — Bloom**
  - https://learnopengl.com/Advanced-Lighting/Bloom
- 검증사실(검색·표준 교재):
  - 블룸 = (1) 휘도가 임계(threshold)를 넘는 부분만 추출(bright pass), (2) 그 결과를 가우시안
    블러로 번지게(보통 여러 해상도로 다운샘플해 넓게), (3) 원본에 **가산(add)** 합성. 세기(intensity)로
    합성 가중치를 조절.
  - 톤매핑 **전(선형 HDR)** 에 적용하는 것이 물리적으로 맞다(밝은 값이 톤매핑으로 압축되기 전에 추출).
  - **검증사실 ↔ 본문:** `BloomDiagram`(threshold/intensity로 bright-pass + 번짐 + 합성을 단계별로
    보여주는 도식 — 외부 postprocessing 패키지 없이 개념 시각화).

## 6. 감마 / sRGB (display-pipeline 챕터와 연결)

- **sRGB 전달함수**: 선형 $L$ → 디스플레이 인코딩. 근사적으로 $L^{1/2.2}$, 정확히는 piecewise
  (linear 구간 + $1.055 L^{1/2.4} - 0.055$). 톤매핑은 선형에서, sRGB 인코딩은 그 뒤.
  - https://en.wikipedia.org/wiki/SRGB
- **검증사실 ↔ 본문:** "순서: 선형 HDR → 노출 → (블룸) → 톤매핑 → sRGB 인코딩"의 근거.
  상세는 `display-pipeline` 챕터로 크로스링크.

---

### 플래그(불확실/대표값)
- Narkowicz ACES fit 상수(2.51/0.03/2.43/0.59/0.14)와 `x*=0.6`은 검색 스니펫으로 확인 — 페이지
  직접 fetch는 403. 단, 동일 공식이 다수 독립 출처(64.github.io, GM Shaders, ReShade 플러그인)에
  반복 등장해 신뢰도 높음.
- three.js `ACESFilmicToneMapping`이 Narkowicz fit과 **글자 그대로 동일**한지는 버전마다 다를 수 있음
  (three는 Stephen Hill의 sRGB-space fit을 사용). 본문은 "ACES 계열 filmic 곡선"으로 서술하고,
  보조 차트의 ACES 곡선은 Narkowicz fit를 **대표 곡선**으로 그린다고 명시.
- 블룸 데모는 실제 멀티패스 GPU 블룸이 아니라 **개념 도식**(threshold/blur/composite 단계 시각화).
  외부 postprocessing 패키지 금지 제약 때문. 본문에서 "도식"임을 명시.
- Reinhard를 RGB per-channel로 적용 vs 휘도-only 적용의 색 차이는 출처마다 강조점이 다름 — 본문은
  휘도-only가 hue를 더 보존한다는 일반 사실만 사용.
