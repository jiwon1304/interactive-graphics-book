# 출처 — io-mmio-dma ("장치 I/O — MMIO·포트 I/O·DMA")

리서치 에이전트가 웹 검색으로 수집·교차검증. Wikipedia(MMIO/PMIO, DMA) + 임베디드/OS 강의·분석 글
+ osdev 계열을 교차확인. (세션 중 일부 origin WebFetch 403 → 복수 검색 스니펫 교차확인.)

## 핵심 사실 ↔ 출처

- port-mapped I/O(PMIO/isolated I/O): 별도 주소 공간, x86는 `IN`/`OUT` 전용 명령. PC는 총
  65536개(0~0xFFFF)의 8-bit I/O port. IN/OUT은 EAX와 포트 사이로 1/2/4바이트 전송:
  https://en.wikipedia.org/wiki/Memory-mapped_I/O_and_port-mapped_I/O ·
  https://www.fpgakey.com/wiki/details/352
- memory-mapped I/O(MMIO): 장치 레지스터를 CPU 물리 주소 공간에 매핑, 일반 load/store(MOV 등)로 접근.
  I/O 주소 공간(64K)과 CPU 물리 주소 공간(예: 32-bit=4G)은 별개:
  https://en.wikipedia.org/wiki/Memory-mapped_I/O_and_port-mapped_I/O ·
  https://www.fpgakey.com/wiki/details/352 · https://samkhn.github.io/posts/mmio.html
- MMIO 영역은 **uncacheable**여야 함: 장치 레지스터는 읽기/쓰기에 side effect가 있고 값이 장치에 의해
  바뀌므로 캐시하면 안 됨(VGA 프레임버퍼 등 특수 예외 제외):
  https://en.wikipedia.org/wiki/Memory-mapped_I/O_and_port-mapped_I/O · https://www.fpgakey.com/wiki/details/352
- 장치 디코딩: 각 장치가 주소 버스를 감시(monitor)하다 자기에게 할당된 주소 접근에 반응:
  https://en.wikipedia.org/wiki/Memory-mapped_I/O_and_port-mapped_I/O
- 장치 레지스터: status/command/data 레지스터. programmed I/O는 표준 메모리 명령(MMIO) 또는 IN/OUT(PMIO):
  https://en.wikipedia.org/wiki/Memory-mapped_I/O_and_port-mapped_I/O
- PIO(polling): CPU가 status를 계속 읽으며 busy-wait. interrupt 기반: 장치가 준비되면 IRQ로 알림:
  https://en.wikipedia.org/wiki/Memory-mapped_I/O_and_port-mapped_I/O (개요) + DMA 글
- DMA: DMA controller(또는 bus-mastering 장치)가 메모리↔장치를 직접 전송, CPU 우회. 완료 시 CPU에
  완료 interrupt:
  https://en.wikipedia.org/wiki/Direct_memory_access · https://grokipedia.com/page/Direct_memory_access ·
  https://astralvx.com/dma-explained/
- PCIe 장치는 Bus Master로서 PCIe TLP(Memory Read/Write)를 생성해 host RAM과 직접 전송.
  완료는 MSI/MSI-X interrupt 또는 status 레지스터 갱신:
  https://yairgadelov.me/pcie-bar0-and-dma-explained-with-qemu/ ·
  https://en.wikipedia.org/wiki/Direct_memory_access
- DMA 캐시 일관성 문제: DMA가 RAM을 직접 쓰면 CPU 캐시의 stale 사본과 불일치. coherent 플랫폼은 HW로,
  아니면 SW가 cache flush/invalidate(또는 DMA write buffer flush):
  https://en.wikipedia.org/wiki/Direct_memory_access
- scatter-gather DMA: descriptor table을 host memory에 두고 controller가 bus master로 읽어 자율 chaining,
  리스트 끝에서만 interrupt:
  https://en.wikipedia.org/wiki/Direct_memory_access · https://yairgadelov.me/pcie-bar0-and-dma-explained-with-qemu/
- IOMMU: 장치가 보는 I/O 가상 주소를 물리 주소로 변환, DMA를 격리·보호:
  https://en.wikipedia.org/wiki/Direct_memory_access

## 데모 ↔ 사실

- `AddressSpaceMap`: CPU 물리 주소 공간 안에 RAM + MMIO(장치 BAR) 영역 배치 + 별도 64K I/O port 공간.
- `PioVsDma`: 같은 블록 전송을 PIO(폴링: CPU busy 내내) vs DMA(CPU free + 완료 interrupt) 타임라인 비교.
- `DmaSequence`: ① CPU가 descriptor(src/dst/len) 작성·DMA 시작 → ② controller가 직접 전송 →
  ③ 완료 interrupt 한 컷.

## 낮은 신뢰도/주의 (본문 반영)

- "DMA controller"는 옛 ISA 8237 같은 중앙 컨트롤러 vs 현대 PCIe bus-mastering 장치 내장 엔진으로
  의미가 다름 → 본문에서 둘 다 언급하고 현대는 장치가 직접 bus master임을 명시.
- IN/OUT의 4바이트(EAX) 전송은 x86 한정. ARM 등은 PMIO가 없고 MMIO만 → "x86에서는"으로 한정.
- 캐시 일관성은 플랫폼 의존(x86은 대체로 DMA-coherent, 많은 ARM SoC는 비coherent) → "플랫폼에 따라"로 hedge.
- 타임라인의 구체 시간 비율은 도식용 대표값(실측 아님)으로 명시.
- IOMMU는 한 줄만(상세는 범위 밖). PCIe DMA의 GPU 사례는 cpu-gpu-transfer로 cross-link.
</content>
