# 출처 — graphics-driver ("그래픽스 드라이버 — 하는 일과 역사")

리서치 에이전트가 웹 검색으로 수집·교차검증. 자매 챕터(draw-call-journey·pipeline-state-shaders·
wddm-graphics-stack·dx-evolution-vulkan)와 중복을 피해, 본 챕터는 개관 + 셰이더 캐시/스터터 +
오픈소스/리눅스 + 역사에 집중. (세션 중 WebFetch 403 → canonical URL + 검색 스니펫 교차확인.)

## 핵심 사실 ↔ 출처
- WDDM UMD/KMD 분리, 드로우콜 흐름(앱→런타임→UMD→Dxgkrnl→KMD→GPU), 안정성 격리:
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/windows-vista-and-later-display-driver-model-architecture
- VidMm 레지던시/페이지인:
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/video-memory-management-and-gpu-scheduling ·
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/paging-video-memory-resources
- DXIL = LLVM 3.7 IR 서브셋 비트코드, dxc=LLVM/Clang 포크; DXBC(SM5.x)는 별개 토큰 바이트코드:
  https://github.com/microsoft/DirectXShaderCompiler/blob/main/docs/DXIL.rst
- 드라이버 JIT(IR→ISA): https://moonside.games/posts/layers-all-the-way-down/
- PSO 사전 컴파일·생성 비용(수십~수백 ms): https://blog.mecheye.net/2021/06/the-missing-guide-to-modern-graphics-apis-2-psos/ ·
  https://serverspace.io/support/help/pipeline-state-object-in-modern-graphics-apis/
- VkPipelineCache: https://docs.vulkan.org/guide/latest/pipeline_cache.html
- Fossilize / Steam 셰이더 사전 캐시: https://github.com/ValveSoftware/Fossilize ·
  https://www.phoronix.com/news/Steam-Vulkan-Shader-Pre-Cache
- 셰이더 스터터(CPU 작업): https://gameworldobserver.com/2023/04/07/shader-compilation-stuttering-pc-games-explained
- NVIDIA Auto Shader Compilation(Game Ready 595.97+, 기본 off): https://videocardz.com/newz/nvidia-adds-auto-shader-compilation-beta-to-nvidia-app
- 두꺼운 드라이버 CPU 오버헤드 범주(동기화·할당·검증·컴파일·바인딩): https://microsoft.github.io/DirectX-Specs/d3d/CPUEfficiency.html
- AZDO: https://archive-gaslamp.dredmor.com/2014/08/27/instancing-azdo-and-performance-optimization/
- Mesa/Gallium(state tracker+pipe), NIR, ACO(RADV 기본 Mesa 20.2):
  https://en.wikipedia.org/wiki/Mesa_(computer_graphics) · https://docs.mesa3d.org/nir/index.html ·
  https://docs.mesa3d.org/drivers/radv.html · https://www.gamingonlinux.com/2020/06/mesa-20-2-gets-the-valve-backed-aco-shader-compiler-on-by-default/
- DRM/GEM(2008)/TTM(2009): https://en.wikipedia.org/wiki/Direct_Rendering_Manager
- DXVK / VKD3D-Proton / Zink: https://en.wikipedia.org/wiki/DXVK · https://github.com/HansKristian-Work/vkd3d-proton
- 역사: DX8(2000)/GeForce3(2001)/HLSL(DX9 2002):
  https://www.tomshardware.com/pc-components/gpus/25-years-ago-today-microsoft-released-directx-8-and-changed-pc-graphics-forever-how-programmable-shaders-laid-the-groundwork-for-the-future-of-modern-gpu-rendering
- 통합 셰이더(DX10 2006/G80): https://grokipedia.com/page/Unified_shader_model (1차 교차확인됨)
- Mantle(2013, AMD+DICE→DX12/Vulkan 토대): https://en.wikipedia.org/wiki/Mantle_(API)
- 메시 셰이더(DX12 2019 프리뷰→Ultimate 2020 / Vulkan 2022):
  https://devblogs.microsoft.com/directx/coming-to-directx-12-mesh-shaders-and-amplification-shaders-reinventing-the-geometry-pipeline/

## 낮은 신뢰도/주의 (본문 반영)
- 셰이더 스터터/PSO 시간 수치는 케이스 의존 → "수십~수백 ms/케이스마다 다름"으로만.
- ACO "~2배 빠름/5–10%"는 Valve 측 주장·하드웨어 의존 → 조건부로.
- 메시 셰이더 도입은 DX12 2019 프리뷰 vs "DX12 Ultimate 2020 브랜딩" 구분.
- **DXBC ≠ LLVM 기반**(토큰 바이트코드), **DXIL = LLVM 3.7 비트코드** — 혼동 금지(본문 명시).
- Grokipedia(통합셰이더)는 1차(Wikipedia/Tom's)로 교차확인된 것만 채택.

## 데모 ↔ 사실
- `DriverStackPath`: 앱→UMD→KMD→GPU 레이어 역할(클릭)·두꺼운/얇은 토글로 무거운 일 이동.
- `ShaderCompilePipeline`: 소스→IR→ISA, 오프라인/런타임 경계, PSO 캐시 적중/미스→히치.
- `DriverEvolutionTimeline`: 고정기능→셰이더→통합+WDDM→두꺼운→explicit→현대, 앱↔드라이버 분담.
