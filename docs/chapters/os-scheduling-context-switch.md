# 핸드오프 — os-scheduling-context-switch ("OS 스케줄링과 컨텍스트 전환")

## 목적 / 범위
타임슬라이스·선점 → 컨텍스트 전환 비용(직접/간접) → Linux CFS→EEVDF 개요 → nice/weight·affinity·
NUMA → 인터럽트/틱. GPU 스케줄링(./gpu-scheduling-preemption)과 대비, 캐시(./cpu-memory-hierarchy)와
연결. 다루지 않음: 실시간 스케줄러(SCHED_FIFO/RR/DEADLINE) 상세, cgroup/그룹 스케줄링, EEVDF 내부
구현(코드 레벨).

## 위젯 (모두 정적 2D canvas, 내부폭 360, 테마 반응)
- `TimeSliceTimeline.tsx` — 한 코어에서 A·B가 번갈아, 슬라이스 사이마다 빨강=컨텍스트 전환(과장).
  **메커니즘**(시분할 + 전환 오버헤드의 위치)을 보임. 슬라이스/전환폭은 상수 배열.
- `SwitchCostBreakdown.tsx` — 전환 비용을 직접(작음, ~1µs) + 간접(큼, 캐시·TLB 재충전) 스택 막대 +
  두 설명 박스. "보이는 것보다 큼"이 핵심.
- `NumaTopology.tsx` — 2-노드 NUMA(CPU+로컬 DRAM), 로컬 1× vs 원격 3–6× 인터커넥트. affinity/NUMA
  절의 도식.

## 기술 노트 / 단순화
- 전환 비용 막대의 직접:간접 비율(0.22:0.78)은 **도식용**(정확 비율 아님). 1.2–1.5µs는 코어 고정
  측정 대표값 → 본문·캡션에서 "자릿수"로 명시.
- EEVDF base slice 0.75ms·nice ×1.25·NUMA 3–6×는 모두 sources에서 ≥2 출처 교차확인, 버전/토폴로지
  의존이라 "대표/현재값"으로 귀속.
- vruntime 식은 CFS 직관용 단순화(실제 가중치 테이블은 sched_prio_to_weight).

## TODO / 확장
- chapters.ts에서 `draft: true` 해제 필요(중앙 등록). RELATED에
  os-scheduling-context-switch ↔ gpu-scheduling-preemption, cpu-memory-hierarchy 간선 추가 고려.
- 확장: CFS vs EEVDF 선택 비교 도식, 실시간 클래스, work-stealing/load balancing.
