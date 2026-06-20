# (출처 노트) DX9 → DX11 → DX12, 그리고 Vulkan — 무엇이·왜 바뀌었나

> `dx-evolution-vulkan` 챕터(그래픽스 드라이버 5부작 중 5편, 종합/비교)의 1차 출처.
> 기존 `directx-driver-internals-sources.md`를 **흡수·확장**한 것이다(오케스트레이터가 기존 directx
> 챕터를 제거 예정). 모든 핵심 주장은 아래 공식 문서(Microsoft Learn / DirectX-Specs / Khronos Vulkan
> spec) 또는 인정받는 분석 자료로 뒷받침된다. 조사일: 2026-06.
> (WebFetch가 learn.microsoft.com을 403으로 막는 경우가 있어 일부는 검색 스니펫으로 교차확인.)

## 1차 출처 (공식)

### WDDM / DirectX (앞 1~4편에서 계승)
- **WDDM Architecture** — Microsoft Learn
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/windows-vista-and-later-display-driver-model-architecture
- **Video Memory Management and GPU Scheduling** (VidMm/VidSch)
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/video-memory-management-and-gpu-scheduling
- **GPU Virtual Memory in WDDM 2.0** / **Driver residency in WDDM 2.0**
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/gpu-virtual-memory-in-wddm-2-0
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/driver-residency-in-wddm-2-0
- **Introduction to Deferred Contexts** / **Supporting command lists**
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/introduction-to-deferred-contexts
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/supporting-command-lists
- **Vertex buffer renaming** (Map DISCARD)
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/vertex-buffer-renaming
- **DirectX-Specs**: ResourceBinding(root signature/descriptor heaps), D3D12 Performance/Runtime Bypass
  https://microsoft.github.io/DirectX-Specs/d3d/ResourceBinding.html
- **Direct3D 11 on 12 Updates** (DriverCommandLists 플래그 의미) — DirectX Developer Blog
  https://devblogs.microsoft.com/directx/direct3d-11-on-12-updates/

### Vulkan (5편에서 신규 추가)
- **vkCmdPipelineBarrier** / **vkCmdPipelineBarrier2** — Khronos Vulkan Documentation
  https://registry.khronos.org/vulkan/specs/latest/man/html/vkCmdPipelineBarrier.html
  https://docs.vulkan.org/refpages/latest/refpages/source/vkCmdPipelineBarrier2.html
- **Vulkan-Guide — Synchronization** (VkFence vs VkSemaphore)
  https://github.com/KhronosGroup/Vulkan-Guide/blob/main/chapters/synchronization.adoc
- **Vulkan Timeline Semaphores** — Khronos Blog
  https://www.khronos.org/blog/vulkan-timeline-semaphores
- **Using pipeline barriers efficiently** — Vulkan Documentation Project (samples)
  https://docs.vulkan.org/samples/latest/samples/performance/pipeline_barriers/README.html

### Mantle / 동기
- **Mantle (API)** — Wikipedia (AMD+DICE 2013, 저오버헤드, Microsoft와 명세 공유, Khronos 기증→Vulkan)
  https://en.wikipedia.org/wiki/Mantle_(API)
- **Vulkan** — Wikipedia (원저자 AMD·DICE = Mantle 설계, Khronos가 donated/derived)
  https://en.wikipedia.org/wiki/Vulkan

## 분석/전문가 자료 (보조)
- Riccardo Loggini — *The D3D12 Pipeline State Object* / *The D3D12 Root Signature Object*
  https://logins.github.io/graphics/2020/04/12/DX12PipelineStateObject.html
- Diligent Graphics — *D3D12 Performance*
  https://diligentgraphics.com/diligent-engine/architecture/d3d12/d3d12-performance/
- *The Missing Guide to Modern Graphics APIs — PSOs* — Clean Rinse
  https://blog.mecheye.net/2021/06/the-missing-guide-to-modern-graphics-apis-2-psos/
- *Comparing Vulkan and D3D12* — xeechou.net
  https://xeechou.net/posts/vulkan-vs-d3d12/
- vkd3d-proton Root Signatures(D3D12↔Vulkan 매핑 실증) — DeepWiki
  https://deepwiki.com/HansKristian-Work/vkd3d-proton

## 검증된 핵심 사실 (챕터 주장 ↔ 출처)

1. **draw call 비용은 user 모드 변환에 집중** — 커널 제출은 분할 상환. DX11 per-draw 수백 ns~수 µs.
   (DirectX-Specs D3D12 Performance / draw-call-journey 편 계승) — ⚠️ **ns 절대수치는 출처 미확정**,
   DrawCallCost 위젯은 "도식용 대표 차수"로 명시.

2. **상태 변환 시점 (세대별)**: DX9 draw-time validation → DX10/11 immutable state object →
   DX12 PSO(`CreatePipelineState`, 생성 시 ISA+상태 완전 컴파일) → Vulkan VkPipeline
   (`vkCreateGraphicsPipelines`, monolithic, 생성 시 컴파일). PSO와 VkPipeline은 같은 개념.
   (DirectX-Specs / Loggini / Clean Rinse "PSOs" / Comparing Vulkan and D3D12)

3. **hazard / 전이**: DX11 드라이버 자동(보수적 배리어, SRV/RTV 동시바인딩 자동 unbind) →
   DX12 `ResourceBarrier` 앱 명시 → Vulkan `vkCmdPipelineBarrier`(src/dstStageMask + memory barrier)
   앱 명시. sync2(Vk1.3)의 `vkCmdPipelineBarrier2`가 stage/access 정밀화. (Vulkan spec / samples)

4. **residency / 메모리**: DX9/11 VidMM 자동 페이지인/아웃 → DX12 `MakeResident`/`Evict` +
   `QueryVideoMemoryInfo` → Vulkan 앱이 `vkAllocateMemory`+`vkBindBufferMemory`로 직접 관리.
   DX11 `Map(WRITE_DISCARD)` renaming은 DX12/Vulkan에 없음(앱이 ring buffer+fence). (Driver residency
   / Vertex buffer renaming / Vulkan memory)

5. **스레딩**: DX9 단일(immediate) → DX11 immediate+deferred(드라이버 미지원 시 runtime 에뮬,
   `DriverCommandLists`) → DX12 N스레드(command allocator+command list)→Direct/Compute/Copy 큐 →
   Vulkan N스레드(VkCommandPool+VkCommandBuffer)→VkQueue(queue family). **command buffer는 자신이
   할당된 pool의 queue family에서만 제출 가능** (vkCmdPipelineBarrier man: "queue family index that
   was used to create the command pool ... must be equal"; stage mask는 그 queue family에 유효한
   것만). (Deferred Contexts / D3D11on12 blog / Vulkan spec)

6. **동기화 차이**: D3D12 `ID3D12Fence` 하나가 host 대기(SetEventOnCompletion)+GPU↔GPU 대기 모두.
   Vulkan은 분리 — **VkSemaphore = device queue 간(GPU↔GPU), VkFence = device→host(GPU→CPU)**.
   ("VkSemaphore allows ... synchronize operations across device queues, while VkFence facilitates
   device to host synchronization", Vulkan-Guide). **timeline semaphore(Vk1.2)** 가 둘을 포괄하는
   상위집합으로 통합 → 결국 DX12 통합 fence 모델로 수렴. (Khronos Timeline Semaphores 블로그)

7. **D3D12↔Vulkan 1:1 대응표** (D3d12VulkanMap 위젯):
   PSO↔VkPipeline / Root Signature↔VkPipelineLayout(+descriptor set layout) /
   Descriptor Heap↔VkDescriptorSet / Command List↔VkCommandBuffer / Command Allocator↔VkCommandPool /
   Command Queue↔VkQueue / Fence↔VkFence(+VkSemaphore) / ResourceBarrier↔vkCmdPipelineBarrier.
   ("VkPipeline is Vulkan's equivalent to D3D12's PSO"; "root signature ... equivalent to Vulkan's
   descriptor set layout and pipeline layout structures combined"; vkd3d-proton이 실제로 이 매핑으로
   D3D12를 Vulkan에 번역.) (Comparing Vulkan and D3D12 / vkd3d-proton / serverspace PSO 가이드)

8. **Mantle 동기/계보**: AMD+DICE 2013, DX11/OpenGL 저오버헤드 대안. draw call 개선이 CPU 병목
   완화. AMD가 Mantle 명세를 Microsoft와 공유(DX12 추동). 2015 공개개발 중단, Khronos 기증되어
   Vulkan의 출발점. (Wikipedia Mantle / Vulkan)

9. **셰이더 IR**: DXBC(`fxc`, DX9~11) / DXIL(`dxc`, DX12) / SPIR-V(Vulkan). UMD JIT가 ISA로 변환
   (DX11 셰이더 생성/첫 사용, DX12/Vulkan PSO·파이프라인 생성 시). ISA 변환이 생성 시점으로 통일.

## 미해결 / 주의
- learn.microsoft.com WebFetch 403 → 직접 인용은 검색 스니펫 기반. 후속 검수자는 가능하면 원문 확인.
- DrawCallCost ns 수치는 예시값(도식용 대표 차수). 실제 프로파일 인용으로 교체 가능하면 더 좋음.
- bare 슬러그 링크(`gpu-cpu-conversation`, `wddm-graphics-stack`, `draw-call-journey`,
  `pipeline-state-shaders`)는 1~4편 슬러그를 전제. 4편이 아직 등록 전이면 dead link가 될 수 있으니
  오케스트레이터가 5편 등록 시 함께 확인할 것.
- timeline semaphore가 fence를 "완전히 대체"한다고 과장하지 말 것 — spec은 "superset of both ...
  primitives"라고 표현(기능 포괄). 본문은 "포괄/수렴"으로만 서술함.
