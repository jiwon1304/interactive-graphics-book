# (출처 노트) 드로우 콜의 일생 — Draw 한 번이 GPU에 닿기까지

> `draw-call-journey` 챕터(그래픽스 드라이버 5부작 3편)의 1차 출처. 집필·검수 에이전트는 이 내용을
> 기준으로 작성·검증한다. 1편(`gpu-cpu-conversation`)·2편(`wddm-graphics-stack`)을 전제로 하므로,
> WDDM 레이어/UMD/KMD/residency/GPUVA의 *기본 사실*은 그 두 챕터 및 `directx-driver-internals-sources.md`
> 와 공유한다. 여기서는 **한 Draw의 경로 / 제출(submission) / Vulkan 기록 모델**에 집중해 추가 조사했다.
> 조사일: 2026-06. (learn.microsoft.com이 WebFetch 403을 자주 반환 → 일부는 검색 스니펫으로 교차확인.)

## 1차 출처 (공식)

- **User-Mode Work Submission** — Microsoft Learn
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/user-mode-work-submission
- **D3DKMTSubmitCommand** (function) — Microsoft Learn / windows-driver-docs-ddi
  https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dkmthk/nf-d3dkmthk-d3dkmtsubmitcommand
  https://github.com/MicrosoftDocs/windows-driver-docs-ddi/blob/staging/wdk-ddi-src/content/d3dkmthk/nf-d3dkmthk-d3dkmtsubmitcommand.md
- **_D3DKMT_SUBMITCOMMAND** (struct) — Microsoft Learn
  https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dkmthk/ns-d3dkmthk-_d3dkmt_submitcommand
- **PFND3DDDI_SUBMITCOMMANDCB** (UMD callback) — Microsoft Learn
  https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dumddi/nc-d3dumddi-pfnd3dddi_submitcommandcb
- **GPU Virtual Memory in WDDM 2.0** / **Driver residency in WDDM 2.0**
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/gpu-virtual-memory-in-wddm-2-0
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/driver-residency-in-wddm-2-0
- **Vulkan spec — Command Buffers** (기록 state machine, vkCmdDraw=Action command)
  https://docs.vulkan.org/spec/latest/chapters/cmdbuffers.html
- **vkQueueSubmit** (man page; 배치 제출, "high overhead" 권고)
  https://www.khronos.org/registry/vulkan/specs/1.1-extensions/man/html/vkQueueSubmit.html
- **DirectX-Specs — D3D12 CPU Efficiency**
  https://microsoft.github.io/DirectX-Specs/d3d/CPUEfficiency.html
  https://github.com/microsoft/DirectX-Specs/blob/master/d3d/CPUEfficiency.md
- **DirectX-Specs — D3D12 Runtime Bypass**
  https://microsoft.github.io/DirectX-Specs/d3d/D3D12RuntimeBypass.html

## 분석/전문가 자료 (보조)

- fgiesen — *A trip through the Graphics Pipeline 2011, Part 2*(UMD가 command buffer를 만들고,
  꽉 차거나 flush 시 kernel로 batch 제출; per-draw 변환은 UMD에 있음). 본문 인용은 일반 요약.
  https://fgiesen.wordpress.com/2011/07/02/a-trip-through-the-graphics-pipeline-2011-part-2/
- Vulkan Guide — *Executing Vulkan Commands*(record→submit 흐름)
  https://vkguide.dev/docs/new_chapter_1/vulkan_command_flow/

## 검증된 핵심 사실 (챕터 주장 ↔ 출처)

1. **제출 = user→kernel 전환은 제출 단위, draw 단위가 아니다.** UMD가 command/DMA buffer를
   *user 모드에서 직접* 만들고, 제출 시에만 `D3DKMTSubmitCommand`로 graphics kernel(Dxgkrnl)에 넘긴다.
   "D3DKMTSubmitCommand is used to submit command buffers on contexts that support GPU virtual
   addressing. These contexts generate commands directly from user mode, manage their own command
   buffer pool and don't make use of the allocation or patch location list." / "These commands are
   generated completely in user-mode and are merely passed to the graphics driver through the graphics
   kernel subsystem." (User-Mode Work Submission / D3DKMTSubmitCommand)
   → 챕터: per-draw(user CPU)와 제출 단위(kernel)의 분리, 분할 상환의 핵심 근거.

2. **D3DKMTSubmitCommand는 GPUVA 컨텍스트 전용이고, 레거시 patch 모드는 옛 Render를 쓴다.**
   "This function replaces the old Render function for such contexts ... Contexts that operate in
   legacy patch mode must continue to use the old Render function." 또 GPUVA 컨텍스트라도 UMD는
   primary(화면 출력 대상) write allocation 목록은 여전히 만든다(flip 동기화용). (D3DKMTSubmitCommand)
   → 챕터: 2편의 WDDM 2.0 GPUVA를 회수, "patch list 없음, residency만"을 제출 함수 수준에서 확인.

3. **private driver data buffer.** DMA buffer를 UMD가 그대로 만들어 GPU에 넘기므로, KMD에 줄
   부가 정보는 별도 private driver data buffer로 함께 보낸다. (User-Mode Work Submission /
   _D3DKMT_SUBMITCOMMAND의 pPrivateDriverData) → 챕터에서는 깊게 다루지 않고 1문장만.

4. **residency는 제출 시 보장.** GPUVA에서 UMD는 allocation/patch list 대신 per-device residency
   list를 관리하고, VidMM이 command buffer 실행 전에 참조 allocation을 resident로 만든다(필요 시
   page-in). (Driver residency in WDDM 2.0 / GPU Virtual Memory in WDDM 2.0 — 2편·directx 출처와 공유)
   → 챕터: 제출 시 kernel 측 단계로 residency 표시.

5. **Vulkan: vkCmd*는 VkCommandBuffer에 *직접 기록*된다.** command buffer는 Initial→Recording
   (`vkBeginCommandBuffer`)→Executable(`vkEndCommandBuffer`) state machine을 거치고, `vkCmdDraw`는
   "Action Command"로 그리기를 기록한다. 즉 D3D11 immediate처럼 *draw마다 드라이버가 즉시 변환*하지
   않고, 앱이 기록 시점에 명령을 버퍼에 적어 둔다(D3D12 command list에 가까움). (Vulkan spec —
   Command Buffers)

6. **Vulkan 제출은 배치, 고비용.** `vkQueueSubmit`은 여러 command buffer를 한 번에 제출한다.
   "Submission can be a high overhead operation, and applications should attempt to batch work
   together into as few calls to vkQueueSubmit or vkQueueSubmit2 as possible." 제출 시 command
   buffer는 executable→pending으로, 실행 완료 후 다시 executable로 돌아간다. (vkQueueSubmit)
   → 챕터: RecordVsSubmit 위젯과 "제출 횟수를 줄여라"의 근거. D3D의 user→kernel 전환과 같은 성격.

7. **D3D12: per-draw 비용을 생성 시점/앱으로 옮겨 줄인다.** "execution-time processing is generally
   less than 10% of overall command list CPU usage"(=대부분의 CPU 비용은 *제출*이 아니라 *기록*에
   있다). PSO는 "drivers to perform as much pre-processing of hardware commands as possible"를 생성
   시점에 하게 하고, bundle은 "The CPU cost of a Bundle execution must not vary with the number of
   draw calls in the Bundle." 목표는 D3D11 대비 렌더링 CPU를 "order of magnitude" 줄이는 것.
   (DirectX-Specs CPU Efficiency)
   → 챕터: DrawCostBreakdown의 per-draw 범주 + "기록이 비용의 대부분"이라는 서술.

8. **D3D12 Runtime Bypass**: runtime 자체의 오버헤드까지 줄이려 앱→UMD 직접 경로를 제공. "save
   around 5% of CPU time for heavy D3D12 API usage workloads when measuring command list recording
   time." (DirectX-Specs D3D12 Runtime Bypass) → 챕터에서는 "runtime도 얇게" 한 문장 포인터로만.

## 수치 정책 (★)
- DrawCostBreakdown / RecordVsSubmit의 ns·µs·횟수는 **특정 드라이버 측정값이 아니라 구성비·기울기·
  분할상환을 보이기 위한 "도식용 대표값"**이다(챕터 본문에 명시). 절대값이 아니라 관계가 요점.
- directx-driver-internals의 DrawCallCost와 같은 대표 차수(검증/상태·hazard/디스크립터/제출 ns/draw)를
  재사용·재구성한다. 출처상 확정된 절대 ns는 없음(directx 출처 노트 #6과 동일 주의).

## 미해결 / 주의
- learn.microsoft.com WebFetch 403 → 직접 인용은 검색 스니펫 기반. 후속 검수자는 원문 확인 권장.
- 상태/PSO 변환의 *내용*과 D3D11 immediate vs D3D12/Vulkan 기록의 *깊은 대비*는 4·5편으로 미룬다
  (이 챕터는 "한 Draw가 GPU에 닿는 경로"와 "기록 vs 제출"에 한정).
