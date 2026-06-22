# 시리즈 로드맵 — CPU 아키텍처: 코어 안에서 무슨 일이 일어나는가

GPU 시리즈가 "CPU가 GPU에게 일을 시키는 과정"을 다뤘다면, 이 시리즈는 **CPU 코어 자신**으로
들어간다. 명령어 하나가 fetch되어 결과가 메모리에 닿기까지, 그 사이에 있는 캐시·파이프라인·
분기 예측·메모리 모델·가상 메모리·OS 스케줄링을 **직접 보여주는 정적 다이어그램**과 함께 푼다.

## 시리즈 이름

**"코어 안에서 — CPU 아키텍처와 시스템"** (사이드바 `section`: **CPU 아키텍처**)

## 설계 원칙(이 시리즈 한정)

- 데모는 **정적 2D 캔버스 도식**이다. 슬라이더·토글·애니메이션 루프 없음. `useEffect`에서 한 번
  그린다. 색은 CSS 변수(`--accent/--text/--muted/--surface/--border`)를 `getComputedStyle`로 읽어
  테마에 자동 적응. CPU 내부는 만질 3D 장면이 아니라 **개념 그림**이기 때문이다.
- 수치는 **아키텍처를 귀속**해서 쓴다(예: "Skylake에서 L1 ≈ 4 cycle"). 절대 ns·cycle은 환경
  의존이므로 "대표값"임을 명시한다. 모든 비자명 수치는 1차 자료(Intel/AMD 매뉴얼·Agner Fog·
  wikichip·chipsandcheese·논문)로 ≥2회 교차검증한다.

## 챕터 계획 (읽는 순서)

1. **cpu-memory-hierarchy** — *CPU 캐시와 메모리 계층 — 지역성·캐시라인·코히런시*
   왜 메모리는 느린가(memory wall), temporal/spatial locality, 캐시라인(64B)·set-associative
   구조·주소 분해(tag/index/offset)·AMAT·3C 미스·스트라이드 실험·conflict 절벽·false sharing.
   **← 이번에 전체를 집필한 챕터(완성 예시 브랜치).**

2. **cpu-pipeline-hazards** — *파이프라인과 해저드 — fetch·decode·execute를 겹치다*
   5단계 파이프라인, throughput vs latency, structural/data/control 해저드, forwarding(bypass),
   stall/bubble, 왜 분기가 비싼가로 자연스럽게 이어짐.

3. **branch-prediction** — *분기 예측 — 미래를 추측하는 CPU*
   2-bit saturating counter·BHT·BTB·gshare·TAGE 직관, misprediction penalty(파이프 flush),
   분기 없는 코드(branchless)·예측 가능한 데이터 정렬의 효과.

4. **superscalar-ooo** — *슈퍼스칼라와 비순차 실행 — 한 사이클에 여러 명령*
   다중 발행, register renaming(WAR/WAW 제거), reservation station·ROB·in-order retire,
   ILP의 한계, 투기 실행(speculation)과 Spectre로의 다리.

5. **memory-consistency-mesi** — *메모리 일관성과 캐시 코히런시(MESI)*
   여러 코어가 같은 메모리를 볼 때 — MESI 상태기계·snooping/directory, store buffer가 만드는
   재정렬, memory ordering(x86 TSO vs ARM weak), `acquire/release`·fence·`atomic`.

6. **virtual-memory-tlb** — *가상 메모리와 TLB — 주소가 번역되는 길*
   페이지 테이블·다단계 walk·TLB(번역 캐시)·page fault·huge page, 캐시와의 상호작용
   (VIPT L1), 왜 큰 working set은 TLB도 thrash하는가.

7. **simd-vectorization** — *SIMD와 벡터화 — 한 명령으로 여러 데이터*
   SSE/AVX/AVX-512·NEON·SVE, 데이터 레이아웃(AoS vs SoA), 자동 벡터화의 조건,
   masking·gather/scatter, 캐시 대역폭과의 연결.

8. **os-scheduling-context-switch** — *OS 스케줄링과 컨텍스트 전환 — 코어를 나눠 쓰다*
   타임슬라이스·선점·우선순위, 컨텍스트 전환 비용(레지스터·TLB·캐시 워밍업 손실),
   CFS/EEVDF 직관, affinity·NUMA, 인터럽트.

9. **atomics-locks** — *원자적 연산과 락 — 동시성의 하드웨어 토대* (확장)
   CAS·LL/SC·`lock` prefix, spinlock vs mutex, lock-free 큐 직관, cache-line 경합과
   false sharing 복습, 5번(MESI)·8번(스케줄링)과 교차.

> 1~8이 본선, 9는 확장. 5(MESI)와 6(TLB)은 1(캐시)의 직접 후속이고, 2→3→4는
> 파이프라인 한 갈래다. 이번 작업에서는 **1번(cpu-memory-hierarchy)을 완성**하고 나머지는
> `draft: true` 플레이스홀더로 등록한다.
