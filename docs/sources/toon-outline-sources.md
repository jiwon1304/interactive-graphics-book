# 출처 — toon-outline ("윤곽선과 외곽선 — inverted-hull과 에지 검출")

이 챕터는 아래 1차/전문가 자료를 기준으로 작성·검증했다. 일부 1차 PDF
(`ggxrd.com`, ACM/SIGGRAPH 게이트, 대학 호스트)가 직접 fetch에서 403/게이트를 반환해,
(a) 직접 fetch 가능한 프로젝트 페이지/저자 호스트, (b) 검색 스니펫으로 canonical URL과 핵심
사실을 교차확인했다. 인용은 canonical URL 기준이며, verbatim이 확정 안 된 곳은 "요지"로 명시한다.

---

## 1. 이미지 기반 외곽선의 정초 (Saito–Takahashi 1990, Decaudin 1996)

- **Takafumi Saito, Tokiichiro Takahashi, "Comprehensible Rendering of 3-D Shapes"
  (SIGGRAPH 1990, Computer Graphics 24(4), pp. 197–206)**
  - 요지: 3D 형태를 알아보기 쉽게 그리기 위해, 렌더 중간에 픽셀당 기하 정보를 담은 버퍼
    (저자들이 **G-buffer**라 명명: 깊이, 법선 등)를 만들고, 그 버퍼에 **이미지 처리(불연속/에지
    검출)** 를 적용해 윤곽선(profile/contour)과 등고선·하이라이트를 그린다. "G-buffer"라는 용어와
    G-buffer 후처리로 선을 뽑는다는 발상의 원전.
  - **검증사실 ↔ 본문:** §4 "이미지 기반 에지 — 노멀·깊이 불연속"의 G-buffer framing과 직계 계보.

- **Philippe Decaudin, "Cartoon-Looking Rendering of 3D-Scenes" (INRIA RR-2919, 1996)**
  - 프로젝트 페이지(직접 fetch OK): https://phildec.users.sourceforge.net/Research/Cartoon.php
  - 요지: 3D 장면을 카툰처럼. 면은 소수 tone(앞 챕터), **윤곽선은 z-buffer와 normal-buffer의
    불연속을 멀티패스로 검출**해 그린다. 깊이 불연속=실루엣/오클루전, 법선 불연속=내부선(crease)
    라는 이 챕터의 핵심 구분이 여기서 나온다.
  - **검증사실 ↔ 본문:** §4의 깊이/노멀 두 채널 분리, §1 도입의 "선의 두 종류".

## 2. Inverted-hull(back-face) 외곽선

- inverted-hull은 단일 정전(canonical paper)보다 **실시간 toon 렌더링의 공통 관용기법**으로
  정착했다. 표준 설명:
  - 같은 메시를 법선 방향으로 $w$만큼 부풀린 복제본을 **백페이스만**(front-face culling) 그려
    실루엣 테두리를 만든다. 본체는 그 위에 평소대로 그린다.
  - 대표 레퍼런스/튜토리얼(개념·구현 교차확인용): Unity URP/HLSL toon outline 가이드,
    Catlike Coding, Roystan "Toon Shader" 등 — 모두 "extrude along normal + render back faces"
    골격을 동일하게 기술. (게임엔진 튜토리얼이라 1차 논문은 아님 → 본문은 기법의 *원리*만 서술.)
  - **검증사실 ↔ 본문:** §1 InvertedHull. "백페이스만 남기면 원본 실루엣 바깥으로 비어져 나온
    가장자리만 테두리로 남는다"는 설명.

- **화면공간 일정 두께(clip.w 보정):** 정점을 클립 공간으로 보낸 뒤 화면 법선 방향으로
  $\frac{2 w_{px}}{\text{res}} \cdot w_{clip}$만큼 밀면 곧이은 $\div w_{clip}$와 상쇄되어 화면
  두께가 깊이와 무관해진다. 다수의 toon outline 셰이더(Unity/Godot/three.js 예제)에서 동일한
  관용식으로 쓰인다.
  - **검증사실 ↔ 본문:** §2의 유도식과 `ScreenConstantOutline` 위젯. 메모의 "smoothed normal로
    하드 에지 갈라짐 완화"도 같은 커뮤니티 표준 처방.

## 3. 프로덕션 사례 — Guilty Gear Xrd

- **Junya C. Motomura, "GUILTY GEAR Xrd -SIGN- : Behind the scenes of the most stylish fighting
  game" (GDC 2015)**
  - 슬라이드(저자 호스트, 직접 fetch 시도 403 보고됨 → 검색 스니펫 교차확인):
    https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf
  - 요지: 3D 캐릭터에 셀 음영 + 외곽선. 실루엣 외곽선은 inverted-hull 계열, 내부선/그림자는
    아티스트가 텍스처·정점 데이터로 직접 제어(수학적 정확성보다 작화 일관성 우선).
  - **검증사실 ↔ 본문:** §1·§"두 방법, 언제 무엇을"·"더 나아가기"의 아티스트 제어 언급.

## 4. 곡률 기반 선

- **Doug DeCarlo, Adam Finkelstein, Szymon Rusinkiewicz, Anthony Santella,
  "Suggestive Contours for Conveying Shape" (SIGGRAPH 2003)**
  - 프로젝트 페이지(직접 fetch OK): https://www.cs.rutgers.edu/~decarlo/contour.html
  - 요지: 실루엣($n\cdot v=0$)에 더해, 시점이 조금만 움직이면 실루엣이 될 "거의 실루엣"인 선을
    그려 형태 전달력을 높임(표면 곡률의 미분기하로 정의).
  - **검증사실 ↔ 본문:** "더 나아가기"의 suggestive contour 항목.

## 5. anti-alias 연결 (`fwidth`)

- **Khronos GLSL 레퍼런스 — `fwidth`/`dFdx`/`dFdy`**
  - https://registry.khronos.org/OpenGL-Refpages/gl4/html/fwidth.xhtml
  - **검증사실 ↔ 본문:** §4 메모에서 후처리 에지의 화면공간 일정폭 anti-alias로 `smoothstep`+
    `fwidth`를 연결(앞 챕터 cel-shading-ramp §6과 동일 원리).

---

## 데모 ↔ 사실 대응 요약

- `InvertedHull`: 법선 extrude + back-face only. (Decaudin 계열 아님 — 기하 기반 관용기법.)
- `ScreenConstantOutline`: object vs 화면공간(clip.w 보정) 두께. 원근 분할 상쇄.
- `EdgeDetect`: G-buffer(뷰 법선·깊이) → 중심 차분 에지 → mix. Saito–Takahashi/Decaudin 계열.
