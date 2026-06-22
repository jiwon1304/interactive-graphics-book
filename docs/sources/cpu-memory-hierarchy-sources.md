# 출처 — cpu-memory-hierarchy ("CPU 캐시와 메모리 계층")

두 리서치 에이전트가 WebSearch/WebFetch로 수집·교차검증. 다툼 소지 수치는 ≥2 출처로
교차확인하고 아키텍처를 귀속했다. 절대 cycle/ns는 환경 의존이라 "대표값"으로만 서술.

## 핵심 사실 ↔ 출처

- **캐시라인 64 B (x86-64), Apple M계열 128 B 예외:**
  https://www.7-cpu.com/cpu/Apple_M1.html ·
  https://lemire.me/blog/2023/12/12/measuring-the-size-of-the-cache-line-empirically/
  (x86 64B는 Intel/AMD 매뉴얼·7-cpu에서 보편적. ARM은 구현 의존.)
- **지연(cycle, Skylake 대표값):** L1 ~4, L2 ~12, L3 ~40+, DRAM ~200+ →
  https://www.7-cpu.com/cpu/Skylake.html · 교차확인 Agner Fog
  https://www.agner.org/optimize/instruction_tables.pdf (L1 4–5c, L2 ~12c 일치).
  고전 ns 표(L1 0.5 / L2 7 / 메모리 100 ns): https://gist.github.com/hellerbarde/2843375 ·
  https://brenocon.com/dean_perf.html
- **캐시 크기/연관도(최근 Intel Golden Cove):** L1d 48KB·12-way, L1i 32KB·8-way, L2 1.25–2MB·16-way →
  https://en.wikipedia.org/wiki/Golden_Cove ·
  https://chipsandcheese.com/p/going-armchair-quarterback-on-golden-coves-caches
  (AMD Zen 4: L1 32KB, L2 1MB/core, L3 32MB/CCX →
  https://chipsandcheese.com/p/amds-zen-4-part-2-memory-subsystem-and-conclusion)
- **temporal/spatial locality 정의:** H&P / CSAPP §6.2 ·
  https://en.wikipedia.org/wiki/Locality_of_reference
- **AMAT = hit + miss_rate × miss_penalty (다층 재귀):**
  https://en.wikipedia.org/wiki/Average_memory_access_time (H&P/CSAPP)
- **memory wall (Wulf & McKee 1995):**
  https://www.eecs.ucf.edu/~lboloni/Teaching/EEL5708_2006/slides/wulf94.pdf
- **주소 분해 tag|index|offset, S/E/B 표기:** CSAPP 기반
  https://courses.cs.vt.edu/cs2506/Fall2014/Notes/L15.CacheOrganization.pdf ·
  http://csapp.cs.cmu.edu/3e/labs.html
- **3C 미스(compulsory/capacity/conflict, Hill & Smith):**
  https://www.cs.uaf.edu/~cs641/C5.3-5.4.pdf
- **stride/캐시라인 실험(예제1)·associativity 절벽(예제4)·false sharing(예제6):**
  http://igoro.com/archive/gallery-of-processor-cache-effects/
- **false sharing 정의·alignas(64) 해법:**
  https://docs.oracle.com/cd/E37069_01/html/E37081/aewcy.html
- **계단형(staircase) working-set 측정:** Drepper
  https://people.freebsd.org/~lstewart/articles/cpumemory.pdf · lmbench/Algorithmica HPC
  https://en.algorithmica.org/hpc/cpu-cache/bandwidth/
- **하드웨어 prefetcher(L1 next-line/IP-stride, L2 adjacent/streamer, 4KB 페이지 제한):**
  Intel 64/IA-32 Optimization Reference Manual.
- **교체 정책: 진짜 LRU 아님(pseudo-LRU/adaptive/RRIP):**
  https://en.wikipedia.org/wiki/Cache_replacement_policies
- **inclusivity: Intel inclusive→Skylake-SP non-inclusive, AMD Zen victim L3:**
  https://pcper.com/2016/08/amd-exposes-zen-cpu-architecture-at-hot-chips-28/3/
- **write 정책(write-through/back, write-allocate):**
  https://www.baeldung.com/cs/cache-write-policy (CSAPP §6.4)

## 낮은 신뢰도 / 주의 (본문에 반영함)

- **절대 cycle/ns 지연은 환경 의존** → 전부 "Skylake 대표값"으로 귀속, ns 표는 "자릿수용".
- **memory wall 백분율(CPU ~60%/yr, DRAM ~7%/yr)** 은 Wulf–McKee 본문 인용이 아니라
  H&P 추세 데이터로 굳어진 대표값 → 본문에 그렇게 명시.
- **Golden Cove L1d 12-way** 는 일부 2차 자료가 8-way로 오기 → 48KB/64B/64set 계산으로 12-way 확인.
- **"Intel L3 = inclusive"** 는 Skylake-server부터 깨짐 → "더 나아가기"에서 주의 명시.
- **교체 정책**은 Intel 미공개·리버스 엔지니어링 → "LRU에 가깝다"로만 서술.
- **Drepper의 3/14/240 cycle** 은 2007 Core 2 기준 → 현대값과 다름을 별도 메모.

## 데모 ↔ 사실

- `MemoryHierarchy`: 5층 피라미드 + Skylake 대표 cycle. 막대 폭=용량 대수 직관(정확 비율 아님, 도식).
- `CacheLineStride`: 64B=int16개, stride 1 vs 16 → "건드린 라인 수=미스 수"가 같음(Ostrovsky 예제1).
- `AddressDecomposition`: 32KB·8-way·64B 예시로 tag(20)|index(6)|offset(6) 분해 + 8-way set 병렬 tag 비교.
  (32-bit 물리주소 가정은 도식 단순화 — 실제 x86-64는 더 넓음.)
