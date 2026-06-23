# Async Compute와 하드웨어 큐 — 출처와 검증 노트

집필·검수 시 사용한 1차/전문가 자료와, 본문 핵심 사실 ↔ 출처 대응.

## 핵심 사실 ↔ 출처

| 본문 주장 | 출처 | 비고 |
|---|---|---|
| async의 본질 = 빈 유닛(점유율)을 다른 작업으로 메움, 자원 안 겹칠 때 이득 | AMD GPUOpen RDNA Perf Guide, Concurrent Execution | 확정 |
| API가 graphics/compute/copy 큐 노출, copy=전용 DMA | GPUOpen Concurrent Execution, GCN(Wikipedia) | 확정 |
| graphics·compute가 같은 CU/SM 풀 공유 → 빈 ALU 채움 | GPUOpen RDNA Perf Guide, Chips and Cheese GCN | 확정 |
| AMD ACE = Asynchronous Compute Engine, compute 큐 담당 | GCN(Wikipedia), Chips and Cheese | 확정 |
| GCN 3세대+ : CU 스케줄러 + draw/compute 큐 스케줄러 분리 | GCN(Wikipedia) | 확정 |
| Hawaii(R9 290X) ACE 8개, 각 8큐 | GCN(Wikipedia) | 확정(특정 SKU) |
| GCN/RDNA에 dedicated copy 큐 | GCN(Wikipedia), GPUOpen | 확정 |
| 배리어 없으면 graphics 뒤 compute(혹은 반대) 오버랩 가능 | GPUOpen RDNA Perf Guide | 확정 |
| 그림자 패스 중 compute 오버랩(그림자는 ROP-bound, ALU 한가) | 통념/전문가 분석(흔한 패턴) | 일반론, 본문 대표 예시 |
| 큐 간 의존성: semaphore/fence(순서) + barrier(메모리 가시성·레이아웃 전환) | D3D12/Vulkan 동기화 모델 (command-queues 챕터와 일관) | 확정 |
| 자원 경합 시 오히려 느려질 수 있음 | GPUOpen Perf Guide(주의 문구) | 확정 |

## 마케팅/미확정 (본문에서 완화·플래그)

- **NVIDIA의 동시 실행 동작이 세대(Maxwell→Pascal 등)마다 다름** → 본문에서 "정밀 동작은 아키텍처별,
  단정 안 함"으로 명시. IHV 자료/제3자 분석마다 해석이 갈림. **낮은 신뢰도/주의.**
- 데모 타임라인 숫자(총 14 → 7 등)는 **도식용 대표값** — figcaption에 명시.
- ACE 개수는 SKU/세대마다 다름 → 본문 "보통 여러 개", 8개는 Hawaii 한정으로 귀속.

## 주요 URL

- https://gpuopen.com/learn/rdna-performance-guide/
- https://gpuopen.com/learn/concurrent-execution-asynchronous-queues/
- https://en.wikipedia.org/wiki/Graphics_Core_Next
- https://chipsandcheese.com/p/gcn-amds-gpu-architecture-modernization

## 검수 메모

- `QueueOverlap`: 막대 길이 합 동일·벽시계만 단축이라는 점(점유율 향상)을 figcaption에서 강조.
- `HardwareQueues`: graphics·compute가 CU 공유, copy는 별도 DMA 경로(VRAM/PCIe)로 분리 — 명세적.
- `BarrierHazard`: read-before-write 해저드와 semaphore/barrier 필요를 대조. D3D12/Vulkan 공통 모델.
