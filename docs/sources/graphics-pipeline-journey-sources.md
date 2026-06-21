# 출처 — graphics-pipeline-journey ("삼각형의 여정 — 정점에서 픽셀까지")

이 챕터는 아래 1차/전문가 자료를 기준으로 작성·검증했다(소급 검수, 조사일 2026-06).
검증 방법 메모: `fgiesen.wordpress.com`·`learn.microsoft.com`·Kok-Lim Low PDF는 WebFetch가
403이라, (a) 저자 GitHub 미러(`rygorous/rygblog-src`)와 (b) 검색 스니펫으로 canonical 원문
verbatim을 교차확인했다. 인용은 canonical URL 기준. 이 챕터의 전체 관점은 Fabian Giesen의
*A Trip Through the Graphics Pipeline 2011* 시리즈를 따른다.

---

## 0. 전체 관점 출처

- **Fabian Giesen("ryg"), A Trip Through the Graphics Pipeline 2011** (13부작) — 인덱스:
  https://fgiesen.wordpress.com/2011/07/09/a-trip-through-the-graphics-pipeline-2011-index/
  - **검증사실 ↔ 본문:** 도입부 "Fabian Giesen의 고전에서 빌려온 관점". **확인(실존·이 파이프라인을 다룸).**

## 1. 입력 어셈블리 · 인덱스 버퍼 · post-transform 캐시

- **Microsoft — Input-Assembler Stage** —
  https://learn.microsoft.com/en-us/windows/win32/direct3d11/d3d10-graphics-programming-guide-input-assembler-stage
  - IA가 vertex/index 버퍼에서 프리미티브를 조립; index buffer는 vertex buffer의 정점을 가리킴.
- **Khronos OpenGL Wiki — Post Transform Cache** —
  https://www.khronos.org/opengl/wiki/Post_Transform_Cache
  - 정점 인덱스로 캐시; 히트 시 *"skips the read and vertex shader execution steps."*
  - **보강 노트(오류 아님):** Kerbl et al.(HPG 2018, "Revisiting the Vertex Cache")에 따르면
    현대 GPU는 *전역 LRU 캐시*가 아니라 *로컬 배치 내 재사용*을 함. 본문의 일반적 "변환 결과
    재사용"은 교육적으로 적절(고정 전역 LRU로 단정하면 약간 구식).
  - **검증사실 ↔ 본문:** §1 IA/인덱스/post-transform 캐시. **확인.**

## 2. 오일러 공식 — 닫힌 삼각형 메시 T ≈ 2V

- **Euler's polyhedron formula** $V-E+F=2$ —
  https://plus.maths.org/content/eulers-polyhedron-formula
  - 삼각형 메시: 면당 3변, 변당 2면 공유 → $E=3F/2$. 대입 시 $F=2(V-2)\approx 2V$.
  - **검증사실 ↔ 본문:** §1 "$T\approx 2V$" 유도. **확인(수학 정확).**

## 3. 정점 셰이더 → 클립 공간 · w에 깊이

- **LearnOpenGL — Coordinate Systems** / **Homogeneous & clip space** —
  https://learnopengl.com/Getting-started/Coordinate-Systems
  https://carmencincotti.com/2022-05-02/homogeneous-coordinates-clip-space-ndc/
  - $\mathbf{p}_{clip}=M_{proj}M_{view}M_{model}\mathbf{p}$; 원근 행렬이 카메라 공간 z(의 음수)를
    $w_c$에 실음.
  - **주의:** "$w_c \approx -z_{view}$"는 관례적 RH/표준 원근 행렬에서. 부호는 convention 의존
    — 본문 "대략"이 적절한 hedge.
  - **검증사실 ↔ 본문:** §2 VS, $w_c$. **확인.**

## 4. 백페이스 컬링 = signed area 부호(와인딩)

- **Microsoft — D3D11_RASTERIZER_DESC (FrontCounterClockwise, CullMode)** —
  https://learn.microsoft.com/en-us/windows/win32/api/d3d11/ns-d3d11-d3d11_rasterizer_desc
  - 스크린 와인딩(CW/CCW)으로 front/back 판정 후 CullMode가 선택 방향 폐기. 스크린 와인딩 =
    signed area / 2D 외적 z의 부호.
  - $2\cdot\mathrm{Area}=(B_x-A_x)(C_y-A_y)-(B_y-A_y)(C_x-A_x)$는 표준 orient2d 식.
  - **검증사실 ↔ 본문:** §3 BackfaceCulling, 부호 있는 면적. **확인.**

## 5. 클리핑 · Sutherland–Hodgman · 근평면(w≤0) 필수

- **Fabian Giesen — A Trip … Part 5** —
  https://fgiesen.wordpress.com/2011/07/05/a-trip-through-the-graphics-pipeline-2011-part-5/
  - 클립 공간 = 6평면 박스; $w\le0$ 정점은 ÷w 전에 클립 필수(아니면 0으로 나눔/뒤집힘).
  - Sutherland–Hodgman: 한 평면씩, in/out 4케이스, 교점 $t=f_0/(f_0-f_1)$, 결과 다각형을 fan으로
    재삼각화.
  - **검증사실 ↔ 본문:** §4 클리핑, in/out 케이스, $t$ 식, predict-then-reveal(오각형). **확인.**

## 6. 가드 밴드 — 대개 클립 안 함 · 근평면은 우회 불가 (핵심 nuance)

- **Fabian Giesen — Part 5** (위 #5 동일)
  - 가드 밴드 = *"a straight-forward way of not doing clipping"*; 좌/우/상/하 평면을 살짝 넘는
    대부분 프리미티브는 클립 불필요(스크린 시저로 화면 밖 픽셀 폐기). 진짜 클립은 가드 밴드를
    넘거나 **근평면(w≤0)** 을 가로지를 때만 — 근평면은 우회 불가.
  - **검증사실 ↔ 본문:** §4 `<details>` 가드 밴드. **확인(nuance 정확).**

## 7. 원근 분할 · NDC 범위 · 뷰포트 변환 — **z 범위 API 의존성 보정함**

- **Songho — OpenGL Viewport** — https://www.songho.ca/opengl/gl_viewport.html
  - $x_{ndc}=x_c/w_c$ …; 뷰포트 $x_{screen}=(x_{ndc}+1)/2\cdot w_{vp}$,
    $y_{screen}=(1-y_{ndc})/2\cdot h_{vp}$(y flip).
- **⚠️ 정정 반영(본문 수정함): z-NDC 범위는 API 의존.**
  - https://matthewwellings.com/blog/the-new-vulkan-coordinate-system/
  - $x,y$의 NDC $[-1,1]$은 공통이나 **$z$는 OpenGL $[-1,1]$, D3D/Vulkan/Metal $[0,1]$**
    (클립 부피 $-w\le z_c\le w$ 대 $0\le z_c\le w$). 깊이 정밀도에도 영향.
  - 원문 "$(x_{ndc},y_{ndc},z_{ndc})\in[-1,1]^3$"은 OpenGL 한정. → 본문을
    "$x,y\in[-1,1]$, z는 API 의존(OpenGL [-1,1] / D3D·Vulkan·Metal [0,1])"으로 수정. **완료.**
  - y flip도 convention 의존(OpenGL 좌하단 원점) — 본문 서술 적절.
  - **검증사실 ↔ 본문:** §4 원근 분할/뷰포트. **확인(수정 후).**

## 8. 원근 보정 보간 — 1/w 공간 · PS1 affine 왜곡

- **Kok-Lim Low — Perspective-Correct Interpolation** —
  https://www.comp.nus.edu.sg/~lowkl/publications/lowk_persp_interp_techrep.pdf
- **Andrew Chan — Perspective interpolation** — https://andrewkchan.dev/posts/perspective-interpolation.html
  - 화면선형 보간은 틀림; 속성/w와 1/w를 화면에서 선형 보간 후 픽셀에서 나눔. 1/w는 화면에서
    선형(아핀)이므로.
  - 본문 식 $u=\sum(u_i/w_i\cdot\lambda_i)/\sum(1/w_i\cdot\lambda_i)$ = 표준형(클립 $w$ 가중). **정확.**
  - PS1 텍스처 흔들림 = affine(원근 비보정) 매핑.
  - **검증사실 ↔ 본문:** §4 PerspectiveDivide, 보정 식, PS1. **확인(식 정확).**

## 9. 에지 함수 = 2·signed area (동일 식) · 내부 판정 = 부호 일치 (Pineda)

- **Fabian Giesen — The barycentric conspiracy / Triangle rasterization in practice** —
  https://fgiesen.wordpress.com/2013/02/06/the-barycentric-conspirac/
  https://fgiesen.wordpress.com/2013/02/08/triangle-rasterization-in-practice/
- **Juan Pineda — A Parallel Algorithm for Polygon Rasterization** (SIGGRAPH 1988, 원전) —
  https://dl.acm.org/doi/10.1145/378456.378457
  - 에지 함수 = orient2d 행렬식; 부호가 변의 어느 쪽인지. 세 에지 부호 일치 ⇔ 내부.
    *"twice the signed area of the corresponding triangle"* → **$E_{AB}(C)=2\cdot\mathrm{Area}(A,B,C)$**.
  - **검증사실 ↔ 본문:** §5 EdgeFunctions, 에지=면적 동일 식. **확인(핵심 항등식 정확).**

## 10. 점진적 평가 — 에지 함수 선형, 옆 픽셀은 덧셈만

- **Fabian Giesen — Optimizing the basic rasterizer** —
  https://fgiesen.wordpress.com/2013/02/10/optimizing-the-basic-rasterizer/
  - $F(p_x+1,p_y)-F=A=(v0y-v1y)$, $F(p_x,p_y+1)-F=B=(v1x-v0x)$. 셋업서 상수 1회, 내부 루프는 덧셈.
  - 본문 $a=(B_y-A_y)$, $b=-(B_x-A_x)$는 Giesen의 A·B와 일치.
  - **검증사실 ↔ 본문:** §5 점진적 평가. **확인.**

## 11. 무게중심 좌표 = 에지 함수 비율 · 합=1

- **Fabian Giesen — The barycentric conspiracy** (위 #9)
  - $\lambda_0=F_{12}/2\triangle$ …; $\lambda_0+\lambda_1+\lambda_2=1$(부분 면적 합=전체).
  - **검증사실 ↔ 본문:** §6 무게중심 좌표, 합=1. **확인.**

## 12. 2×2 쿼드 · helper 레인 · 화면공간 미분(밉 LOD)

- **Fabian Giesen — Part 8** —
  https://fgiesen.wordpress.com/2011/07/10/a-trip-through-the-graphics-pipeline-2011-part-8/
  - 2×2 쿼드; 삼각형 밖 픽셀도 셰이드(helper)되고 결과 폐기; 이유는 텍스처 밉 선택용 화면공간
    미분을 쿼드 내 차분으로 얻기 때문. 작은 삼각형일수록 낭비↑.
  - **검증사실 ↔ 본문:** §5 `<details>` 2×2 쿼드/헬퍼 레인. **확인.**

## 13. early-Z — 셰이딩 전 깊이 테스트 · SV_Depth/discard 시 비활성 · 깊이 프리패스

- **Fabian Giesen — Part 7** —
  https://fgiesen.wordpress.com/2011/07/08/a-trip-through-the-graphics-pipeline-2011-part-7/
- **Microsoft — early depth-stencil** (Depth-Stencil 문서 / `[earlydepthstencil]`).
  - PS가 깊이를 쓰면 *"The only case that really precludes … early Z-testing … is when we write
    the output depth in the pixel shader."* discard/alpha-test도 early-Z를 제약.
  - **정밀 노트(미세):** discard/alpha-test는 정확히는 early-Z *write* 를 미루고, early-Z *test*
    자체는 가능한 경우가 있음. PS가 깊이를 직접 쓸 때만 완전 차단. 본문은 직관 우선으로 묶어
    서술 — 약간의 단순화이나 핵심(깊이 안 건드리는 게 황금률)은 정확.
  - **검증사실 ↔ 본문:** §7 early-Z, 오버드로 d, 깊이 프리패스. **확인(미세 단순화 주석).**

## 14. ROP — 깊이 테스트·블렌딩·쓰기 · read-modify-write · 투명은 뒤→앞

- **Fabian Giesen — Part 9** —
  https://fgiesen.wordpress.com/2011/07/12/a-trip-through-the-graphics-pipeline-2011-part-9/
  - ROP = Render Output/Raster Operations; *"order-sensitive (both blending and Z processing need
    to happen in API order)"*; read-modify-write; *"bandwidth-intensive."*
  - 블렌딩 $src\cdot\alpha+dst\cdot(1-\alpha)$(over). 순서 의존 → 투명은 뒤→앞 정렬(표준 귀결).
  - **검증사실 ↔ 본문:** §7 RopBlend, 블렌딩 식, 뒤→앞. **확인.**

---

### 수정/플래그 요약

- **[수정함] §4 z-NDC 범위:** "$[-1,1]^3$"(OpenGL 한정) → "$x,y\in[-1,1]$, z는 API 의존
  (OpenGL [-1,1] / D3D·Vulkan·Metal [0,1])" 문단 추가.
- **[확인] 핵심 항등식·식 모두 정확:** 에지 함수=2·signed area(§5), 1/w 원근 보정(§4), 점진적
  평가(§5), 무게중심(§6), 오일러 $T\approx2V$(§1), 가드 밴드(§4).
- **[보강 노트, 오류 아님]** §1 post-transform 캐시(현대는 로컬 배치 재사용); §7 early-Z의
  discard는 test가 아니라 write를 미룸 — 본문 직관 서술 유지.
