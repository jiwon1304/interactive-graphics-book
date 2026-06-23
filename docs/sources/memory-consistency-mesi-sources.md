# 출처 — memory-consistency-mesi ("메모리 일관성과 캐시 코히런시(MESI)")

WebSearch로 핵심 주장을 교차검증(≥2 출처). 메모리 모델·재정렬은 미묘해 형식 모델/전문가 글에
귀속하고, 표 하나로 못 담는 부분은 본문에 명시했다.

## 핵심 사실 ↔ 출처

- **코히런시 ≠ 일관성 구분, MESI 4상태, 스누핑 vs 디렉터리:**
  Sorin/Hill/Wood, *A Primer on Memory Consistency and Cache Coherence* ·
  Hennessy & Patterson (QA) ·
  https://en.wikipedia.org/wiki/MESI_protocol ·
  https://en.wikipedia.org/wiki/Cache_coherence
- **BusRd/BusRdX(read-for-ownership), write-invalidate:**
  https://en.wikipedia.org/wiki/MESI_protocol ·
  https://en.wikipedia.org/wiki/Bus_snooping
- **E(Exclusive)의 역할(버스 트래픽 없이 E→M):** 위 MESI wiki + H&P. (Illinois 프로토콜.)
- **MOESI(AMD, Owned)·MESIF(Intel, Forward):**
  https://en.wikipedia.org/wiki/MOESI_protocol ·
  https://en.wikipedia.org/wiki/MESIF_protocol
- **store buffer 재정렬(store→load), TSO가 허용하는 유일한 재정렬:**
  https://www.cl.cam.ac.uk/~pes20/weakmemory/x86tso-paper.tphols.pdf ·
  https://preshing.com/20120930/weak-vs-strong-memory-models/ ·
  Owens/Sarkar/Sewell x86-TSO 논문(write buffer per HW thread + global lock 모델)
- **x86 TSO vs ARM/POWER weak, 포팅 시 깨짐:**
  https://lwn.net/Articles/970907/ ·
  https://arangodb.com/2021/02/cpp-memory-model-migrating-from-x86-to-arm/ ·
  https://preshing.com/20120930/weak-vs-strong-memory-models/
- **fence: x86 mfence/sfence/lfence, ARM DMB/DSB, LDAR/STLR; lock 접두사=배리어:**
  https://mechanical-sympathy.blogspot.com/2011/07/memory-barriersfences.html ·
  Intel SDM Vol.3 §8 (memory ordering) · ARM ARM (barriers)
- **acquire/release 의미:** McKenney perfbook ·
  https://en.cppreference.com/w/cpp/atomic/memory_order
- **false sharing = MESI 핑퐁(M↔I), alignas(64) 해법:**
  https://docs.oracle.com/cd/E37069_01/html/E37081/aewcy.html · perfbook

## 낮은 신뢰도 / 주의 (본문에 반영함)

- **메모리 모델 "허용 재정렬 표"는 대표적 정리** — ARM/POWER는 의존성 순서·multi-copy
  atomicity 등 미묘한 규칙이 더 있어 표 하나로 못 담는다. 본문에 그렇게 명시, 정확한 규칙은
  아키텍처 매뉴얼/형식 모델 참고로 안내. **낮은 신뢰도/주의.**
- **MESI 전이 다이어그램은 대표 전이만** — M→다른코어 직접 전달(cache-to-cache) 변형,
  MOESI/MESIF의 추가 상태는 캡션/본문에서 별도 언급하고 도식에선 생략. **낮은 신뢰도/주의.**
- **fence 명령 동작은 아키텍처/세대별 미묘차** 있음(lfence는 x86에서 speculation 차단 용도로도
  쓰임 등) — 본문은 표준 의미만. **낮은 신뢰도/주의.**

## 데모 ↔ 사실

- `MesiStateMachine`: M/E/S/I 4노드 + 로컬 read/write(실선)·버스 스누프 invalidate/강등(점선).
  대표 전이만(I→E/S, E→M, S→M via BusRdX, M→S via BusRd, *→I via BusRdX).
- `StoreBufferReorder`: 두 코어 store buffer로 store→load 재정렬 → r1=r2=0 가능(TSO 유일 허용).
- `MemoryModelLadder`: SC / x86 TSO / ARM-POWER weak의 4재정렬(L→L,L→S,S→L,S→S) 허용 표.
  weak은 전부 ✓로 단순화(도식; 실제는 의존성 등 예외 있음).
