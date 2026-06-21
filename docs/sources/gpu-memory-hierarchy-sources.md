# 출처 — gpu-memory-hierarchy ("GPU 메모리 계층과 합치기")

리서치 에이전트가 웹 검색으로 수집·교차검증한 자료 기반. 다툼 소지 수치는 ≥2 출처로 교차확인하고
아키텍처를 명시했다. (해당 세션에서 WebFetch가 403을 반환해 1차 PDF 본문 직접 인용 대신 검색
스니펫 + canonical URL로 교차확인 — 게재 수치는 아키텍처별로 귀속.)

## 핵심 사실 ↔ 출처
- 레지스터 65,536×32b=256KB/SM(Volta~Hopper), 최대 255 reg/thread:
  https://docs.nvidia.com/cuda/ada-tuning-guide/index.html
- L1/공유 통합, A100 192KB(공유 ≤164KB), GA10x/Ada 128KB(≤100KB), Hopper 256KB(≤228KB):
  https://images.nvidia.com/aem-dam/en-zz/Solutions/data-center/nvidia-ampere-architecture-whitepaper.pdf ·
  https://docs.nvidia.com/cuda/hopper-tuning-guide/index.html
- L1 라인 128B = 4×32B 섹터; L2 공유(A100 40MB / AD102 96MB·4090 72MB / H100 50MB), L2·DRAM 32B 섹터:
  https://www.nvidia.com/content/PDF/nvidia-ampere-ga-102-gpu-architecture-whitepaper-v2.pdf
- 합치기: 워프 접근 → 정렬 32/64/128B 트랜잭션 최소화, 미정렬 최대 8× 페널티:
  https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/
- 공유 메모리 32뱅크·4B 워드·bank=(addr/4)%32·브로드캐스트:
  https://developer.nvidia.com/blog/using-shared-memory-cuda-cc/
- 32×32 열 읽기 32-way 충돌 → [32][33] 패딩 → ~95% 회복:
  https://developer.nvidia.com/blog/efficient-matrix-transpose-cuda-cc/
- AMD LDS(GCN 64KB/CU, RDNA3 128KB/WGP, 32뱅크), wavefront 32/64:
  https://gpuopen.com/download/RDNA_Architecture_public.pdf
- 캐시/지연 마이크로벤치(절대 ns는 환경 의존):
  https://chipsandcheese.com/p/microbenchmarking-amds-rdna-3-graphics-architecture
- Roofline(유효 대역폭 연결): https://people.eecs.berkeley.edu/~kubitron/cs252/handouts/papers/RooflineVyNoYellow.pdf

## 낮은 신뢰도/주의 (본문에 반영함)
- 절대 지연(ns)·캐시 측정치는 작업셋·전력상태 의존 → "환경 의존"으로만 서술.
- A100 "192KB vs 164KB"는 모순 아님: 192=L1+tex+shared 합, 164=공유 최대 carveout. 본문서 구분.
- Ada L2 "96MB(AD102 물리) vs 72MB(4090 활성)" — SKU 명시.
- 32B 섹터 모델은 CC 6.0+ 기준(구형은 128B L1 granularity로 서술됨).

## 데모 ↔ 사실
- `CoalescingCounter`: 32 스레드 접근 → 128B 트랜잭션 수·효율(유효÷이동). 스트라이드/오프셋 효과.
- `BankConflicts`: 연속/브로드캐스트/32×32 열/패딩 → 충돌 way 수.
