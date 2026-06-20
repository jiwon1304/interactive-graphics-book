# (출처 노트) 상태·셰이더·PSO — 드라이버가 하는 변환

> `pipeline-state-shaders` 챕터("그래픽스 드라이버" 5부작 4편)의 1차 출처. 집필·검수 에이전트는
> 이 내용을 기준으로 작성·검증한다. 모든 핵심 주장은 아래 공식 문서(Microsoft Learn /
> DirectX-Specs / Khronos / DXC GitHub)로 뒷받침된다. 조사일: 2026-06.
> (learn.microsoft.com / registry.khronos.org / docs.vulkan.org가 WebFetch 403을 내는 경우가
> 있어, 동일 내용을 GitHub 미러(KhronosGroup/Vulkan-Docs·Vulkan-Guide·Vulkan-Samples,
> microsoft/DirectXShaderCompiler)나 검색 스니펫으로 교차확인했다. 인용 URL은 정식 페이지로 표기.)

## 1차 출처 (공식)

### D3D12 / D3D11 / D3D10 / D3D9
- **Managing Graphics Pipeline State in Direct3D 12** — Microsoft Learn
  https://learn.microsoft.com/en-us/windows/win32/direct3d12/managing-graphics-pipeline-state-in-direct3d-12
- **Important Changes from Direct3D 11 to Direct3D 12** — Microsoft Learn
  https://learn.microsoft.com/en-us/windows/win32/direct3d12/important-changes-from-directx-11-to-directx-12
- **D3D12_GRAPHICS_PIPELINE_STATE_DESC** (PSO 필드 전체) — Microsoft Learn
  https://learn.microsoft.com/en-us/windows/win32/api/d3d12/ns-d3d12-d3d12_graphics_pipeline_state_desc
- **ID3D12Device::CreateGraphicsPipelineState / ID3D12PipelineState** — Microsoft Learn
  https://learn.microsoft.com/en-us/windows/win32/api/d3d12/nf-d3d12-id3d12device-creategraphicspipelinestate
- **State Objects (Direct3D 10)** (immutable state object 도입·이득) — Microsoft Learn
  https://learn.microsoft.com/en-us/windows/win32/direct3d10/d3d10-graphics-programming-guide-api-features-state-objects
- **CreateBlendState / CreateRasterizerState** (D3D11 state object 생성) — Microsoft Learn
  https://learn.microsoft.com/en-us/windows/win32/api/d3d11/nf-d3d11-id3d11device-createblendstate
- **Understand Direct3D 11.1 concepts** ("Important changes from Direct3D 9 to 11" — D3D9
  SetRenderState/SetSamplerState/SetTextureStageState 개별 setter) — Microsoft Learn
  https://learn.microsoft.com/en-us/windows/uwp/gaming/understand-direct3d-11-1-concepts
- **Root Signatures Overview** / **DirectX-Specs Resource Binding** — Microsoft
  https://learn.microsoft.com/en-us/windows/win32/direct3d12/root-signatures-overview
  https://microsoft.github.io/DirectX-Specs/d3d/ResourceBinding.html
- **Pipeline State Cache 샘플**(ID3D12PipelineLibrary) — Microsoft Learn
  https://learn.microsoft.com/en-us/samples/microsoft/directx-graphics-samples/d3d12-pipeline-state-cache-sample-win32/

### 셰이더 컴파일 (DXBC/DXIL/DXC)
- **DirectXShaderCompiler** (DXC = LLVM/Clang 기반, dxcompiler.dll) — GitHub
  https://github.com/microsoft/DirectXShaderCompiler
- **DXIL.rst** (DXIL = LLVM IR 파생, LLVM 3.7 bitcode subset, "IHV 드라이버 JIT 컴파일러와의 계약")
  https://github.com/microsoft/DirectXShaderCompiler/blob/main/docs/DXIL.rst
- **Porting shaders from FXC to DXC** (fxc→DXBC SM5.1, dxc→DXIL SM6.0+) — GitHub wiki
  https://github.com/microsoft/DirectXShaderCompiler/wiki/Porting-shaders-from-FXC-to-DXC
- **DirectXTK12 Wiki — PSOs, Shaders, and Signatures**
  https://github.com/microsoft/DirectXTK12/wiki/PSOs,-Shaders,-and-Signatures

### Vulkan / SPIR-V (Khronos)
- **VkGraphicsPipelineCreateInfo / vkCreateGraphicsPipelines / VkPipeline** — Vulkan spec
  https://registry.khronos.org/vulkan/specs/latest/man/html/VkGraphicsPipelineCreateInfo.html
- **VkPipelineRenderingCreateInfo** (dynamic rendering attachment 포맷) — Vulkan spec
  https://registry.khronos.org/vulkan/specs/latest/man/html/VkPipelineRenderingCreateInfo.html
- **VkPipelineLayoutCreateInfo** (= set layouts + push constant ranges) — Vulkan spec
  https://registry.khronos.org/vulkan/specs/latest/man/html/VkPipelineLayoutCreateInfo.html
- **VkDynamicState** (dynamic state, viewport/scissor with count) — Vulkan spec
  https://registry.khronos.org/vulkan/specs/latest/man/html/VkDynamicState.html
- **VkPipelineCache** — Vulkan spec
  https://registry.khronos.org/vulkan/specs/latest/man/html/VkPipelineCache.html
- **Vulkan-Guide — What is SPIR-V / Pipeline Cache / Push Constants** — Khronos GitHub
  https://github.com/KhronosGroup/Vulkan-Guide/blob/main/chapters/what_is_spirv.adoc
  https://github.com/KhronosGroup/Vulkan-Guide/blob/main/chapters/pipeline_cache.adoc
  https://docs.vulkan.org/guide/latest/push_constants.html
- **Vulkan-Samples — pipeline_cache** (24.4 ms cached vs 50.4 ms uncached) — Khronos GitHub
  https://github.com/KhronosGroup/Vulkan-Samples/blob/main/samples/performance/pipeline_cache/README.adoc
- **VK_EXT_graphics_pipeline_library** proposal (monolithic 느림 → 4-subset 분리 링크) — Khronos GitHub
  https://github.com/KhronosGroup/Vulkan-Docs/blob/main/proposals/VK_EXT_graphics_pipeline_library.adoc
- **SPIR-V 개요** ("graphical-shader stage·compute kernel용 바이너리 IR") — Khronos
  https://www.khronos.org/spirv/

### 분석/전문가 자료 (보조)
- Riccardo Loggini — *The D3D12 Pipeline State Object* / *The D3D12 Root Signature Object*
  https://logins.github.io/graphics/2020/04/12/DX12PipelineStateObject.html
- Mesa3D — *RADV* (SPIR-V → NIR → ACO → ISA 백엔드 파이프라인)
  https://docs.mesa3d.org/drivers/radv.html
- D3D12↔Vulkan 바인딩 매핑 글(root signature↔pipeline layout, table↔set, heap↔pool, root↔push)
  https://pikachuxxxx.github.io/graphics/root-signature

## 검증된 핵심 사실 (챕터 주장 ↔ 출처)

1. **PSO 필드 전체**: `D3D12_GRAPHICS_PIPELINE_STATE_DESC` = pRootSignature, VS/PS/DS/HS/GS,
   StreamOutput, BlendState, SampleMask, RasterizerState, DepthStencilState, InputLayout,
   IBStripCutValue, PrimitiveTopologyType, NumRenderTargets, RTVFormats[8], DSVFormat,
   SampleDesc, NodeMask, CachedPSO, Flags. (Learn — PSO desc 페이지)

2. **PSO 불변·생성 시 변환**: D3D12는 파이프라인 상태를 "immutable pipeline state object"로
   통합하고 "finalized upon creation, allowing hardware and drivers to immediately convert
   the PSO into whatever hardware native instructions and state are required." (Learn — Managing
   Graphics Pipeline State)

3. **DX11이 못 한 이유**: D3D11은 stage를 따로 설정해 "the display driver can't resolve issues
   of pipeline state until the state is finalized, which isn't until draw time." PSO로 묶으면
   "final compilation to GPU instructions could happen at a time that the app controlled."
   (Learn — Managing Graphics Pipeline State / Important Changes)

4. **D3D10 state object**: ID3D10/11 Blend/DepthStencil/Rasterizer/SamplerState, immutable
   ("once created, you cannot change them"), 이득 = "validating state at object creation time,
   caching of state objects in hardware, reducing state passed during state-setting (handle)."
   (Learn — State Objects D3D10)

5. **D3D9 모델**: "Direct3D 9 managed state settings with a large set of individual toggles
   set with the SetRenderState, SetSamplerState, and SetTextureStageState methods." draw-time
   validation은 §3의 "resolve until draw time" 서술로 뒷받침되는 **추론**(D3D9 페이지가 그
   정확한 용어를 쓰진 않음 — 챕터에선 메커니즘으로 설명, 용어는 일반 통용). (Learn — D3D11.1
   concepts + Managing Pipeline State)

6. **DXIL**: DXC = LLVM/Clang 기반; DXIL = "derived from LLVM IR", "encoded using a subset of
   LLVM IR bitcode format", LLVM 3.7 고정; DXIL = "IR producer와 **IHV driver JIT compilers**
   사이의 계약". (DXIL.rst). FXC→DXBC(SM5.1), DXC→DXIL(SM6.0+). (FXC→DXC wiki)

7. **SPIR-V 2단 컴파일**: 소스(GLSL/HLSL) → SPIR-V(offline, glslang/shaderc/dxc -spirv) →
   드라이버 JIT가 pipeline/shader module 생성 시 GPU ISA. SPIR-V = 바이너리 IR(khronos.org/spirv).
   RADV가 spirv_to_nir → ACO → ISA로 실증(Mesa3D RADV).

8. **VkPipeline = PSO 동형**: VkGraphicsPipelineCreateInfo가 stages/vertex input/input
   assembly/tessellation/viewport/rasterization/multisample/depth-stencil/color blend/dynamic
   state/layout/render pass(또는 VkPipelineRenderingCreateInfo로 attachment 포맷)을 묶음.
   vkCreateGraphicsPipelines. (Vulkan spec)

9. **pipeline cache**: ID3D12PipelineLibrary = PSO 디스크 캐시("avoid costly shader compilation
   during subsequent runs", "reduce rendering glitches caused by driver shader compilation").
   VkPipelineCache = 직렬화 가능, 재사용으로 컴파일 회피; Khronos 샘플 측정 24.4 ms(cached) /
   50.4 ms(uncached). (Learn 샘플 / Vulkan-Guide / Vulkan-Samples)

10. **dynamic state**: VkDynamicState에 든 상태는 파이프라인에서 빠지고 draw 시
    vkCmdSetViewport/Scissor 등으로 설정. extended dynamic state(WITH_COUNT 등). D3D12도
    viewport/scissor는 PSO 밖(RSSetViewports). (Vulkan spec VkDynamicState)

11. **바인딩 대응**: root signature(layout: root constant/root descriptor/descriptor table) +
    descriptor heap(CBV_SRV_UAV/SAMPLER, 실제 디스크립터) ↔ pipeline layout(set layouts + push
    constants) + descriptor set(pool에서 할당, vkUpdate/vkCmdBind) + descriptor pool. root
    constant ↔ push constant. (DirectX-Specs ResourceBinding / Vulkan spec / 매핑 글)

12. **graphics pipeline library**: monolithic 생성이 조합 폭발/느림 → 4-subset(vertex input /
    pre-rasterization shaders / fragment shader / fragment output) 분리 컴파일 후 링크,
    LINK_TIME_OPTIMIZATION으로 성능 회복. (VK_EXT_graphics_pipeline_library proposal)

## 미해결 / 주의
- learn.microsoft.com / registry.khronos.org 직접 fetch 403 → GitHub 미러·검색 스니펫으로 교차확인.
  후속 검수자는 가능하면 정식 페이지 원문 재확인.
- StateTranslationTiming 막대 높이는 도식용 상대값(특정 드라이버 측정 아님). 챕터 말미 주석 명시.
- 셰이더 컴파일 "수 ms~수백 ms"의 상한(수백 ms)은 산업/엔진 사례 기반의 흔한 framing이며 단일
  Microsoft 문장으로는 narrow하게만(글리치 감소) 뒷받침됨. 캐시 24.4/50.4 ms는 Khronos 샘플 수치.
- D3D9 "draw-time validation" 용어는 일반 통용 표현(메커니즘은 출처로 확실, 정확한 단어는 추론).
