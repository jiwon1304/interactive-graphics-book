# 출처 — rim-light-matcap ("림 라이트와 매트캡")

1차 자료 기준으로 작성. 일부 학회 PDF가 게이트되어 canonical 서지 + 검색 스니펫으로 교차확인.
verbatim 미확정은 "요지"로 표기.

---

## 1. 프레넬 / 림 항

- **Christophe Schlick, "An Inexpensive BRDF Model for Physically-based Rendering"
  (Computer Graphics Forum / Eurographics 1994)**
  - 요지: 프레넬을 $F = F_0 + (1-F_0)(1-\cos\theta)^5$로 근사. NPR 림은 이 중 $(1-\cos\theta)=
    (1-\mathbf{n}\cdot\mathbf{v})$ 부분만 떼어 지수를 자유 손잡이로 둔 것.
  - **검증사실 ↔ 본문:** §1 rim = $(1-\max(0,N·V))^p$ 식의 근거. "스치는 각=실루엣에서 강함".

- 림을 광원 방향으로 마스킹(역광쪽만)하는 것은 캐릭터 셰이딩의 공통 관용 — 단일 논문보다
  실무 셰이더(Unity/UE toon, ToonyColors 등)에서 표준화. 본문은 원리(반광원 smoothstep 마스크)만 서술.

## 2. matcap / lit-sphere

- **Peter-Pike Sloan, William Martin, Amy Gooch, Bruce Gooch,
  "The Lit Sphere: A Model for Capturing NPR Shading from Art" (Graphics Interface 2001)**
  - 요지: 미리 칠한(또는 사진) 구 이미지를 표면 법선으로 인덱싱해 NPR 음영을 "캡처". matcap의 정초.
  - **검증사실 ↔ 본문:** §2 matcap 정의·동기.

- **three.js `MeshMatcapMaterial` 문서**
  - https://threejs.org/docs/#api/en/materials/MeshMatcapMaterial
  - 요지: 뷰공간 법선의 xy로 matcap 텍스처를 인덱싱(`uv = viewNormal.xy*0.5+0.5`). 조명 계산 없음.
  - **검증사실 ↔ 본문:** §2 매핑식 `uv = ½ n_view.xy + ½`, "뷰공간이라 카메라 따라 빛이 돈다"는 한계.

## 3. 일반 GLSL

- Khronos GLSL 레퍼런스: `pow`, `reflect`, `dot`
  - https://registry.khronos.org/OpenGL-Refpages/gl4/html/pow.xhtml
  - https://registry.khronos.org/OpenGL-Refpages/gl4/html/reflect.xhtml

---

## 데모 ↔ 사실 대응

- `RimLight`: $(1-N·V)^p$ + 역광 마스크. 프레넬 마스크 시각화.
- `Matcap`: 절차적 matcap(코드로 구운 구)을 뷰공간 법선 xy로 샘플. 법선→UV 시각화.
- `MatcapRimToon`: 뷰공간 base(matcap) + 월드공간 accent(rim) 레이어링.
