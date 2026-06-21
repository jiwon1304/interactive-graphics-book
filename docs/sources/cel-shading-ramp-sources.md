# 출처 — cel-shading-ramp ("셀 셰이딩과 램프 라이팅")

이 챕터는 아래 1차/전문가 자료를 기준으로 작성·검증했다. 검증 메모: 여러 1차 PDF
(`advances.realtimerendering.com`, `ggxrd.com`, Valve CDN, `inria.hal.science`)가 직접 fetch에서
403을 반환해, (a) 직접 fetch 가능한 미러/논문 PDF(x-toon HAL), (b) 검색 스니펫으로 canonical URL과
핵심 사실을 교차확인했다. 인용은 canonical URL 기준이며, verbatim이 확정 안 된 곳은 "요지" 또는
"대표 표기"로 명시한다.

---

## 1. 고전 toon/cel shading = 연속 diffuse를 소수의 tone으로 양자화 (Decaudin 1996, Lake 2000)

- **Philippe Decaudin, "Cartoon-Looking Rendering of 3D-Scenes" (INRIA RR-2919, 1996)**
  - 프로젝트 페이지: https://phildec.users.sourceforge.net/Research/Cartoon.php
  - 엔트리: http://wwwisg.cs.uni-magdeburg.de/~stefans/npr/entry-Decaudin-1996-RSIa.html
  - 요지: 3D 장면을 전통 카툰 그림처럼 렌더. **Phong 모델을 변형해 그라디언트(연속 음영)를 제거**,
    면을 **소수의 색으로만** 칠한다. 윤곽선은 z-buffer·normal-buffer의 **불연속**(discontinuity)을
    멀티패스로 검출해 그린다. NPR/toon shading의 초기 정초 작업.
  - **검증사실 ↔ 본문:** "연속 diffuse → 불연속/소수 tone"이라는 이 챕터의 출발점. 윤곽선은
    이 챕터 범위 밖(다음 챕터)으로 언급만.

- **Lake, Marshall, Harris, Blackstein, "Stylized Rendering Techniques for Scalable Real-Time 3D
  Animation" (NPAR 2000, ACM, pp. 13–20)**
  - 요지: toon/cel을 실시간으로. **(n·l) 또는 그 함수로 1D 텍스처(ramp/LUT)를 인덱싱**해 음영을
    소수의 밴드로 끊는 "shade lookup" 기법의 표준 레퍼런스로 인용됨(법선→색 매핑의 일반화).
  - 참고(2차): https://www.cg.tuwien.ac.at/courses/Seminar/WS2007/comicstyle.pdf (Danner, TU Wien)
  - **검증사실 ↔ 본문:** `RampEditor` 위젯(편집 가능한 1D ramp가 곧 라이팅 응답)의 근거.
    `1D 텍스처 = LUT`라는 본문 framing이 여기서 나온다.

## 2. Half-Lambert (Valve, Half-Life 2 Source 엔진)

- **Gary McTaggart, "Half-Life 2 / Valve Source Shading" (GDC 2004)**
  - https://steamcdn-a.akamaihd.net/apps/valve/2004/GDC2004_Half-Life2_Shading.pdf
  - (미러) http://www.decew.net/OSS/References/D3DTutorial10_Half-Life2_Shading.pdf
- **Mitchell, McTaggart, Green, "Shading in Valve's Source Engine" (SIGGRAPH 2006 Course, Ch.7)**
  - https://advances.realtimerendering.com/s2006/Chapter7-Shading_in_Valve's_Source_Engine.pdf
- **Valve Developer Community — "Half Lambert" / "$halflambert"**
  - https://developer.valvesoftware.com/wiki/Half_Lambert
  - https://developer.valvesoftware.com/wiki/$halflambert
  - 검증사실(검색 스니펫·VDC 교차확인):
    - **공식: Lambert의 dot product를 `× ½`, `+ ½` 한 뒤 제곱한다.** 즉
      $\big(\tfrac{1}{2}(n\cdot l) + \tfrac{1}{2}\big)^2$. (제곱이 핵심 — VDC가 명시.)
    - **목적:** 물체의 뒷면(back)이 형태(shape)를 잃고 너무 평평하게(too flat) 보이는 것을 막는다.
      Source에서 캐릭터 **얼굴 머티리얼**에 자주 쓰이며, `$phong`이 켜지면 대부분 강제로 켜진다.
    - **물리적 근거 없음:** "no physical basis"인 hack — 어두운 면이 0으로 죽지 않게 NdotL을
      `[0,1]`로 remap해 wrap-around 효과를 준다. (VDC/Course 노트.)
  - **검증사실 ↔ 본문:** `HalfLambertCompare` 위젯(Lambert vs Half-Lambert, remap 곡선).
    제곱은 **대표 표기**로 본문에 명시(squared half-Lambert).

## 3. Warm–cool 색조 시프트 (Gooch shading)

- **Gooch, Gooch, Shirley, Cohen, "A Non-Photorealistic Lighting Model For Automatic Technical
  Illustration" (SIGGRAPH 1998)**
  - 초록: https://users.cs.northwestern.edu/~ago820/SIG98/abstract.html
  - 위키: https://en.wikipedia.org/wiki/Gooch_shading
  - 검증사실:
    - **밝기뿐 아니라 색조(hue) 변화**로 표면 방향을 표현. light를 향한 면=**warm color**(노랑 계열),
      등진 면=**cool color**(파랑 계열). 극단의 흑/백은 edge line·highlight용으로 남겨, **음영은
      mid-tone에서만** 일어나게 한다(전통 technical illustration 관행).
    - **블렌드 인자**(대표 표기): $t = \dfrac{1 + (n\cdot l)}{2}$,
      결과색 $= t\,\mathbf{c}_{\text{warm}} + (1-t)\,\mathbf{c}_{\text{cool}}$.
      (원논문은 $k_{\text{cool}} = k_{\text{blue}} + \alpha k_d$, $k_{\text{warm}} = k_{\text{yellow}}
      + \beta k_d$로 albedo를 섞음 — 본문은 단순화한 두-극 lerp로 제시.)
  - **검증사실 ↔ 본문:** `WarmCoolToon` 위젯(그림자=cool / 하이라이트=warm, "밝기만 vs 색조" 토글).
    `(1+n·l)/2`가 곧 Half-Lambert의 비제곱 형태와 같다는 연결을 본문에서 짚음.

## 4. X-Toon — 1D ramp의 확장 (Barla, Thollot, Markosian 2006)

- **Barla, Thollot, Markosian, "X-Toon: An Extended Toon Shader" (NPAR 2006)**
  - PDF: https://inria.hal.science/inria-00362888/file/x-toon.pdf
  - 프로젝트: https://maverick.inria.fr/Publications/2006/BTM06a/
  - 검증사실(PDF 직접 확인):
    - 고전 toon은 **1D 텍스처(tone)를 (n·l) 같은 값으로 인덱싱**해 음영을 소수 tone으로 양자화.
    - X-Toon은 이 **1D 텍스처를 2D 텍스처로 확장**: 둘째 축이 "tone detail"(깊이·표면 방향에 따라 변함)
      → LOD·aerial perspective·DoF·backlighting·specular를 한 룩업으로.
  - **검증사실 ↔ 본문:** "1D ramp = LUT"라는 framing의 근거 + "더 나아가기"에서 2D 확장 언급.

## 5. Guilty Gear Xrd — 프로덕션 ramp/shadow 제어 (Motomura, GDC 2015)

- **Junya C. Motomura (Arc System Works), "GUILTY GEAR Xrd -SIGN-" GDC 2015**
  - PDF: https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf
  - 해설(2차): https://blenderartists.org / blendernation
    https://www.blendernation.com/2015/07/26/junya-c-motomura-behind-the-scenes-of-guilty-gear-xrd/
  - 검증사실(검색 스니펫·2차 해설 교차확인):
    - **수학적 정확성을 일부러 포기**하고, 복잡한 3D 캐릭터 위에서 **일관된 cel 음영**을 얻기 위해
      art-directed 제어를 씀.
    - 음영은 임계(threshold)/ramp로 끊고, **그림자 영역을 텍스처로 직접 제어**(예: AO/ShadowColor
      채널)해 코·앞머리 등 원치 않는 자기그림자를 정리. (얼굴 SDF 그림자 맵은 별개 토픽.)
  - **검증사실 ↔ 본문:** "왜 toon이 art control을 위해 물리에서 멀어지는가"의 프로덕션 근거.
    본문 "더 나아가기"에서 언급.

## 6. fwidth 기반 경계 안티앨리어싱

- **OpenGL/GLSL `fwidth` = `abs(dFdx(p)) + abs(dFdy(p))`** — 화면공간에서 인접 프래그먼트 간 값의
  변화율 추정. Khronos GLSL 레퍼런스:
  - https://registry.khronos.org/OpenGL-Refpages/gl4/html/fwidth.xhtml
  - https://registry.khronos.org/OpenGL-Refpages/gl4/html/dFdx.xhtml
  - 검증사실: `fwidth(x)`는 한 픽셀 이동당 `x`의 변화량 크기. 이를 `smoothstep(t - w, t + w, x)`의
    폭 `w`로 쓰면 **임계 경계를 화면공간 약 1픽셀 폭으로** 부드럽게 만들어, 줌·비스듬한 면에서도
    일정한 두께의 anti-aliased 경계를 얻는다(계단 제거). derivative는 2×2 quad 단위로 계산됨.
  - **검증사실 ↔ 본문:** `FwidthAA` 위젯(hard vs smoothstep vs fwidth, 줌 비교).

---

### 플래그(불확실/대표값)
- Half-Lambert "제곱"·"no physical basis"는 VDC/Course 노트 기반 — 직접 PDF fetch가 403이라
  검색 스니펫+VDC로 교차확인. 제곱은 **대표 표기**로 본문에 명시.
- Gooch `t=(1+n·l)/2` 및 두-극 lerp는 위키/스니펫 기반 **대표 표기**(원논문은 albedo 혼합 항 포함).
- Guilty Gear Xrd의 구체 채널 구성(AO=red 등)은 2차 해설 기반 — 본문은 "텍스처로 그림자 제어"
  수준으로만 일반화해 서술.
- Lake 2000 본문 verbatim 미확보(ACM 유료) — 표준 인용 사실(1D ramp shade lookup)만 사용.
