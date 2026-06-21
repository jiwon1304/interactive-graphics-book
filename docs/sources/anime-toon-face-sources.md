# 출처 — anime-toon-face ("아니메 툰 셰이딩과 얼굴")

1차 자료 + 업계 발표 기준. 일부(게임사 내부 기법·게이트 PDF)는 canonical 서지와 공개 해설로
교차확인했고, verbatim 미확정은 "요지"로 표기. 게임 캐릭터 모델 등 저작권 자산은 저장소에 포함하지 않음.

---

## 1. 얼굴 SDF 그림자 맵 (miHoYo 계열)

- 원신/붕괴 시리즈에서 대중화된 **SDF 기반 얼굴 그림자**: 여러 광원 각도의 얼굴 그림자 경계를
  하나의 그레이스케일/거리장 텍스처로 굽고, 런타임에 광원 yaw를 스칼라 임계로 비교해 그림자를
  좌우로 쓸어낸다. 좌우 대칭은 UV 반전으로 재사용.
  - SDF 생성의 표준 알고리즘: **Guodong Rong, Tiow-Seng Tan, "Jump Flooding in GPU with
    Applications to Voronoi Diagram and Distance Transform" (I3D 2006).**
  - 본문은 게임사 내부 셰이더 코드가 아니라 **공개 해설·재현 글의 공통 기법**을 근거로 원리만
    서술(임계 비교 = cel-shading 챕터의 1D ramp 끊기의 2D 버전).
  - **검증사실 ↔ 본문:** §"얼굴 SDF 그림자 맵" 식 `shadow = s < p` / `lit = smoothstep(p-w,p+w,s)`,
    `FaceShadowSDF` 데모. 데모 필드는 설명용 절차 생성(근사)임을 본문 메모에 명시.

## 2. 얼굴 법선 평활화(구면/프록시 법선)

- 얼굴 메시 법선을 실제 형상 대신 **더 매끈한 형상(구/타원체)의 법선으로 교체**해 잔 그림자·얼룩을
  없애는 기법. DCC에서 정점 데이터로 구워 두는 것이 일반적. 다수 toon 파이프라인 공통.
  - **검증사실 ↔ 본문:** §"얼굴 법선 트릭" 식 `n = normalize(lerp(n_mesh, normalize(p - c_head), t))`,
    `AnimeModelViewer`의 "구면 법선 평활화" 슬라이더(머리 전체 일률 적용 = 원리 시연).

## 3. 머리카락 비등방 하이라이트

- **James T. Kajiya, Timothy L. Kay, "Rendering Fur with Three Dimensional Textures"
  (SIGGRAPH 1989)** — 가닥 접선 기준 비등방 스페큘러(Kajiya–Kay)의 원전.
  - 요지: 표면 법선 대신 접선 $\mathbf{t}$ 사용, $\text{spec} \propto (\sin(\mathbf{t},\mathbf{h}))^e
    = (\sqrt{1-(\mathbf{t}\cdot\mathbf{h})^2})^e$.
- **Stephen R. Marschner et al., "Light Scattering from Human Hair Fibers" (SIGGRAPH 2003)** —
  더 물리적인 머리카락 산란(R/TT/TRT). 아니메는 이를 양식화.
  - **검증사실 ↔ 본문:** §"머리카락" 식과 `HairAnisotropy` 데모. 접선 shift·toon-step·보조 띠
    (angel ring)는 아니메 관용 — 원리만 서술.

## 4. 양식화 철학·기타 트릭

- **Junya C. Motomura, "GUILTY GEAR Xrd -SIGN-" (GDC 2015)** —
  https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf
  - 요지: 의도적으로 "틀린" 법선·손칠 그림자 맵으로 모든 각도에서 일러스트 일관성 확보.
    물리 정확성보다 작화 우선이라는 본문 결론의 근거.
  - **검증사실 ↔ 본문:** §"왜 다른가"·§"그 밖의 트릭"·§결론.
- 눈썹 머리카락 위 렌더(깊이/스텐실), 눈 시차매핑, 자기그림자 받기/주기 분리 등은 다수 캐릭터
  셰이더의 공통 관용 — 본문은 원리만 언급(특정 1차 출처 없음).

## 5. 저작권 메모

- 원신·엔드필드 등 캐릭터 모델은 각 게임사 저작물. 추출/커뮤니티 업로드(aplaybox 등)도 공식
  재배포 허가가 아님 → **저장소 미포함**. 뷰어는 브라우저 로컬 전용(업로드·커밋 없음). HoYoverse 등의
  비상업 2차 창작 가이드라인 확인 권고.

---

## 데모 ↔ 사실 대응

- `FaceShadowSDF`: SDF 임계 비교 vs N·L 자기그림자 대비. 필드 시각화. (miHoYo 계열 원리.)
- `AnimeModelViewer`: toon ramp + 그림자 틴트 + 림 + inverted-hull + 구면 법선 평활화. BYO .glb(로컬).
- `HairAnisotropy`: Kajiya–Kay + 접선 shift + toon-step + angel ring.
