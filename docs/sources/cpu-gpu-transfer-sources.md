# 출처 — cpu-gpu-transfer ("CPU↔GPU 데이터 전송 — PCIe·DMA·Resizable BAR")

리서치 에이전트가 웹 검색으로 수집·교차검증(≥2 출처). 대역폭은 PCIe 세대별로 귀속, pinned/pageable
절대값·ReBAR 게임 이득은 환경/마케팅 의존이라 방향성만 단정. (세션 중 WebFetch 403 → canonical URL +
검색 스니펫 교차확인.)

## 핵심 사실 ↔ 출처
- PCIe 세대 GT/s·128b/130b·x16 GB/s(3.0≈15.75 / 4.0≈31.5 / 5.0≈63, 방향당), 전이중:
  https://www.diskmfr.com/pcie-interface-bandwidth-speed-calculation/ ·
  https://www.lenovo.com/us/en/knowledgebase/pcie-x16-a-comprehensive-guide-to-highspeed-expansion-slots/
- DMA/copy engine, pinned 요구, pageable→임시 pinned 스테이징 복사, pinned 아껴쓰기:
  https://developer.nvidia.com/blog/how-optimize-data-transfers-cuda-cc/ ·
  https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/
- 전송 오버랩(pinned + non-default stream): https://developer.nvidia.com/blog/how-overlap-data-transfers-cuda-cc/
- BAR 256MB 제한·Resizable BAR/SAM 전체 노출: https://www.pcworld.com/article/394720/faster-gaming-frame-rates-for-free-resizable-bar-explained.html
- ReBAR 게임 이득 가변(독립 리뷰): https://www.techpowerup.com/review/amd-radeon-sam-smart-access-memory-performance/
- D3D12 힙 DEFAULT/UPLOAD/READBACK/GPU_UPLOAD(ReBAR 필수, 스테이징 제거, WC read 금지):
  https://microsoft.github.io/DirectX-Specs/d3d/D3D12GPUUploadHeaps.html · https://gpuopen.com/learn/using-d3d12-heap-type-gpu-upload/
- Vulkan 메모리 타입·256MB BAR·persistent map:
  https://gpuopen-librariesandsdks.github.io/VulkanMemoryAllocator/html/usage_patterns.html
- CUDA UVM page fault/마이그레이션(Pascal HW), APU UMA vs 이산 NUMA:
  https://developer.nvidia.com/blog/unified-memory-in-cuda-6/

## 낮은 신뢰도/주의 (본문 반영)
- pinned/pageable 절대 GB/s는 환경 의존 → "pinned>pageable(흔히 2배+), pinned는 PCIe 상한 근접"만.
- ReBAR 게임 FPS 이득은 평균 한 자릿수%·가변(마케팅 6~15% 톤다운). 진짜 가치는 스테이징 제거.
- PCIe5 x16 "63~64 GB/s" 병기. PCIe6은 GPU 미배포라 미기재.
- CPU-visible VRAM(GPU_UPLOAD/BAR)은 write-combined → CPU read 금물(본문 명시).

## 데모 ↔ 사실
- `TransferCalculator`: 크기÷대역폭, gen3/4/5·레인·pinned·16.6ms 예산선.
- `BARWindow`: 256MB 창 vs ReBAR 전체, GPU_UPLOAD/HOST_VISIBLE 활성.
