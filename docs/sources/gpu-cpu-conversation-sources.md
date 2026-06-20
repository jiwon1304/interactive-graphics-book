# 출처 — gpu-cpu-conversation ("CPU와 GPU의 대화 — 명령 버퍼와 비동기")

이 챕터는 아래 1차/전문가 자료를 기준으로 작성·검증했다. 검증 방법 메모: `docs.vulkan.org`·
`learn.microsoft.com`·`fgiesen.wordpress.com`은 직접 fetch가 403으로 막혀, (a) Khronos/Microsoft의
GitHub raw 미러(`KhronosGroup/Vulkan-Docs`, `KhronosGroup/Vulkan-Guide`, `MicrosoftDocs/win32`,
`MicrosoftDocs/windows-driver-docs`)에서 동일 원문을, (b) 검색 스니펫으로 canonical URL을 교차확인했다.
인용은 canonical URL 기준.

---

## 1. GPU는 별도의 비동기 프로세서 · ring buffer(CPU=write, GPU=read)

- **fgiesen, "A trip through the Graphics Pipeline 2011, part 2 — GPU memory architecture and the
  Command Processor"** — https://fgiesen.wordpress.com/2011/07/02/a-trip-through-the-graphics-pipeline-2011-part-2/
  - GPU는 메모리의 command buffer를 PCIe DMA로 받아 **command processor(CP)**로 소비한다.
  - 메인 command buffer는 보통 **작은 ring buffer**다: *"The main command buffer is usually a (quite
    small) ring buffer – the only thing that ever gets written there is system/initialization commands
    and calls to the 'real', meaty 3D command buffers."*
  - CP 구조: FIFO → 디코드 → 실행(2D/3D front-end/shader). 동기/대기 명령을 처리하는 블록(공개
    레지스터 보유)과 command buffer jump/call을 처리하는 블록이 있다.
  - **검증사실 ↔ 본문:** "write pointer(CPU)·read pointer(GPU)·둘의 간격 = GPU가 CPU보다 얼마나 뒤처짐"은
    위 인용을 토대로 한 **표준 합성 framing**(한 문장 verbatim은 아님). `CommandBufferRing` 위젯이 이를 도식화.

## 2. command buffer: 기록(record) → 나중에 소비(consume)

### Vulkan — "Command Buffers" 챕터
- https://docs.vulkan.org/spec/latest/chapters/cmdbuffers.html
  - 목적: *"Command buffers are objects used to record commands which can be subsequently submitted to a
    device queue for execution."*
  - command pool: *"Command pools ... allow the implementation to amortize the cost of resource creation
    across multiple command buffers."*
  - primary vs secondary: primary는 queue에 제출, secondary는 primary가 실행.
  - **lifecycle 상태** Initial → Recording(`vkBeginCommandBuffer`) → Executable(`vkEndCommandBuffer`) →
    Pending(queue submit) → (완료 시) Executable로 복귀 또는 ONE_TIME_SUBMIT면 Invalid.
    *"A command buffer in the pending state must not be modified by the application, as it may be executing
    on the device."*
  - 객체: `VkCommandBuffer`, `VkCommandPool`, `VkQueue`.

### D3D12 — "Executing and Synchronizing Command Lists"
- https://learn.microsoft.com/en-us/windows/win32/direct3d12/executing-and-synchronizing-command-lists
  - *"apps create command lists and bundles and then record sets of GPU commands. Command queues are used
    to submit command lists to be executed."*
  - `ExecuteCommandLists` 전에 `ID3D12GraphicsCommandList::Close`로 기록을 끝내야 함.
  - 객체: `ID3D12GraphicsCommandList`(기록), `ID3D12CommandAllocator`(backing 메모리),
    `ID3D12CommandQueue::ExecuteCommandLists`(제출).
- ExecuteCommandLists 레퍼런스: https://learn.microsoft.com/en-us/windows/win32/api/d3d12/nf-d3d12-id3d12commandqueue-executecommandlists
  - *"Submits an array of command lists for execution."* / 같은 큐 연속 제출의 순서 보장(A→B).

### D3D11 — immediate vs deferred
- https://learn.microsoft.com/en-us/windows/win32/direct3d11/overviews-direct3d-11-render-multi-thread-render
  - immediate: *"calling rendering APIs or commands from a device, which queues the commands in a buffer
    for execution on the GPU."*
  - deferred: *"Deferred rendering records graphics commands in a command buffer so that they can be
    played back at some other time"* — deferred context로 여러 스레드 동시 기록, command list 재생.

## 3. queue와 submission 순서

- **Vulkan Guide — Queues** https://docs.vulkan.org/guide/latest/queues.html
  - 같은 큐: *"Command buffers submitted to a VkQueue start in order, but are allowed to proceed
    independently after that and complete out of order."*
  - 다른 큐: *"Command buffers submitted to different queues are unordered relative to each other unless
    you explicitly synchronize them with a VkSemaphore."*
  - queue family bit: GRAPHICS(`vkCmdDraw*`)/COMPUTE(`vkCmdDispatch*`)/TRANSFER.
  - 하드웨어 매핑은 구현 정의: *"Some implementations will do scheduling at a kernel driver level before
    submitting work to the hardware."*
- **D3D12 큐 종류** — Multi-engine synchronization
  https://learn.microsoft.com/en-us/windows/win32/direct3d12/user-mode-heap-synchronization
  - *"The 3D queue can drive all three GPU engines; the compute queue can drive the compute and copy
    engines; and the copy queue simply the copy engine."* → `D3D12_COMMAND_LIST_TYPE` **Direct/Compute/Copy**.

## 4. frames in flight · CPU가 GPU보다 앞서 달림

- **Vulkan Tutorial — Frames in flight**
  https://docs.vulkan.org/tutorial/latest/03_Drawing_a_triangle/03_Drawing/03_Frames_in_flight.html
  - *"allow multiple frames to be in-flight at once ... allow the rendering of one frame to not interfere
    with the recording of the next."*
  - 자원 중복: *"Any resource that is accessed and modified during rendering must be duplicated. Thus, we
    need multiple command buffers, semaphores, and fences."*
  - 왜 2: *"We choose the number 2 because we don't want the CPU to get too far ahead of the GPU ... If
    the CPU finishes early, it will wait till the GPU finishes rendering before submitting more work."*
  - **대표값:** 보통 2~3 (double/triple buffering). `AsyncTimeline` 위젯이 F=1↔2↔3을 비교.

## 5. 동기화 primitive

### Fence (GPU→CPU, host가 대기)
- Vulkan Synchronization: https://docs.vulkan.org/spec/latest/chapters/synchronization.html
  - fence는 device 작업 완료를 host에 알림. `vkWaitForFences` 레퍼런스
    (https://www.khronos.org/registry/vulkan/specs/1.2-extensions/man/html/vkWaitForFences.html):
    *"vkWaitForFences will block and wait until the condition is satisfied or the timeout has expired."*
    / *"timeout is ... in units of nanoseconds."* / waitAll. 객체: `VkFence`, `vkResetFences`,
    `vkGetFenceStatus`. `vkQueueSubmit`의 fence 인자가 제출 작업 완료 시 signal.
- D3D12 — `ID3D12Fence`: https://learn.microsoft.com/en-us/windows/win32/direct3d12/user-mode-heap-synchronization
  - *"A fence is a synchronization construct controlled by a UINT64 value."*
  - CPU측 `ID3D12Fence::Signal`은 즉시, GPU측 `ID3D12CommandQueue::Signal`은 큐의 모든 작업 완료 후.
  - `SetEventOnCompletion`(값 도달 시 이벤트), `GetCompletedValue`(현재 값).

### Semaphore (GPU↔GPU / 큐 순서) — 짧게만
- Khronos blog, Timeline Semaphores: https://www.khronos.org/blog/vulkan-timeline-semaphores
  - binary semaphore는 큐 제출 간 GPU 작업 순서를 매기고 host는 대기 못 함. timeline semaphore
    (Vulkan 1.2 core)는 단조 증가 64-bit 정수 기반이라 **CPU도** wait/signal 가능.
  - **본문 구분:** fence = device→host(host가 block), binary semaphore = device→device 큐 순서.

## 6. 드라이버/OS 레이어가 있는 이유 · user-mode vs kernel-mode (WDDM 맛보기)

- **WDDM Architecture**
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/windows-vista-and-later-display-driver-model-architecture
  - 벤더가 **UMD**(user-mode display driver, DLL — Direct3D runtime가 로드)와 **KMD**(kernel-mode
    miniport)를 쌍으로 제공.
  - Dxgkrnl = 커널 그래픽스 서브시스템 코어, 서브컴포넌트로 **VidMm**(memory manager)·**VidSch**(scheduler).
  - UMD 예시 DLL `nvwgf2um.dll`(NVIDIA) — 벤더별, 대표 예시.
- **WDDM Operation Flow / Submitting a Command Buffer**
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/windows-vista-and-later-display-driver-model-operation-flow
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/submitting-a-command-buffer
  - UMD가 command buffer를 채우고 가득 차거나 특정 함수 호출 시에만 runtime 콜백(`pfnRenderCb`)으로 제출.
  - Dxgkrnl이 KMD의 `DxgkDdiRender`로 command buffer를 검증해 하드웨어 포맷 DMA buffer 생성,
    `DxgkDdiSubmitCommand`로 GPU에 큐잉.
- **GPU Virtual Memory in WDDM 2.0**
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/gpu-virtual-memory-in-wddm-2-0
  - *"The UMD generates command buffers directly from user mode and uses new services to submit those
    commands to the kernel."* 프로세스별 GPU 가상주소 공간 → VidMm이 매 buffer를 patch할 필요 감소.
- **왜 분리:** kernel 컴포넌트(Dxgkrnl+KMD)는 공유 GPU를 프로세스 간 중재(VidMm/VidSch)하고 메모리
  보호를 담당하는 최소 신뢰 코드. UMD는 앱 프로세스에서 돌아 크래시해도 그 앱만 죽는다.

## 7. 대표 수치 (전부 order-of-magnitude · spec 보장 아님)

- **syscall(user→kernel 전환) 비용:**
  - gms.tf, "On the Costs of Syscalls" https://gms.tf/on-the-costs-of-syscalls.html — *"User-kernel mode
    switches cost in the order of a few hundred nanoseconds."*
  - arXiv 2406.07429 https://arxiv.org/pdf/2406.07429 — 완화책 끄면 ~46.4 ns latency.
  - **본문 요지:** 한 번의 전환은 수십~수백 ns. 개별로는 작지만 프레임당 수천 draw에 곱해지면 드라이버가
    command를 buffer에 모아 제출 때 **한 번만** 커널로 내려가는 이유가 된다. (대표값으로 명시.)
- **command/ring buffer 크기:** fgiesen — 메인 ring은 "quite small". portable spec 크기 없음. 앱 command
  buffer는 씬 복잡도에 따라 KB~MB. 특정 수치는 대표값.
- **frames in flight:** 보통 2~3.

---

### 플래그(불확실/대표값)
- Topic 1의 "write/read pointer gap = GPU lag" 해석은 fgiesen 인용 기반 표준 합성.
- Topic 7 수치는 전부 대표·차수.
- `nvwgf2um.dll`은 벤더별 예시 파일명.
