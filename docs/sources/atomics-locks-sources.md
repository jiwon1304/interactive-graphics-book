# 출처 — atomics-locks ("원자적 연산과 락")

WebSearch로 핵심 개념을 교차검증(≥2 출처). 동시성·메모리 순서는 미묘해 perfbook/Herlihy-Shavit
같은 표준 교재와 전문가 글에 귀속.

## 핵심 사실 ↔ 출처

- **counter++ = load-modify-store, lost update, atomicity 정의:**
  Herlihy & Shavit, *The Art of Multiprocessor Programming* ·
  https://en.wikipedia.org/wiki/Linearizability ·
  https://en.wikipedia.org/wiki/Read-modify-write
- **CAS(addr, expected, new) 의미, x86 cmpxchg, retry loop = optimistic concurrency:**
  https://en.wikipedia.org/wiki/Compare-and-swap ·
  https://www.abstractalgorithms.dev/compare-and-swap-optimistic-locking ·
  Intel SDM Vol.3 §8 (cmpxchg, lock 접두사)
- **fetch-add/exchange 원자 명령, x86 lock xadd/xchg, lock=배리어:**
  Intel SDM Vol.3 §8 · https://en.wikipedia.org/wiki/Fetch-and-add
- **LL/SC: ARM LDREX/STREX, ARMv8.1 LDAXR/STLXR + LSE; 값이 아니라 쓰기 감지; spurious failure 재시도:**
  https://blog.memzero.de/cas-llsc-aba/ ·
  https://en.wikipedia.org/wiki/Load-link/store-conditional ·
  ARM ARM (exclusive monitor)
- **spinlock(CAS 0→1), acquire/release로 임계구역 가둠:**
  perfbook · Herlihy & Shavit · https://en.wikipedia.org/wiki/Spinlock
- **cache-line bouncing(원자 쓰기마다 BusRdX → M↔I 핑퐁), 코어 늘려도 안 빨라짐:**
  Herlihy & Shavit (TTAS/backoff/MCS 동기) ·
  https://en.wikipedia.org/wiki/Test_and_test-and-set ·
  https://en.wikipedia.org/wiki/MCS_lock
- **spinlock vs mutex(blocking), 짧으면 spin/길면 mutex, adaptive mutex:**
  https://en.wikipedia.org/wiki/Spinlock ·
  glibc adaptive mutex 문서 · perfbook
- **lock-free vs wait-free 진행 보장, "항상 빠르지 않음":**
  https://en.wikipedia.org/wiki/Non-blocking_algorithm ·
  Herlihy & Shavit
- **ABA 문제 + tagged pointer/hazard pointer/epoch; LL/SC가 ABA에 강함:**
  https://en.wikipedia.org/wiki/ABA_problem ·
  https://blog.memzero.de/cas-llsc-aba/ (LL/SC가 intervening store로 SC 실패 → ABA 완화)

## 낮은 신뢰도 / 주의 (본문에 반영함)

- **"x86=CAS, ARM=LL/SC" 단순화** — ARMv8.1 LSE는 CAS/원자 명령을 직접 추가했고, x86도
  내부적으로 다양 → 본문에 ARMv8.1+/LSE 언급해 완화. **낮은 신뢰도/주의.**
- **lock-free 성능** 은 경쟁도·구현 의존, "락보다 빠르다"는 흔한 오해 → 본문에 "진행 보장 ≠
  처리량" 명시. **낮은 신뢰도/주의.**
- **spin vs mutex 경계(전환 비용 대비)** 는 시스템·OS 의존 → "경험칙"으로 서술. **낮은 신뢰도/주의.**
- **MCS/TTAS/backoff** 는 완화책 개요만(상세 구현·정량은 생략) → 개념 수준. **낮은 신뢰도/주의.**
- **메모리 순서(acquire/release)** 의 정확한 의미는 memory-consistency-mesi 챕터와 C/C++ 모델
  참조로 위임 → 한 줄 요약만. **낮은 신뢰도/주의.**

## 데모 ↔ 사실

- `CasRetryLoop`: counter 10→11→12, 스레드 A 성공/B 실패→재시도 성공으로 CAS 의미와 retry loop.
- `CacheLineBounce`: 4코어가 한 lock 라인에 BusRdX → M(코어0)/I(나머지) 핑퐁. false sharing과
  같은 메커니즘이나 "진짜 공유"임을 캡션에 구분. 완화책(backoff/MCS) 캡션 언급.
- `SpinVsMutex`: 짧은 임계구역(spin 유리) vs 긴 임계구역(mutex 유리) 타임라인, adaptive 결론.
  세그먼트 비율은 도식용(정량 아님).
