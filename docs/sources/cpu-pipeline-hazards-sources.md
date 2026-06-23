# 출처 — cpu-pipeline-hazards ("파이프라인과 해저드")

리서치 에이전트가 WebSearch로 수집·교차검증(WebFetch는 이번 세션 다수 호스트에서 403 →
검색 스니펫 + 교과서 지식으로 교차확인). 다툼 소지 수치는 ≥2 출처로 확인하고 마이크로아키텍처를
귀속. 절대 cycle/단계 수는 환경 의존이라 "범위/규모"로만 서술.

## 핵심 사실 ↔ 출처

- **5단계 RISC 파이프 IF·ID·EX·MEM·WB (MIPS R2000/R3000, DLX):**
  https://en.wikipedia.org/wiki/Classic_RISC_pipeline · H&P COD 4장.
- **pipelining은 throughput↑, latency는 그대로(레지스터 오버헤드로 약간↑); speedup→단계 수 k:**
  https://ece-research.unm.edu/jimp/611/slides/chap3_2.html (H&P/DLX) ·
  https://ocw.mit.edu/courses/6-004-computation-structures-spring-2017/pages/c7/c7s1/ (단계 레지스터 오버헤드).
- **해저드 3분류 structural/data/control; data sub RAW/WAR/WAW:** H&P 표준 분류.
- **in-order·single-issue 5단계에서는 RAW만 발생(WAR/WAW 없음):**
  https://chipmunklogic.com/digital-logic-design/designing-pequeno-risc-v-cpu-from-scratch-part-3-dealing-with-pipeline-hazards/ ·
  http://users.ece.cmu.edu/~jhoe/course/ece447/latest/L08.pdf (CMU 18-447).
- **forwarding/bypassing이 대부분 RAW stall 제거:** H&P COD 4장.
- **load-use 해저드는 forwarding 있어도 정확히 1 cycle(1 bubble) stall:**
  https://ee.cooper.edu/~curro/comparch/pipeline/chapter4_pipelining_END_FA11.pdf (COD 4장 슬라이드) ·
  https://courses.cs.vt.edu/cs2506/Fall2014/Notes/L09.PipelineHazards.pdf.
- **분기 EX 해소 시 ~3 cycle penalty; MIPS는 비교를 ID로 당겨 1 cycle + delay slot 1개:**
  https://en.wikipedia.org/wiki/Classic_RISC_pipeline ·
  https://www.sciencedirect.com/topics/engineering/stage-pipeline.
- **misprediction 비용 = 파이프 깊이 비례; 현대 x86 ~15~20 cycle(Skylake ~16~17):**
  https://www.agner.org/optimize/microarchitecture.pdf (Agner Fog) ·
  https://lemire.me/blog/2019/12/06/amd-zen-2-and-branch-mispredictions/ (10~20 cycle 범위).
- **Pentium 4 Prescott ~31단계(깊은 파이프 한계 사례):**
  https://www.tomshardware.com/reviews/intel,751-5.html.

## 낮은 신뢰도 / 주의 (본문 반영함)

- **분기 EX 해소 penalty "3 cycle" vs "ID로 줄여 1~2 cycle":** 교과서 가정에 따라 다름. MIPS는
  delay slot로 1 cycle화, 일반(non-MIPS) 케이스는 2~3 cycle → 본문은 "~3 cycle, MIPS는 ID로 1 cycle"로
  양쪽 명시. (LOW CONFIDENCE on 단일 수치)
- **Skylake 정확한 단계 수:** µop-cache 경로별로 ~14~19로 갈려 단정 불가 → 본문은 깊이를 "~규모"로만,
  penalty(15~20 cycle)만 인용. (LOW CONFIDENCE on 단계 수)
- **Pentium 4 penalty:** ~20~30+ cycle로 출처 편차 → 단계 수(31)만 사용, penalty 단정 안 함.
- **WebFetch 403:** 1차 PDF/위키 직접 인용 미확인 — 수치는 모두 ≥2 검색 출처 + 교과서로 교차확인.

## 데모 ↔ 사실

- `PipelineSpaceTime`: 5명령 × 5단계 space-time, cycle 5부터 5단계 동시 가동(throughput 1/cycle, latency 5).
- `HazardBubble`: lw→add load-use. forwarding(초록 MEM→EX)은 한 칸 미룬 뒤에야 닿음 = 1 bubble(빨강).
- `BranchFlush`: 얕은(5단계, flush 2) vs 깊은(16단계, flush 14) 막대 — flush 비용∝깊이(도식 대표값, 정확 수 아님).
