# 출처 — gpu-execution-model ("GPU 실행 모델 — 워프와 락스텝")

이 챕터는 아래 1차/전문가 자료를 기준으로 작성·검증했다(소급 검수, 조사일 2026-06).
검증 방법 메모: NVIDIA PDF 화이트페이퍼·`docs.nvidia.com`·`gpuopen.com`은 WebFetch가
403으로 자주 막혀, (a) 검색 스니펫으로 canonical 원문 verbatim을 교차확인하고 (b) canonical
URL을 기록했다. 인용은 canonical URL 기준.

---

## 1. SM/CU/Xe-core · 칩은 SM을 복제해 늘린 것

- **NVIDIA Ada GPU Architecture Whitepaper** —
  https://images.nvidia.com/aem-dam/Solutions/geforce/ada/nvidia-ada-gpu-architecture.pdf
- **AMD RDNA Architecture Whitepaper** — https://gpuopen.com/download/RDNA_Architecture_public.pdf
  - 풀 AD102 = 144 SM, 풀 GA102 = 84 SM → "수십~수백 SM"이 맞다.
  - SM(NVIDIA) ↔ CU(AMD Compute Unit) ↔ Xe-core(Intel) 매핑은 표준. 역할(워프/웨이브
    스케줄러·레지스터 파일·ALU·L1/shared를 가진 자족적 실행 블록)이 동등.
  - **검증사실 ↔ 본문:** §1 "수십~수백 SM" / 벤더 용어 매핑. **확인.**

## 2. SM = 4 파티션(processing block), 각 파티션 32 FP32 레인 → SM당 128 FP32

- **NVIDIA Ampere GA102 Whitepaper** —
  https://www.nvidia.com/content/PDF/nvidia-ampere-ga-102-gpu-architecture-whitepaper-v2.1.pdf
  - *"Each SM in GA10x GPUs contain 128 CUDA Cores, four third-generation Tensor Cores, a
    256 KB Register File, four Texture Units… and 128 KB of L1/Shared Memory."*
  - SM은 4개 processing block(파티션)으로 나뉘고 각자 워프 스케줄러를 가짐. 128 ÷ 4 = 파티션당
    32 FP32 레인.
  - **검증사실 ↔ 본문:** §1 SmFloorplan(4 파티션) · §2 "코어/SM = 32×4 = 128"(Ampere/Ada
    소비자 GPU). **확인.**

## 3. "CUDA 코어" = FP32 ALU 레인 하나 (CPU 코어 아님)

- **Modal GPU Glossary — CUDA core** — https://modal.com/gpu-glossary/device-hardware/cuda-core
  - CUDA 코어 = SM subpartition의 FP32/INT32 ALU 레인. 처리량 위주의 단순 산술 레인이지
    독립 실행 유닛이 아님. 스펙시트 "CUDA 코어 수" = FP32 레인 수. INT/SFU/LSU/Tensor/RT는
    별도 카운트 또는 미표기.
  - **검증사실 ↔ 본문:** §1 "파란 칸 하나 = FP32 ALU 레인" / `<details>` "FP32만 센다". **확인.**

## 4. ⚠️ RTX 4090의 SM 수·코어 수 — **본문 수정함**

- **NVIDIA Ada Whitepaper** / **RTX 4090 공식 스펙** —
  https://images.nvidia.com/aem-dam/Solutions/geforce/ada/nvidia-ada-gpu-architecture.pdf
  https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/
  - **RTX 4090(출하 제품)은 144 SM 중 128 SM만 활성** → 128 × 128 = **16,384 CUDA 코어**.
  - **144 SM = 풀 AD102 다이**(18,432 코어)이지만 4090에는 **탑재되지 않음**(16 SM 비활성/fuse off).
  - **수정 전 본문 오류:** "RTX 4090(풀칩에 가까운 AD102) $N_{SM}=144$, $128\times144=18{,}432$".
    이는 풀 AD102 다이와 실제 4090을 혼동한 것. "풀칩에 가까운"도 오해 소지(16/144 ≈ 11% 비활성).
  - **조치:** §2 CoreCountBuilder 본문을 $N_{SM}=128$, $128\times128=16{,}384$로 수정.
    풀 AD102(144 SM/18,432 코어, 4090엔 미탑재)는 각주로 명시. **수정 완료.**

## 5. 128 FP32/SM은 Ampere부터 · Turing은 64 FP32/SM (듀얼 데이터패스 변경)

- **NVIDIA Ampere GA102 Whitepaper** (위 #2와 동일 URL)
  - *"In the Turing generation, each of the four SM processing blocks had two primary datapaths,
    but only one of the two could process FP32 operations… GA10x includes FP32 processing on both
    datapaths, doubling the peak processing rate for FP32 operations."*
  - Turing = 64 FP32 + 64 INT32/SM. Ampere/Ada = 128 FP32(두 데이터패스 중 하나가 FP32/INT32 겸용).
  - **검증사실 ↔ 본문:** §2 `<details>` "Ampere/Ada는 한 파티션 일부 레인이 FP32/INT 겸용". **확인.**

## 6. 워프 = 32 스레드(고정) · 한 명령을 32레인에 브로드캐스트 · 락스텝 · SIMT

- **CUDA C Programming Guide — SIMT Architecture** —
  https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html
  - *"A warp executes one common instruction at a time, so full efficiency is realized when all
    32 threads of a warp agree on their execution path."*
  - 워프 폭 = 32 고정. SIMT = Single-Instruction Multiple-Threads.
  - **검증사실 ↔ 본문:** §3 WarpLockstep(한 명령이 32레인 브로드캐스트). **확인.**

## 7. 블록 → 워프(⌈T/32⌉) · 블록은 한 SM에 상주(공유 메모리/L1 공유) · 남는 레인 비활성

- **CUDA C Programming Guide** (위 #6 동일)
  - 블록은 32개 연속 스레드 단위로 워프 분할(⌈T/32⌉). 한 블록의 워프는 동일 SM에 공동 상주하므로
    그 SM의 공유 메모리/L1을 함께 씀. 마지막 워프의 빈 레인은 비활성.
  - **검증사실 ↔ 본문:** §3 "블록은 워프로 쪼개진다", §5 "한 블록 스레드는 같은 SM에". **확인.**

## 8. AMD 웨이브프론트 = GCN 64 · RDNA(2019)는 Wave32/Wave64 · 폭은 런타임에 질의

- **AMD RDNA Architecture Whitepaper** — https://gpuopen.com/download/RDNA_Architecture_public.pdf
  - *"Wavefronts include either 32 work items (referred to as 'wave32') or 64 work items
    ('wave64'), and each ALU pipeline includes 32 ALUs."* GCN은 64 고정.
  - 이식성: `gl_SubgroupSize`(Vulkan/GLSL) / `WaveGetLaneCount()`(HLSL SM6+)로 질의.
  - **검증사실 ↔ 본문:** §3 `<details>` "AMD 웨이브프론트 폭 64(GCN), RDNA는 Wave32 지원". **확인.**

## 9. SIMT = SIMD 하드웨어 + HW가 관리하는 per-lane predicate mask

- **Lindholm, Nickolls, Oberman, Montrym — "NVIDIA Tesla: A Unified Graphics and Computing
  Architecture"** (IEEE Micro 28(2), 2008, SIMT 개념 정의) —
  https://www.researchgate.net/publication/3216496_NVIDIA_Tesla_A_unified_graphics_and_computing_architecture
- **Wikipedia — Single instruction, multiple threads** —
  https://en.wikipedia.org/wiki/Single_instruction,_multiple_threads
  - CPU SIMD(AVX/NEON)는 프로그래머/컴파일러가 마스크를 명시적으로 관리(compare→mask→blend).
    GPU SIMT는 하드웨어가 per-lane active/predicate mask를 자동 관리, 평범한 if/else로 작성.
  - **본문 정확성 노트(보강 권장, 오류 아님):** SIMT는 마스킹뿐 아니라 *스레드별 레지스터·독립
    주소(gather/scatter)* 까지 줌. "SIMD + 자동 마스크"는 옳은 직관이나 SIMT를 약간 과소진술.
  - **검증사실 ↔ 본문:** §4 SimtVsSimd + 박스 공식 "SIMT = SIMD HW + HW가 관리하는 mask". **확인(표준 framing).**

## 10. 워프 다이버전스 — 두 경로 직렬 실행, 워프 *내부*에서만 비용

- **CUDA C Programming Guide / Best Practices Guide** —
  https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html
  https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html
  - *"If threads of a warp diverge via a data-dependent conditional branch, the warp serially
    executes each branch path taken, disabling threads that are not on that path… threads
    reconverge after all divergent paths are completed."*
  - *"Branch divergence occurs only within a warp; different warps execute independently."*
  - 만장일치 워프 = 비용 없음. 최악 32-way 직렬화.
  - **검증사실 ↔ 본문:** §4 "두 가지를 차례로 모두 실행" / "워프 내부에서만 비용". **확인.**

## 11. Volta(2017) Independent Thread Scheduling — 안전성↑, 다이버전스 비용은 그대로

- **CUDA C Programming Guide (Independent Thread Scheduling)** / **Volta V100 Whitepaper** —
  https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html
  - Volta부터 스레드마다 PC·콜스택 → 갈린 가지를 인터리브, 분기 내부 동기화 안전. 단 여전히 한
    사이클 한 명령이라 처리량 비용 $t_{\text{then}}+t_{\text{else}}$는 그대로(안전하게 만들 뿐
    공짜로 만들지 않음).
  - **검증사실 ↔ 본문:** §4 `<details>` 재수렴/ITS. **확인(중요 정정 정확).**

## 12. 지연 숨기기(latency hiding) — stall 시 다른 준비된 워프로 전환

- **CUDA C Best Practices Guide** — https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html
  - *"When the GPU must wait on one warp of threads, it simply begins executing work on another,
    and because separate registers are allocated to all active threads, no swapping of registers or
    other state need occur when switching among GPU threads."*
  - 전역 메모리 접근은 수백 사이클. occupancy↑ = 가릴 워프↑. (단 Volkov: ILP로도 지연을 가릴 수
    있어 100% occupancy가 필수는 아님 — 다음 챕터 주제.)
  - **검증사실 ↔ 본문:** §5 "지연 숨기기". **확인.**

## 13. GigaThread 엔진 — 블록을 SM에 분배

- **NVIDIA Fermi Compute Architecture Whitepaper** —
  https://www.nvidia.com/content/PDF/fermi_white_papers/NVIDIA_Fermi_Compute_Architecture_Whitepaper.pdf
  - GigaThread 엔진이 thread block을 각 SM에 생성·디스패치(2단계 스케줄: 칩 레벨 GigaThread →
    SM 레벨 워프 스케줄러).
  - **검증사실 ↔ 본문:** §5 1번 "하드웨어 스케줄러(GigaThread 엔진)가 블록을 SM에 배정". **확인.**

## 14. 벤더/API 용어 사전

- **Khronos Vulkan Subgroup Tutorial(DevDay 2018)** —
  https://www.khronos.org/assets/uploads/developers/library/2018-vulkan-devday/06-subgroups.pdf
  - NVIDIA warp(32) ↔ AMD wavefront(32/64) ↔ Vulkan/SPIR-V subgroup ↔ Metal SIMD-group ↔
    D3D12 wave. 런타임 폭: `gl_SubgroupSize` / `WaveGetLaneCount()`.
  - **검증사실 ↔ 본문:** §6 용어 사전. **확인.**

---

### 수정/플래그 요약

- **[수정함] §2 RTX 4090:** 144 SM/18,432 코어(풀 AD102 다이) → **128 SM/16,384 코어(실제 4090)**.
  풀 다이는 각주로. (위 #4)
- **[확인] 나머지 핵심 사실(1·2·3·5·6·7·8·9·10·11·12·13·14) 모두 1차/권위 자료로 확인.**
- **[보강 가능, 오류 아님] §4 SIMT** 설명은 마스킹 외에 스레드별 레지스터/독립 주소도 SIMT 특성.
  현 본문은 직관 우선이라 그대로 둠.
