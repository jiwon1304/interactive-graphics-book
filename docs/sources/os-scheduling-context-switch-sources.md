# 출처 — os-scheduling-context-switch ("OS 스케줄링과 컨텍스트 전환")

WebSearch/WebFetch로 수집·교차검증. 스케줄러 이름/도입 시점은 커널 문서·LWN·Wikipedia로,
전환 비용은 측정 논문/벤치마크 글로 확인했다. 절대 시간(µs)·cycle은 환경 의존이라 "자릿수"로만.

## 핵심 사실 ↔ 출처

- **EEVDF가 CFS를 대체(Linux 6.6, 2023), CFS는 2.6.23(2007)부터 기본:**
  https://en.wikipedia.org/wiki/Earliest_eligible_virtual_deadline_first_scheduling ·
  https://www.phoronix.com/news/Linux-6.6-EEVDF-Merged ·
  https://docs.kernel.org/scheduler/sched-eevdf.html ·
  https://en.wikipedia.org/wiki/Completely_Fair_Scheduler
- **EEVDF 개념(lag≥0 → eligible, virtual deadline = eligible time + slice/weight, base slice ≈ 0.75ms):**
  https://lwn.net/Articles/925371/ ·
  https://en.wikipedia.org/wiki/Earliest_eligible_virtual_deadline_first_scheduling ·
  https://docs.kernel.org/scheduler/sched-eevdf.html
- **CFS vruntime·nice 가중치(nice 0 = weight 1024, 한 칸당 ×1.25 ≈ 시간 10% 차이; 범위 15~88761):**
  https://documentation.suse.com/sles/15-SP6/html/SLES-all/cha-tuning-taskscheduler.html ·
  https://blogs.oracle.com/linux/cfs-group-scheduling ·
  https://kernel-internals.org/sched/cfs/
- **컨텍스트 전환 직접 비용 ~1.2–1.5µs(코어 고정 시), 간접(캐시/TLB 오염) 포함 시 수천~수만 cycle:**
  https://blog.tsunanet.net/2010/11/how-long-does-it-take-to-make-context.html ·
  https://eli.thegreenplace.net/2018/measuring-context-switching-and-memory-overheads-for-linux-threads/ ·
  https://www.researchgate.net/publication/221469941_Quantifying_the_cost_of_context_switch
- **전환 시 레지스터 저장 + TLB flush(직접) + 캐시 working-set 손실(간접):**
  https://www.researchgate.net/publication/220938995_The_Effect_of_Context_Switches_on_Cache_Performance
- **타이머 틱 / 선점: CONFIG_HZ(100/250/1000 → 10/4/1ms), tickless(NO_HZ):**
  https://docs.kernel.org/timers/no_hz.html ·
  https://kernel-internals.org/sched/sched-tick/ ·
  https://lwn.net/Articles/549580/
- **NUMA: 원격 메모리 지연이 로컬의 약 3–6배, first-touch 할당, NUMA-aware 스케줄링:**
  https://queue.acm.org/detail.cfm?id=2513149 ·
  https://cacm.acm.org/practice/an-overview-of-non-uniform-memory-access/
- **CPU affinity(taskset/sched_setaffinity):** 위 SUSE 튜닝 가이드 + 커널 문서.
- **GPU 스케줄링과 대비(크로스링크 ./gpu-scheduling-preemption):** 본 책 내부 챕터.

## 낮은 신뢰도 / 주의 (본문에 반영함)

- **컨텍스트 전환 "~1µs"는 자릿수**: 직접 비용 1.2–1.5µs는 코어 고정·특정 하드웨어 측정값 →
  본문은 "직접 ~1µs 자릿수, 간접 비용이 더 클 수 있음"으로 명시.
- **EEVDF base slice 0.75ms**는 커널 버전에 따라 바뀔 수 있는 튜너블 → "현재 기본값/대표값"으로 귀속.
- **nice 한 칸 = 시간 ~10%**는 ×1.25 가중치에서 나온 근사("약 10%")로만.
- **NUMA 3–6배**는 토폴로지/세대 의존 대표 범위 → "대략"으로 서술. 낮은 신뢰도/주의.
- EEVDF는 여전히 활발히 개선 중(2024 후속 패치)이라 세부 동작은 버전 의존 → 개요 수준만.
