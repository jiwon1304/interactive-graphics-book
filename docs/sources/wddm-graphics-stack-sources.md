# (출처 노트) Windows 그래픽스 스택 — WDDM: runtime·UMD·KMD

> `wddm-graphics-stack` 챕터의 1차 출처. "그래픽스 드라이버" 5부작 2편.
> 집필·검수 에이전트는 이 내용을 기준으로 작성·검증한다. 핵심 주장은 아래 공식 문서
> (Microsoft Learn / Khronos Vulkan-Loader / Vulkan 사양)로 뒷받침된다.
> 조사일: 2026-06. learn.microsoft.com이 WebFetch 403을 내는 경우가 있어, 같은 문서의
> **공식 GitHub 미러**(`MicrosoftDocs/windows-driver-docs`, raw markdown)에서 verbatim을 확보했다.
> (1편 `directx-driver-internals` 의 출처노트를 재사용·확장한 것 — 세대 구분 사실을 더 깊게 검증.)

## 1차 출처 (공식)

- **WDDM Architecture** — Microsoft Learn
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/windows-vista-and-later-display-driver-model-architecture
  (미러: https://github.com/MicrosoftDocs/windows-driver-docs/blob/staging/windows-driver-docs-pr/display/windows-vista-and-later-display-driver-model-architecture.md)
- **Video Memory Management and GPU Scheduling** (VidMm/VidSch)
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/video-memory-management-and-gpu-scheduling
- **GPU Virtual Memory in WDDM 2.0**
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/gpu-virtual-memory-in-wddm-2-0
  (미러: .../display/gpu-virtual-memory-in-wddm-2-0.md)
- **Driver residency in WDDM 2.0**
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/driver-residency-in-wddm-2-0
  (미러: .../display/driver-residency-in-wddm-2-0.md)
- **Residency overview**
  https://github.com/MicrosoftDocs/windows-driver-docs/blob/staging/windows-driver-docs-pr/display/residency-overview.md
- **GPU virtual address** (개요)
  https://github.com/MicrosoftDocs/windows-driver-docs/blob/staging/windows-driver-docs-pr/display/gpu-virtual-address.md
- **D3DKMTSubmitCommand** (GPUVA 모드 제출) / **D3DKMTRender** (legacy patch 모드 제출)
  https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dkmthk/nf-d3dkmthk-d3dkmtsubmitcommand
  https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dkmthk/nf-d3dkmthk-d3dkmtrender
- **DXGKDDI_SUBMITCOMMAND** (KMD 콜백) — paging operation은 hDevice=NULL
  https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dkmddi/nc-d3dkmddi-dxgkddi_submitcommand

### Vulkan (loader/ICD = UMD 상당, 메모리는 앱이 직접)

- **Architecture of the Vulkan Loader Interfaces** — Khronos Vulkan-Loader
  https://github.com/KhronosGroup/Vulkan-Loader/blob/main/docs/LoaderInterfaceArchitecture.md
- **Vulkan Memory Allocation** (사양: VkDeviceMemory)
  https://docs.vulkan.org/spec/latest/chapters/memory.html
- **vkAllocateMemory** (refpage)
  https://docs.vulkan.org/refpages/latest/refpages/source/vkAllocateMemory.html

## 검증된 핵심 사실 (챕터 주장 ↔ 출처, verbatim 인용 포함)

### A. 레이어 구성 (WDDM Architecture)
1. **Dxgkrnl**: "the core component of the Windows operating system's kernel-mode graphics
   subsystem. It facilitates communication between the operating system, the UMD, and the
   kernel-mode display miniport driver (KMD)." 하위 구성요소: display port driver, **VidMm**
   (memory manager), **VidSch**(scheduler). (WDDM Architecture / Video Memory Management)
2. **UMD**: "The UMD is a dynamic-link library (DLL) that the Direct3D runtime loads." → UMD는
   **애플리케이션 프로세스 주소공간**에서 도는 IHV DLL.
3. **D3D runtime**: "a user-mode component that provides an application API for applications" —
   인자/상태 검증 후 **DDI**로 UMD 호출. KMD: "communicates with Dxgkrnl and the graphics hardware."
4. **DDI 호출 예**(1편에서 검증·재사용): UMD `CreateResource` → runtime `pfnAllocateCb` →
   Dxgkrnl → KMD `DxgkDdiCreateAllocation`. (WDDM Architecture / DDI)

### B. VidMm / VidSch (Video Memory Management and GPU Scheduling)
5. VidMm = "system-supplied component within the DirectX Graphics Kernel (Dxgkrnl) that is
   responsible for managing a GPU's memory" (allocation/deallocation/residency/paging).
   VidSch = GPU scheduler; "schedules the validated work on the GPU through its video scheduler
   (VidSch)... queuing commands for hardware submission."

### C. 세대 구분 — WDDM 1.x physical+patch vs 2.0 GPUVA (★ GPU Virtual Memory in WDDM 2.0)
6. **WDDM 1.x (물리주소 + patch)**: "GPU engines were expected to reference memory through
   **segment physical addresses**. As segments were shared across applications and over-committed,
   resources got relocated through their lifetime and **their assigned physical addresses changed**."
   → 그래서 command buffer마다 allocation list + patch location list로 제출 전 주소를 patch.
   "This tracking and patching was expensive. It essentially imposed a scheduling model where the
   video memory manager (VidMm) had to inspect every packet before it could be submitted to an engine."
7. **WDDM 2.0 (GPUVA)**: "Each process gets assigned a unique GPU virtual address (GPUVA) space
   that every GPU context can execute in. An allocation created or opened by a process gets
   assigned a unique GPUVA within that process's GPU virtual address space. **This assigned GPUVA
   remains constant and unique for the lifetime of the allocation.**"
8. **UMD가 가상주소 직접 기록, patch list 안 만듦**: "The UMD generates command buffers directly
   from user mode and uses new services to submit those commands to the kernel. **The UMD doesn't
   generate allocation or patch location lists**, although it's still responsible for managing the
   residency of allocations."
   ⚠️ **세대 혼동 금지**: patch list는 pre-2.0의 산물. 2.0에선 사라짐. (1편 초안이 한 번 혼동했음.)

### D. residency (Driver residency in WDDM 2.0 / Residency overview)
9. **per-command-buffer → per-device**: "Residency is moved to an explicit list on the device
   instead of the per-command buffer list."
10. **VidMm 보장**: "The video memory manager (VidMm) ensures that all allocations on a particular
    device residency requirement list are resident before any contexts belonging to that device are
    scheduled for execution." → 즉 제출된 work가 GPU에서 돌기 전에 참조 allocation을 VRAM에 page-in.
11. **allocation list 제거의 부작용**: "With the allocation list going away, VidMm no longer has
    visibility into the allocations being referenced in a particular command buffer. As a result,
    VidMm is no longer in a position to track allocation usage or handle related synchronization.
    This responsibility now falls to the user-mode driver (UMD)." → UMD가 direct CPU access·renaming
    동기화까지 책임.

### E. 제출 경로 (D3DKMT)
12. **D3DKMTSubmitCommand**(GPUVA 모드): "submit command buffers on contexts that support GPU
    virtual addressing, which generate commands directly from user mode, manage their own command
    buffer pool and **don't make use of the allocation or patch location list**." 이전 **D3DKMTRender**
    는 "older function still used by contexts that operate in **legacy patch mode**." → 같은 커널
    제출 API가 두 시대를 그대로 보여줌.
13. **paging operation은 컨텍스트 없음**: "when the submission is for a paging operation, the
    DxgkDdiSubmitCommand function is called with NULL specified in the hDevice member." → page-in/out은
    시스템 작업으로 별도 처리.

### F. Vulkan = loader + ICD (Vulkan-Loader 문서)
14. **loader 위치**: "The ICD loader is a library that is placed between a Vulkan application and any
    number of Vulkan drivers... to support multiple drivers." 앱→loader→(layers)→**ICD**(=벤더 드라이버).
15. **trampoline/dispatch**: "the Vulkan calls are simple trampoline functions that jump to the
    appropriate dispatch table entry." loader는 .dll(Windows).
16. **Windows ICD 발견**: loader가 레지스트리
    `HKEY_LOCAL_MACHINE\SOFTWARE\Khronos\Vulkan\Drivers`(및 관련 키)를 스캔해 ICD JSON manifest →
    ICD DLL 로드.
17. **ICD = UMD 상당**: Windows에서 Vulkan ICD도 결국 같은 **Dxgkrnl/VidMm/VidSch/KMD** 커널 스택
    위에서 돈다(같은 D3DKMT* 제출·같은 GPUVA·residency). Vulkan에서 다른 점은 **메모리를 앱이 더 직접
    관리**한다는 것(아래 G).

### G. Vulkan 메모리 = 앱이 직접 (Vulkan 사양 memory chapter / vkAllocateMemory)
18. "A Vulkan device operates on data in device memory via memory objects represented by a
    **VkDeviceMemory** handle"; `vkAllocateMemory`로 앱이 직접 할당. heap/type은
    `vkGetPhysicalDeviceMemoryProperties`로 질의(DEVICE_LOCAL 등).
19. 권장: "allocate bigger chunks of memory and assign parts of them to particular resources" —
    `maxMemoryAllocationCount` 한계 때문(앱이 sub-allocator 운용). VkBuffer/VkImage는
    VkDeviceMemory에 **bind**해서 씀.
20. `VK_MEMORY_HEAP_DEVICE_LOCAL_BIT` 힙 + `pageableDeviceLocalMemory`(EXT) 시 device-local 메모리가
    host-local로 transparently 이동 가능 → residency/페이징은 Windows에선 결국 VidMm이 수행하지만
    *예산/배치 결정*을 앱이 쥔다는 점이 D3D11 자동 residency와 대비.

## 미해결 / 주의
- learn.microsoft.com WebFetch 403 → verbatim은 공식 GitHub 미러(staging) 기준. 후속 검수자는
  가능하면 learn 원문을 직접 대조.
- D3DKMT* 함수의 정확한 호출 시퀀스(예: D3DKMTCreateAllocation → D3DKMTMakeResident →
  D3DKMTSubmitCommand)는 도식에선 대표 흐름으로 단순화. 실제 시그니처는 d3dkmthk.h DDI 참조.
- 다음 편(3편, "드로우 콜의 일생")은 이 스택 위에서 한 Draw가 GPU에 닿는 시간선을 다룬다 — 본 챕터는
  "어떤 레이어가 무엇을 하나(정적 구조)"에 집중하고, 시간선은 그쪽으로 포인터.
