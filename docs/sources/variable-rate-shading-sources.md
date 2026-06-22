# Variable Rate Shading — 출처와 검증 노트

집필·검수 시 사용한 1차/전문가 자료와, 본문의 핵심 사실 ↔ 출처 대응. 모든 수치는 ≥2개
출처로 교차확인했고, 마케팅/미확정 수치는 명시.

## 핵심 사실 ↔ 출처

| 본문 주장 | 출처 | 비고 |
|---|---|---|
| VRS = shading rate를 visibility/coverage에서 분리. depth·stencil·coverage는 항상 full sample 해상도에서 계산·기록, 셰이딩 결과만 broadcast | D3D12-Specs VariableRateShading.md | 명세 원문 인용 |
| 지원 rate: 1x1,1x2,2x1,2x2,2x4,4x2,4x4. 앞 4개는 항상, 뒤 3개는 `AdditionalShadingRatesSupported` cap | D3D12-Specs | 확정 |
| NxM rate → 셰이딩 호출 1/(N·M) | D3D12-Specs(정의로부터) | 2x2=1/4, 4x4=1/16 |
| `SV_Depth`/`SV_StencilRef` 출력 시 1x1로 강제 복귀 | D3D12-Specs | 확정 |
| 세 source: per-draw(`RSSetShadingRate`), per-primitive(`SV_ShadingRate`, flat/provoking vertex), screen-space VRS image(`R8_UINT`) | D3D12-Specs / MS Learn | 확정 |
| VRS image 타일 = 정사각, 8 또는 16 텍셀(`ShadingRateImageTileSize`, OPTIONS6) | D3D12-Specs | 본문 "보통 8×8 또는 16×16"의 근거 |
| 두 combiner 연쇄: (draw⊕prim)→(⊕image). ops: passthrough/override/min/max/sum(saturate). sum은 별도 cap | D3D12-Specs | `min`=고운 쪽, `max`=거친 쪽 |
| Tier 1 = per-draw만. Tier 2 = +per-primitive·image·combiner·`SV_ShadingRate` PS입력 | D3D12-Specs, MS DirectX blog | 확정 |
| HW 최초: NVIDIA Turing(2018), Intel Gen11/Ice Lake(2019), AMD RDNA2(2020) | Tom's HW, Intel docs, GPUOpen RDNA2 | 확정 |
| Vulkan `VK_KHR_fragment_shading_rate`: pipeline/primitive/attachment 3종 + 2단 combiner. ops KEEP/REPLACE/MIN/MAX/**MUL**(D3D12의 sum 대신 곱셈) | Khronos KHR proposal | MUL 예: {2,2}×{1,4}={2,8} clamp |
| `VK_NV_shading_rate_image`: 16×16 타일·팔레트, supersample rate까지 표현 | Khronos registry, NVIDIA Turing VRS blog | NV 16×16 확정 |
| 2x2 coarse → gradient(derivative) 2배 → mip 한 단계 거칠게 선택 | D3D12-Specs("gradient twice the size") | mip 흐림의 직접 원인 |
| 적응 정책: foveated, Content-Adaptive(직전 프레임 contrast), Motion-Adaptive | NVIDIA Adaptive Shading, GPUOpen FidelityFX Variable Shading | CAS/MAS |
| AMD FidelityFX Variable Shading: 직전 프레임 휘도 분산 + 모션벡터로 image 생성, 오픈소스 | GPUOpen | 확정 |
| MSAA와 직교: coverage 샘플별 유지, 셰이딩만 굵게. 셰이딩 호출당 sample ≤16 (4×MSAA×2x2=16) | D3D12-Specs | 확정 |

## 마케팅/미확정 수치 (본문에서 플래그함)

- **Gears Tactics/Gears 5 ~14% GPU 이득**: Microsoft DirectX devblog "Moving Gears to Tier 2
  VRS" — 1인칭(개발사 The Coalition) 수치라 상대적으로 신뢰. 본문에서 우선 인용.
- **Wolfenstein: Youngblood "최대 15~20%"**: NVIDIA 자료마다 15% vs 20%로 갈림 → IHV 마케팅
  수치로 플래그. 본문에 "자료마다 숫자가 갈린다"고 명시.
- Vulkan `maxFragmentSize` = 4x4는 흔한 HW 최대지만 보편 보장 아님 — 본문에서 단정하지 않음.

## 주요 URL

- D3D12 VRS 명세: https://microsoft.github.io/DirectX-Specs/d3d/VariableRateShading.html
  (raw: https://raw.githubusercontent.com/microsoft/DirectX-Specs/master/d3d/VariableRateShading.md)
- DirectX devblog "scalpel": https://devblogs.microsoft.com/directx/variable-rate-shading-a-scalpel-in-a-world-of-sledgehammers/
- DirectX devblog "Gears Tier 2" (~14%): https://devblogs.microsoft.com/directx/gears-vrs-tier2/
- DirectX devblog "Gears Tactics VRS": https://devblogs.microsoft.com/directx/gears-tactics-vrs/
- MS Learn VRS: https://learn.microsoft.com/en-us/windows/win32/direct3d12/vrs
- VK_KHR_fragment_shading_rate proposal: https://docs.vulkan.org/features/latest/features/proposals/VK_KHR_fragment_shading_rate.html
  (raw adoc: https://raw.githubusercontent.com/KhronosGroup/Vulkan-Docs/main/proposals/VK_KHR_fragment_shading_rate.adoc)
- VK_NV_shading_rate_image: https://registry.khronos.org/vulkan/specs/1.3-extensions/man/html/VK_NV_shading_rate_image.html
- NVIDIA Adaptive Shading deep-dive: https://www.nvidia.com/en-us/geforce/news/nvidia-adaptive-shading-a-deep-dive/
- NVIDIA Adaptive Shading GDC19 PDF: https://www.leiy.cc/publications/nas/nas-gdc19.pdf
- AMD GPUOpen FidelityFX Variable Shading: https://gpuopen.com/fidelityfx-variable-shading/
- AMD GPUOpen RDNA2: https://gpuopen.com/rdna2/
- Intel "Getting Started with VRS": https://www.intel.com/content/dam/develop/external/us/en/documents/getting-started-with-vrs-on-intel-processor-graphics.pdf
- Tom's HW "What is VRS": https://www.tomshardware.com/reviews/variable-rate-shading-vrs-definition-nvidia-graphics,6342.html

## 검수 메모

- 데모 `Combiners.tsx`의 op 의미(min=더 고운 축값 채택, max=더 거친, sum=saturate add)는 명세와
  일치. Vulkan의 MUL은 본문 details에서만 언급(데모는 D3D12 sum 모델).
- 데모 `CoarsePixel.tsx`는 "블록 중심 1회 셰이딩 → 블록 broadcast"로 명세의 coarse pixel
  의미를 따름. coverage/depth full 해상도라는 점은 그림이 아니라 본문 §1에서 설명(도식 단순화).
- 미확인: 직접 fetch가 403된 페이지(NVIDIA/MS devblog/Khronos 렌더HTML) 다수 — 사실은 GitHub
  raw 명세 원문으로 확인, 일부 *수치*는 검색 스니펫 기반(위 마케팅 항목).
