# 출처 — warp-divergence-occupancy ("워프 다이버전스와 occupancy")

이 챕터는 아래 1차/전문가 자료를 기준으로 작성·검증했다(소급 검수, 조사일 2026-06).
검증 방법 메모: NVIDIA `docs.nvidia.com`·PDF·`gpuopen.com`은 WebFetch가 403으로 막혀,
검색 스니펫으로 canonical 원문 verbatim을 교차확인하고 canonical URL을 기록했다. 인용은
canonical URL 기준. 이 챕터는 `gpu-execution-model-sources.md`의 워프/SIMT 기본 사실을 전제로
하며, 여기서는 *다이버전스 시간 비용·predication·scoreboard·Little의 법칙·occupancy 한계*에
초점을 둔다.

---

## 1. 워프는 사이클당 한 명령 · 두 경로 직렬 · 비용 t_then+t_else · 마스크 레인 수 무관 · 최악 32-way

- **CUDA C++ Best Practices Guide / Programming Guide** —
  https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html
  https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html
  - *"the different execution paths must be serialized, since all of the threads of a warp share
    a program counter; this increases the total number of instructions executed for that warp."*
  - 각 경로는 활성 레인 수와 무관하게 *전부* 실행 → 마스크 레인 수는 시간 무관. 32-way switch면
    최대 32 직렬화.
  - **보강 노트(본문 영향 없음):** "사이클당 한 명령(스케줄러당)"은 **Volta 이후** 정확. Pascal은
    듀얼 이슈였다. 또 한 FP32 워프 명령이 Volta에서 2사이클 디스패치될 수 있음. 다이버전스
    논증($t_{then}+t_{else}$)에는 영향 없음 — 현 본문 표현으로 충분.
  - **검증사실 ↔ 본문:** §1 DivergenceReconverge, "한 사이클 한 명령", "레인 개수는 시간 무관". **확인.**

## 2. 다이버전스는 워프 *내부*에서만 비용 · 만장일치 워프 무비용 · 워프 경계 정렬

- **CUDA C++ Best Practices Guide — Branching and Divergence** (위 #1 동일)
  - *"Ensure decisions for whether or not to branch only differ at warp boundaries. … there is no
    divergence if threads 0-31 (warp 0) take a branch, and threads 32-63 (warp 1) do not … there
    is divergence if some of the threads in warp 0 take the branch and other threads in warp 0 do not."*
  - **검증사실 ↔ 본문:** §1 "워프 내부에서만 비용", "분기를 워프 경계에 정렬", predict-then-reveal
    (A 체커보드 vs B 정렬). **확인.**

## 3. 전통 SIMT 재수렴 = IPDOM(활성 마스크 스택 + 단일 PC) · 빠른 재수렴이 스핀락 교착

- **Fung, Sham, Yuan, Aamodt — "Dynamic Warp Formation and Scheduling for Efficient GPU Control
  Flow"** (MICRO 2007, IPDOM 재수렴 원전) —
  https://people.ece.ubc.ca/aamodt/publications/papers/wwlfung.micro2007.pdf
- **"Control Flow Management in Modern GPUs"** —
  https://arxiv.org/pdf/2407.02944
  - *"pre-Volta GPUs enforce reconvergence at the IPDom points … and they execute diverged paths
    serially"* → 스핀락 교착.
  - **주의:** IPDOM/스택 모델은 학계(Aamodt 교과서/GPGPU-Sim) 표준이지 NVIDIA 공개 ISA 문서가
    아님. 이 사실은 학술 출처로 인용. (NVIDIA는 정확한 재수렴 정책을 공개하지 않음.)
  - **검증사실 ↔ 본문:** §1 `<details>` 재수렴 IPDOM/교착. **확인(학술 출처).**

## 4. Volta(2017) ITS — 스레드별 PC·콜스택, __syncwarp · 안전성만, 다이버전스 비용은 그대로

- **CUDA Programming Guide (ITS)** / **Volta Tuning Guide** —
  https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html
  https://docs.nvidia.com/cuda/volta-tuning-guide/index.html
  - 스레드마다 PC·콜스택. `__syncwarp()`로 명시적 재수렴. *"does not eliminate the performance
    penalty associated with thread divergence … still leads to … serialized execution of divergent
    paths within a warp."*(arXiv 2407.02944)
  - **검증사실 ↔ 본문:** §1 `<details>` "ITS는 공짜가 아니라 *안전하게* 만들 뿐", $t_{then}+t_{else}$ 유지. **확인.**

## 5. predication — 분기 미생성, per-instruction predicate · 분기 오버헤드 b · 손익분기

- **HLSL `if` (Microsoft Learn) — [branch]/[flatten]** —
  https://learn.microsoft.com/en-us/windows/win32/direct3dhlsl/dx-graphics-hlsl-if
  - `[branch]` = *"evaluates only one side"*(만장일치면 한 쪽 skip), `[flatten]` = *"evaluate
    both sides … choose … using the original value of the condition"*(= predication, 항상 양쪽).
  - CUDA 컴파일러도 짧은 조건은 branch predication으로 변환(Programming Guide). 긴 본문(함수
    호출·루프)은 진짜 분기.
  - **주의(저자 유도):** 손익분기 식 $t_{else}=b$의 *대수*는 본문 자체 모델이다. 출처는
    *정성적* 주장(predication은 분기 오버헤드 제거하나 항상 양쪽 실행; 컴파일러는 짧은 조건을
    predicate)만 확인. 식은 저자 유도로 표기하면 됨.
  - **검증사실 ↔ 본문:** §2 PredicationVsBranch, 손익분기. **확인(정성), 식은 저자 유도.**

## 6. 메모리 지연 = 수백 사이클 · L2 미스/DRAM 400~800 (대표값)

- NVIDIA 최적화 자료 통설: *"Global memory access … around 400–800 clock cycles …"* (예: NCSA
  Fundamental CUDA Optimization).
- **Mei & Chu — "Dissecting GPU Memory Hierarchy through Microbenchmarking"** (IEEE TPDS 2016,
  실측) — https://arxiv.org/abs/1509.02308
  - **수치 정책:** 400~800은 널리 인용되는 **대표값**이지 spec 보장이 아니다(세대·클럭·경쟁 의존).
  - **검증사실 ↔ 본문:** §3 "수백 사이클 … L2 미스면 400~800 사이클도 흔합니다" — 본문이 이미
    "흔합니다"로 대표값 톤. **확인(대표값으로 명시됨).**

## 7. scoreboard — 레지스터 not-ready 추적 · 스케줄러는 eligible 워프 선택 · stall 워프 갈아탐

- **NVIDIA Nsight Compute Profiling Guide** —
  https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html
  - *"Variable latency instructions like memory accesses … are called scoreboard producers, while
    instructions that use the results … are scoreboard consumers. Stall reasons such as 'long
    scoreboard' appear on the scoreboard consumer instructions…"*
  - *"Eligible warps are the subset of active warps that are ready to issue … every cycle with no
    eligible warp results in no instruction being issued…"*
  - **검증사실 ↔ 본문:** §3 SchedulerScoreboard, "scoreboard", "eligible 워프로 갈아탐". **확인(NVIDIA 공식 용어).**

## 8. Little의 법칙 — 필요 in-flight = 지연 × 처리량 = L/τ · ILP 고려 시 L/(τ·ILP)

- **Volkov — "Understanding Latency Hiding on GPUs"** (UC Berkeley 박사논문, EECS-2016-143) —
  https://www2.eecs.berkeley.edu/Pubs/TechRpts/2016/EECS-2016-143.html
- **Modal GPU Glossary — Little's Law** — https://modal.com/gpu-glossary/perf/littles-law
  - *"needed parallelism = latency × throughput … 400-cycle latency, 1 instr/cycle → 400 concurrent
    operations needed."* ILP만큼 워프 수가 줄어듦.
  - **검증사실 ↔ 본문:** §4 LatencyHidingLanes, $N=L/\tau$, $N_{워프}\approx L/(\tau\cdot ILP)$,
    차원 분석 `<details>`. **확인(Volkov framing 정확).**

## 9. occupancy 정의 · SM당 최대 워프(세대별) — **본문 "48~64" 보정함**

- **NVIDIA Turing / Ampere Tuning Guide** —
  https://docs.nvidia.com/cuda/turing-tuning-guide/index.html
  https://docs.nvidia.com/cuda/ampere-tuning-guide/index.html
  - SM당 최대 동시 워프(threads): Maxwell/Pascal/Volta 64(2048) · **Turing 32(1024)** ·
    Ampere GA100 64 · Ampere GA10x 48(1536) · Ada 48 · Hopper 64.
  - **⚠️ 정정 반영(본문 수정함):** 원문 "세대에 따라 SM당 48~64 워프"는 **Turing(32)** 을 빠뜨림.
    → "32~64 — Maxwell·Pascal·Volta·Ampere GA100·Hopper 64, Ampere GA10x·Ada 48, Turing 32"로 수정. **완료.**
  - **검증사실 ↔ 본문:** §5 occupancy 정의·분모. **확인(수정 후).**

## 10. occupancy 한계 — 워프 슬롯·레지스터·공유 메모리·블록 슬롯 · 레지스터 파일 64K · 할당 단위

- **NVIDIA Turing/Ampere Tuning Guide** (위 #9) / **CUDA Occupancy Calculator** —
  - *"The register file size is 64K 32-bit registers per SM."* 스레드당 최대 255 레지스터.
  - SM당 최대 블록: Volta 32 · Turing 16 · Ampere 8.0=32 · GA10x=16 · Ada 24 · Hopper 32 →
    본문 "16~32"는 대체로 맞음(Ada 24도 범위 내).
  - **할당 단위 보정(본문 수정함):** 원문 "스레드당 8개 단위로 반올림"은 옛 Fermi/Kepler 모델.
    현대(CC 7.0+)는 **워프 단위 256 레지스터(=32×8)로 반올림**(warp allocation granularity 4).
    → "워프 단위(256=32×8)로 반올림 — 스레드당 환산 시 사실상 8개 단위", "정확한 단위는 세대마다
    다름, 도식용 대표값 8" 문구 추가. **수정 완료.**
  - $R_{file}=65{,}536$, $R=80$ → $T_{max}=819$, $N_{reg}=\lfloor819/32\rfloor=25$ 워프 — 산술 정확.
  - **검증사실 ↔ 본문:** §5 OccupancyLimiters, 레지스터 한계 유도, 양자화. **확인(수정 후).**

## 11. Volkov "Better Performance at Lower Occupancy" — 낮은 occupancy로 더 빠른 커널 (실존)

- **Volkov, GTC 2010** — https://www.nvidia.com/content/gtc-2010/pdfs/2238_gtc2010.pdf
  - *"high GPU occupancy is not necessary to obtain close to the peak performance"*; ILP가 낮은
    occupancy를 보상. ~25% occupancy로도 고성능 가능.
  - **검증사실 ↔ 본문:** §4 박스 "낮은 occupancy로 더 빠른 … Volkov의 유명한 결과". **확인.**

## 12. 벤더 용어 — NVIDIA warp(32) ↔ AMD wavefront(32/64) ↔ Vulkan subgroup · AMD는 VGPR/LDS

- **AMD GPUOpen — Occupancy explained / RDNA Performance Guide** —
  https://gpuopen.com/learn/occupancy-explained/ · https://gpuopen.com/learn/rdna-performance-guide/
  - *"GPU occupancy is constrained by Vector General Purpose Registers (VGPRs), Scalar GPRs
    (SGPRs), and Local Data Share (LDS) memory."* GCN wave64, RDNA wave32(옵션 wave64).
  - **검증사실 ↔ 본문:** §7 "벤더별 용어", AMD VGPR/LDS. **확인.**

---

### 수정/플래그 요약

- **[수정함] §5 SM당 최대 워프:** "48~64" → "32~64(Turing 32, GA10x·Ada 48, 나머지 64)".
- **[수정함] §5 레지스터 할당 단위:** "스레드당 8개 반올림" → "워프 단위 256(=32×8) 반올림,
  스레드당 환산 사실상 8 / 단위는 세대별, 도식용 대표값".
- **[확인·적절] §3 메모리 지연 400~800:** 본문이 이미 대표값 톤.
- **[확인] 나머지(§1·§2·§3·§4·§6) 모두 1차/권위 자료로 확인.**
- **[보강 노트, 오류 아님]** §1 "사이클당 한 명령"은 Volta+ 기준(Pascal 듀얼 이슈); §2 손익분기 식은 저자 유도.
