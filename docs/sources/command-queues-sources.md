# 출처 — command-queues ("명령 큐와 동기화")

이 챕터는 아래 1차/전문가 자료를 기준으로 작성·검증했다(소급 검수, 조사일 2026-06).
검증 방법 메모: `docs.vulkan.org`·`learn.microsoft.com`은 WebFetch가 403으로 자주 막혀,
(a) `KhronosGroup/Vulkan-Docs`·`MicrosoftDocs/win32` GitHub raw 미러와 (b) 검색 스니펫으로
canonical 원문 verbatim을 교차확인했다. 인용은 canonical URL 기준. 이 챕터는 기존
`gpu-cpu-conversation-sources.md`와 사실 다수를 공유하며, 여기서는 *동기화 primitive·배리어·
멀티 큐 오버랩*에 초점을 두어 추가 조사했다.

---

## 1. record → submit → execute 생명주기 · 제출은 즉시 반환 · CB 상태 머신

- **Vulkan spec — Command Buffers** — https://docs.vulkan.org/spec/latest/chapters/cmdbuffers.html
  - Initial → Recording(`vkBeginCommandBuffer`) → Executable(`vkEndCommandBuffer`) → Pending(큐
    제출) → (완료 시) Executable로 복귀. *"A command buffer in the pending state must not be
    modified by the application, as it may be executing on the device."*
  - **주의:** spec에는 **Invalid**라는 5번째 상태도 있다(본문은 핵심 4단계만 제시 — 단순화).
- **D3D12 — ExecuteCommandLists / Executing and Synchronizing Command Lists** —
  https://learn.microsoft.com/en-us/windows/win32/api/d3d12/nf-d3d12-id3d12commandqueue-executecommandlists
  https://learn.microsoft.com/en-us/windows/win32/direct3d12/executing-and-synchronizing-command-lists
  - 제출은 CPU 타임라인에서 비동기 — GPU 완료를 기다리지 않음.
  - **검증사실 ↔ 본문:** §1 record/submit/execute, "제출은 즉시 반환". **확인.**

## 2. 같은 큐 = 제출 순서로 시작·완료 무순서 · 다른 큐 = 세마포어 없이는 무순서

- **Vulkan Guide — Queues** — https://docs.vulkan.org/guide/latest/queues.html
  - *"Command buffers submitted to a `VkQueue` start in order, but are allowed to proceed
    independently after that and complete out of order."*
  - *"Command buffers submitted to different queues are unordered relative to each other unless
    you explicitly synchronize them with a `VkSemaphore`."*
  - **검증사실 ↔ 본문:** §1 "제출 순서대로 시작 … 끝나는 순서까지 보장되진 않음"(§4 RAW). **확인.**

## 3. 큐 종류·능력 · D3D12 list type · copy = 전용 DMA(물리 병렬)

- **D3D12 — Multi-engine synchronization** —
  https://learn.microsoft.com/en-us/windows/win32/direct3d12/user-mode-heap-synchronization
  - *"The 3D queue can drive all three GPU engines; the compute queue can drive the compute and
    copy engines; and the copy queue simply the copy engine."*
  - *"Each of these engines can execute commands in parallel with each other."* → copy 전용 DMA로 병렬.
  - `D3D12_COMMAND_LIST_TYPE` DIRECT/COMPUTE/COPY.
- **Vulkan Guide — Queues**(위 #2 동일): queue family capability 비트.
  - **주의/정밀:** Vulkan은 GRAPHICS/COMPUTE family면 `VK_QUEUE_TRANSFER_BIT`가 없어도 transfer를
    **보장**한다. 단 "그래픽스 = 그리기+컴퓨트+복사"는 *하드웨어 통례*이지 Vulkan 보장은 아니다
    (그래픽스 family가 compute를 광고하지 않을 수도 있음). D3D12 DIRECT가 셋 다 구동은 위 인용대로 정확.
  - **검증사실 ↔ 본문:** §1 큐 종류 표. **확인(D3D12는 정확, Vulkan은 통례로 읽으면 됨).**

## 4. 펜스 = (D3D12) 단조 64비트 정수 · CPU 대기/GPU 시그널 · 할당자 재사용은 실행 완료 후

- **D3D12 — ID3D12Fence / Signal** —
  https://learn.microsoft.com/en-us/windows/win32/direct3d12/user-mode-heap-synchronization
  https://learn.microsoft.com/en-us/windows/win32/api/d3d12/nf-d3d12-id3d12commandqueue-signal
  - *"A fence is a synchronization construct controlled by a UINT64 value."* GPU는
    `ID3D12CommandQueue::Signal`로, CPU는 `SetEventOnCompletion` + `WaitForSingleObject`로 대기.
- **D3D12 — ID3D12CommandAllocator::Reset** —
  https://learn.microsoft.com/en-us/windows/win32/api/d3d12/nf-d3d12-id3d12commandallocator-reset
  - *"Command list allocators can only be reset when the associated command lists have finished
    execution on the GPU; apps should use fences to determine GPU execution progress."*
- **⚠️ 정정 반영(본문 수정함):** "펜스 = 단조 증가 정수"는 **D3D12 펜스 / Vulkan timeline
  세마포어**의 모델이다. Vulkan의 고전적 `VkFence`는 정수가 아니라 **이진(signaled/unsignaled)**
  상태만 갖는다. (또한 D3D12 펜스 값은 API상 "rewound" 가능 — 단조 증가는 *사용 관례*.)
  → §2 본문에 "D3D12 `ID3D12Fence`는 64비트 정수, Vulkan `VkFence`는 이진" 명시 추가. **수정 완료.**
  - **검증사실 ↔ 본문:** §2 펜스, 할당자 재사용 조건. **확인.**

## 5. frames in flight · N=2 이유 · 레이턴시 ≈ N·frame · N=1 핑퐁

- **Vulkan Tutorial — Frames in flight** —
  https://docs.vulkan.org/tutorial/latest/03_Drawing_a_triangle/03_Drawing/03_Frames_in_flight.html
  - N=2: *"so that the CPU and the GPU can be working on their own tasks at the same time."*
    N이 커지면 CPU가 GPU보다 앞서 달려 레이턴시가 늘어남 → 레이턴시 ≈ N·frame_time 지지.
- **N=1에서 처리량 "반토막":** primary 출처가 *수치로* 보장하지는 않음. CPU 시간 ≈ GPU 시간이고
  완벽 핑퐁(다른 오버랩 없음)이라는 **이상화 가정**에서만 정확한 1차 모델(N=1: ≈ CPU+GPU,
  파이프라인 시 ≈ max(CPU,GPU), CPU=GPU일 때 정확히 2×). 실제는 부분 오버랩·present/vsync로
  보통 2배 미만.
  - **본문 처리:** §2가 이미 "CPU와 GPU가 비슷한 시간을 쓸 때 … 둘 중 하나가 훨씬 길면 손해는
    그보다 작습니다"로 **이상화 가정을 명시** → 적절. (대표·이상화 모델로 읽으면 됨.) **확인(조건부).**

## 6. 세마포어 = 큐↔큐 · 이진 1회용 · timeline = 단조 64비트 superset · D3D12 펜스 = timeline 모델

- **Khronos Blog — Vulkan Timeline Semaphores** — https://www.khronos.org/blog/vulkan-timeline-semaphores
  - *"...a superset of both the original VkSemaphore and VkFence primitives..."* / *"a
    monotonically increasing 64-bit integer value … omnidirectional synchronization between device
    and host using a single primitive."* Vulkan 1.2 core(`VK_KHR_timeline_semaphore`).
  - 이진 세마포어: 큐↔큐(GPU↔GPU), host 대기 불가, 대기가 소비 시 리셋. host wait/signal은
    **timeline만** 가능(`vkWaitSemaphores`/`vkSignalSemaphore`).
  - **검증사실 ↔ 본문:** §3 이진 vs timeline, "D3D12 펜스도 타임라인 모델이라 큐 동기화에 같은
    펜스를 씀". **확인.**

## 7. 해저드 RAW/WAR/WAW · 배리어 = execution + memory dependency · available/visible · 레이아웃 전이 · 앱 책임

- **Vulkan spec — Synchronization** — https://docs.vulkan.org/spec/latest/chapters/synchronization.html
  - *"Availability operations cause the values generated by specified memory write accesses to
    become available to a memory domain…"* (= src 쓰기 flush)
  - *"Visibility operations cause values available to a memory domain to become visible to
    specified memory accesses."* (= dst 읽기 invalidate)
  - *"A memory dependency is an execution dependency which includes availability and visibility
    operations…"*
  - *"Synchronization of access to resources is primarily the responsibility of the application
    in Vulkan."*
- **D3D12 — 드라이버는 상태를 자동 전이하지 않음** —
  https://devblogs.microsoft.com/directx/a-look-inside-d3d12-resource-state-barriers/
  https://learn.microsoft.com/en-us/windows/win32/direct3d12/using-resource-barriers-to-synchronize-resource-states-in-direct3d-12
  - *"Neither the D3D12 runtime or drivers actively do anything to promote or decay a resource state."*
- **레이아웃 전이 예시** — https://docs.vulkan.org/guide/latest/synchronization_examples.html
  - COLOR_ATTACHMENT_OPTIMAL → SHADER_READ_ONLY_OPTIMAL 표준 패턴.
  - **보강 가능:** WAR은 execution-only dependency로 충분, RAW/WAW는 memory dependency 필요
    (RasterGrid). D3D12 **Enhanced Barriers**(sync2 유사)는 현대 API
    — 본문은 legacy `ResourceBarrier` 관점이므로 §7에서 포인터만.
  - **검증사실 ↔ 본문:** §4 해저드/배리어/available·visible/레이아웃/앱 책임. **확인(용어 정확).**

## 8. 배리어 = 스코프 · src/dst 의미 · BOTTOM→TOP = 전체 직렬화

- **Vulkan spec — Synchronization** + examples wiki / pipeline_barriers 샘플 —
  https://github.com/KhronosGroup/Vulkan-Docs/wiki/Synchronization-Examples
  https://docs.vulkan.org/samples/latest/samples/performance/pipeline_barriers/README.html
  - 첫(src) 스코프 = 앞 명령들의 지정 스테이지, 둘째(dst) 스코프 = 뒤 명령들의 지정 스테이지.
  - `src = BOTTOM_OF_PIPE`(앞 작업 전부 완료) + `dst = TOP_OF_PIPE`(뒤 작업 전부 시작 차단)
    = 전체 직렬화. (역으로 src=TOP / dst=BOTTOM은 no-op이라 방향 혼동 주의.)
  - **검증사실 ↔ 본문:** §4 "배리어는 벽이 아니라 스코프", 과동기화 식, "전체 배리어". **확인.**

## 9. async 컴퓨트 오버랩 — 노는 ALU를 채움(문서화된 기법, 단 프로파일 필요)

- **AMD GPUOpen — Concurrent execution with asynchronous queues** / RDNA Performance Guide —
  https://gpuopen.com/learn/concurrent-execution-asynchronous-queues/
  https://gpuopen.com/learn/rdna-performance-guide/
- **NVIDIA — Advanced API Performance: Async Compute and Overlap** —
  https://developer.nvidia.com/blog/advanced-api-performance-async-compute-and-overlap/
  - 멀티 큐 오버랩이 GPU 활용률을 높임. 단 **best-case 기회**일 뿐 — 캐시/대역폭 경쟁,
    레지스터/LDS 압력으로 *역효과*도 가능(양쪽 IHV 모두 프로파일 강조).
  - **검증사실 ↔ 본문:** §5 오버랩 이득 vs 동기화 비용 — 본문이 이미 "마법이 아니라 거래"로
    조건부 서술 → 적절. **확인.**

## 10. Metal primitive · WebGPU 모델

- **Apple — MTLFence / MTLEvent / MTLSharedEvent** —
  https://developer.apple.com/documentation/metal/mtlfence (큐 내부 자원 의존) ·
  https://developer.apple.com/documentation/metal/mtlevent (단일 디바이스, 큐 간 timeline 값) ·
  https://developer.apple.com/documentation/metal/mtlsharedevent (CPU/멀티 디바이스/프로세스 간)
  - MTLFence: *"You cannot use a fence to synchronize … resources access by two command buffers
    running in parallel from separate queues; you need to use an MTLEvent."*
- **W3C — WebGPU** — https://www.w3.org/TR/webgpu/ + gpuweb explainer —
  https://gpuweb.github.io/gpuweb/explainer/
  - 단일 기본 큐(`device.queue`). 자원 전이 자동, 명시적 배리어/펜스/세마포어 미노출.
  - **검증사실 ↔ 본문:** §7 Metal/WebGPU. **확인.**

---

### 수정/플래그 요약

- **[수정함] §2 펜스:** "단조 정수"를 D3D12 펜스/Vulkan timeline로 한정, 고전 `VkFence`는 이진임을 명시.
- **[확인·적절] §2 N=1 "반토막":** 이상화 모델 — 본문이 이미 조건을 달아 둠.
- **[확인] 나머지(§1·§3·§4·§5·§7) 모두 1차/권위 자료로 확인.**
- **[보강 가능, 오류 아님]** WAR=execution-only, D3D12 Enhanced Barriers / Vulkan sync2는 §7
  포인터로만 — 본문 범위(legacy 모델) 유지.
