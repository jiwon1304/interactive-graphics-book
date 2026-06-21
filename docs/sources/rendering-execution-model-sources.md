# 출처 — rendering-execution-model ("렌더링에서의 GPU 실행 — 픽셀 쿼드와 깊이 컬링")

이 챕터는 아래 1차/전문가 자료를 기준으로 *소급 검증*했다(검증일: 2026-06). 검증 방법: 일부
공식 문서(learn.microsoft.com·docs.vulkan.org·fgiesen.wordpress.com)는 직접 fetch가 403으로
막혀, 검색 스니펫·미러로 canonical 사실을 교차확인했다. 인용은 canonical URL 기준.

핵심 결론: **본문의 사실관계에 실질적 오류 없음.** 수치(쿼드 75% 헬퍼, $\lambda=\log_2\rho$,
$1/\sqrt{A}$, $D$ vs $1$ 등)는 모두 표준 정의에서 따라 나오는 결과거나 도식용 대표값이다.

---

## 1. 2×2 픽셀 쿼드 · 헬퍼 레인(helper invocation) · 화면공간 미분

- **fgiesen, "A trip through the Graphics Pipeline 2011, part 8 — Pixel processing"** —
  https://fgiesen.wordpress.com/2011/07/10/a-trip-through-the-graphics-pipeline-2011-part-8/
  - 픽셀 셰이더는 **2×2 quad** 단위로 실행되고, 화면공간 미분(`ddx`/`ddy`)을 *쿼드 내 이웃
    차분*으로 구한다. 삼각형이 쿼드를 부분만 덮어도 네 픽셀이 모두 실행되며, 덮이지 않은
    레인은 결과가 버려지는 **helper lane**이다(미분을 위해 값을 채워 줄 뿐).
  - **본문 ↔ 출처:** "삼각형이 그 네 칸 중 하나만 덮어도 항상 함께 셰이딩, 나머지는 버려짐",
    "헬퍼 레인" 명칭·역할 일치. PixelQuads·QuadDerivatives 위젯이 이를 도식화.
- **Vulkan spec — Helper Invocations / Derivative Operations**
  https://docs.vulkan.org/spec/latest/chapters/shaders.html (Helper Invocations),
  https://registry.khronos.org/OpenGL-Refpages/gl4/html/dFdx.xhtml (dFdx/dFdy)
  - 미분은 quad 내 유한차분으로 근사. `dFdxCoarse`/`dFdxFine`(GL) = D3D `ddx_coarse`/`ddx_fine`.
  - **본문 ↔ 출처:** coarse vs fine, "쿼드 밖으로 못 나간다(미분 해상도 상한=2픽셀)" 일치.
- **HLSL `ddx`/`ddy`, coarse/fine** — Microsoft Learn
  https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/ddx
  https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/ddx-coarse
  - coarse가 기본 동작이고 쿼드 한 벌의 미분을 공유. 본문 details 블록과 일치.

### 검증 — "한 픽셀짜리 삼각형 → 헬퍼 75%", 헬퍼 비율 $\sim 1/\sqrt A$
- 1×1 삼각형은 2×2 쿼드 하나를 켜고 1/4만 사용 → 3/4 = **75%** 헬퍼. 산술적으로 옳음.
- $\text{둘레}/\text{면적} \sim \sqrt A / A = 1/\sqrt A$ 는 표준 스케일링. 도식용 직관으로 적절.
- **쿼드 오버셰이딩(quad overshading/overdraw)** 이 실측·최적화 대상이라는 서술, Nanite가
  픽셀 크기 삼각형을 피한다는 서술:
  - Epic, "Nanite Virtualized Geometry" — https://docs.unrealengine.com/5.0/en-US/nanite-virtualized-geometry-in-unreal-engine/
  - quad overdraw 시각화는 RenderDoc 등에서 표준 제공(개념 일치).

## 2. early-Z vs late-Z · discard/SV_Depth가 early-Z를 끄는 이유

- **MJP(Matt Pettineau), "To Early-Z, or Not To Early-Z"** —
  https://therealmjp.github.io/posts/to-earlyz-or-not-to-earlyz/
  - 논리적 파이프라인은 *셰이딩 후 깊이 테스트*(late-Z)지만, 하드웨어는 셰이더가 깊이/가시성을
    바꾸지 않으면 깊이 테스트를 셰이더 앞으로 당긴다(early-Z).
  - **discard:** *"The implications to Early-Z apply as long as your compiled shader instruction
    stream contains any discard at all"* — 셰이더에 `discard`가 *존재하기만 해도* 드라이버는
    early-Z 결정을 보수적으로 한다(실제로 버리는 픽셀이 없어도). 본문 details와 일치.
  - **SV_Depth/gl_FragDepth:** 셰이더가 깊이를 출력하면 테스트할 값을 셰이더가 만들어 내므로
    앞당길 수 없다. **`[earlydepthstencil]`** 강제 힌트 존재. 본문과 일치.
- **검증 — late-Z=$D$, early-Z(앞→뒤)=1, 절약 $D-1$:** 깊이 복잡도 $D$(보이는 건 맨 앞 하나)
  정의에서 직접 따라 나옴. front-to-back 정렬에서 early-Z가 가장 잘 듣는다는 서술 일치.

## 3. Hi-Z (hierarchical Z) · 타일 $[z_{\min}, z_{\max}]$ 보수적 컬링

- **RasterGrid, "Hierarchical-Z map based occlusion culling"** —
  https://www.rastergrid.com/blog/2010/10/hierarchical-z-map-based-occlusion-culling/
  - Hi-Z = 온칩의 축소·압축된 깊이로 *프래그먼트 무더기*를 조기 기각하는 표준 GPU 기능.
- **MJP(위)** — *"The earliest PC hardware to use Early-Z did so with hierarchical depth buffers
  (Hi-Z), where the hardware would maintain a separate buffer containing the min and max depth
  values for an NxN region of the depth buffer."*
  - **본문 ↔ 출처:** 타일별 $[z_{\min}, z_{\max}]$ 저장, $z_{\text{tri}}>z_{\max}$→기각 /
    $<z_{\min}$→통과 / 사이→모호(픽셀별 테스트). **보수적**(틀린 픽셀을 그리는 일은 없음)·
    앞→뒤 정렬·범위 넓은 타일이 컬링을 약화시킴 — 모두 일치.

## 4. LOD 공식 $\lambda = \log_2 \rho$ · 밉 선택

- **OpenGL 4.6 spec §8.14 (Texture Minification / Scale Factor and LOD)** —
  https://registry.khronos.org/OpenGL/specs/gl/glspec46.core.pdf
  - scale factor $\rho = \max\!\big(\sqrt{(\partial u/\partial x)^2+(\partial v/\partial x)^2},\
    \sqrt{(\partial u/\partial y)^2+(\partial v/\partial y)^2}\big)$, LOD
    $\lambda_{\text{base}} = \log_2 \rho$ (텍셀 단위 미분 기준). 본문 식과 정확히 일치.
- **Williams 1983(아래 §filtering 챕터 출처와 공유)** — mip 레벨 선택의 원조.
- **검증:** $\rho=1\to\lambda=0$, $\rho=4\to\lambda=2$, $\rho=256\to\lambda=8$ 모두 산술적으로 옳음.
  "거리 2배 → $\lambda$ +1" 도 $\lambda=\log_2\rho$, $\rho\propto$거리에서 직접 따라 나옴.

## 5. 오버드로 · 깊이 프리패스 (z-prepass)

- **깊이 프리패스로 색 패스의 셰이딩을 픽셀당 1회로** 만드는 표준 기법. 손익 $1+\epsilon$ vs $D$는
  도식용 모델(절대 비용 아님). 디퍼드/Forward+가 깊이 프리패스로 시작한다는 서술은 일반 통념.
  - 참고: NVIDIA GPU Gems, "Efficient Occlusion Culling"
    https://developer.nvidia.com/gpugems/gpugems/part-v-performance-and-practicalities/chapter-29-efficient-occlusion-culling

---

## 대표값/주의 (flag)
- $1+\epsilon$ vs $D$, late/early-Z의 $D$·$1$ 은 **도식용 대표 모델**(특정 측정 아님) — 본문도 그렇게 서술.
- 타일 크기 "8×8"(Hi-Z 예시)·"64픽셀"은 설명용 예시값(벤더마다 다름). 본문이 "예: 8×8"로 명시.
- 헬퍼 75%·$1/\sqrt A$ 는 정의에서 유도되는 정확값/스케일링.

## 결론
**오류·검토 필요 항목 없음.** 명칭(helper lane, coarse/fine derivative, early-Z, Hi-Z,
late-Z, `[earlydepthstencil]`)과 수식($\lambda=\log_2\rho$)이 spec·전문가 자료와 일치한다.
