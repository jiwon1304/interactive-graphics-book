# 출처 — gpu-scheduling-preemption ("GPU 스케줄링과 프리엠션 — 컨텍스트 전환과 TDR")

리서치 에이전트가 웹 검색으로 수집·교차검증. TDR 기본값(2초)은 복수 Microsoft 페이지로 확인.
(세션 중 WebFetch 403 → canonical URL + 검색 스니펫 교차확인.)

## 핵심 사실 ↔ 출처
- WDDM GPU 스케줄러(Dxgkrnl), CPU 기반→HAGS(GPU 스케줄러, WDDM 2.7), 프레임 버퍼링 지연:
  https://devblogs.microsoft.com/directx/hardware-accelerated-gpu-scheduling/
- 컨텍스트 전환: 레지스터·공유 메모리를 GPU DRAM에 스왑(비쌈), 경계에서만 가능:
  https://images.nvidia.com/content/pdf/tesla/whitepaper/pascal-architecture-whitepaper.pdf
- 그래픽스 프리엠션 granularity(DMA버퍼→프리미티브→삼각형→픽셀→셰이더):
  https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dkmdt/ne-d3dkmdt-_d3dkmdt_graphics_preemption_granularity
- 컴퓨트 granularity(DMA버퍼→디스패치→스레드그룹→스레드→셰이더):
  https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dkmdt/ne-d3dkmdt-_d3dkmdt_compute_preemption_granularity
- 긴 작업 프리엠션 못하면 TDR 직행(Win7 정책): https://learn.microsoft.com/en-us/windows-hardware/drivers/display/gpu-preemption
- Pascal pixel(graphics)/instruction(CUDA) 프리엠션, Maxwell draw-level: https://docs.nvidia.com/cuda/pascal-tuning-guide/index.html ·
  https://developer.nvidia.com/vrworks/headset/contextpriority
- **TDR TdrDelay 기본 2초**, 3단계, VIDEO_TDR_FAILURE 0x116:
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/timeout-detection-and-recovery ·
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/tdr-registry-keys
- device removed(HUNG/RESET/REMOVED), GetDeviceRemovedReason: https://learn.microsoft.com/en-us/windows/uwp/gaming/handling-device-lost-scenarios
- 청크 분할로 TDR 회피: https://dev.epicgames.com/documentation/en-us/unreal-engine/dealing-with-a-gpu-crash-when-using-unreal-engine
- D3D12 큐 우선순위(NORMAL/HIGH/GLOBAL_REALTIME), async compute, VR ATW:
  https://learn.microsoft.com/en-us/windows/win32/api/d3d12/ne-d3d12-d3d12_command_queue_priority

## 낮은 신뢰도/주의 (본문 반영)
- HAGS 성능 영향은 워크로드·드라이버 의존 → 구체 FPS 미인용("워크로드 의존").
- Pascal "DX12 compute=thread-level" 명시 출처 약함 → graphics=pixel/CUDA=instruction만 단정.
- AMD/Intel granularity 세부 매핑 약함 → WDDM 추상화 기준으로 서술.
- 0x116 / DXGI hex값은 검색 기반 → 정확 인용 시 winerror.h 재확인 권장.

## 데모 ↔ 사실
- `PreemptionTimeline`: granularity(거침↔세밀)에 따른 B의 끼어들기 지연.
- `TDRTimeline`: 단일 작업 vs 2초 TdrDelay, 청크 분할로 회피.
