# 출처 — virtual-memory-tlb ("가상 메모리와 TLB")

WebSearch로 핵심 수치(페이지 테이블 레벨·페이지 크기·TLB 엔트리·walk 비용)를 교차검증(≥2 출처).
절대 cycle/엔트리 수는 세대 의존 → "Skylake 대표값"으로 귀속.

## 핵심 사실 ↔ 출처

- **x86-64 4-level (9·9·9·9·12), 각 테이블 512 엔트리, CR3 루트, 48-bit VA:**
  Intel SDM Vol.3 §4 ·
  https://wiki.osdev.org/Paging ·
  https://en.wikipedia.org/wiki/Intel_5-level_paging (4-level 배경)
- **5-level paging(LA57): PML5, 48→57-bit VA, 52-bit PA, CR4.LA57, Ice Lake+:**
  https://en.wikipedia.org/wiki/Intel_5-level_paging ·
  https://cdrdv2-public.intel.com/671442/5-level-paging-white-paper.pdf ·
  https://lwn.net/Articles/717293/
- **페이지 크기 4KB / 2MB(PD 멈춤) / 1GB(PDPT 멈춤):**
  Intel SDM Vol.3 §4 · OSDev Paging
- **page walk = 메모리 4회(캐시 안 됐을 때), PWC가 평균을 <1.5회로:**
  https://uu.diva-portal.org/smash/get/diva2:1633977/FULLTEXT02.pdf
  (PWC L4/L3 hit ~100%/98.6%; 평균 <1.5 access, 최악 random ~2.5; walk 수백 cycle;
  TLB miss에 CPU 10–93% 보고)
- **TLB 계층 L1 DTLB / L2 STLB, Skylake: L1 DTLB 4K 64엔트리(4-way), L2 STLB ~1536(12-way, I+D 공유):**
  https://dl.acm.org/doi/10.1145/3600089 (ISPASS류) ·
  https://www.cs.rochester.edu/u/sandhya/papers/ispass19.pdf ·
  Intel community TLB 스레드 + WikiChip Skylake
- **page fault: demand paging / copy-on-write / segfault(OS 처리):**
  Bryant & O'Hallaron CS:APP §9 ·
  https://en.wikipedia.org/wiki/Page_fault
- **VIPT(virtually indexed physically tagged), 변환·인덱싱 병렬, 크기 제약:**
  H&P (QA) ·
  https://en.wikipedia.org/wiki/CPU_cache#Address_translation
- **ASID(ARM)/PCID(x86)로 context switch 시 TLB flush 회피, flush 비용 수천 cycle:**
  https://www.abhik.ai/concepts/systems/virtual-memory ·
  arxiv "Skip TLB flushes..." https://arxiv.org/pdf/2409.10946 (전체 무효화 1000–5000 cycle)
- **KPTI/Meltdown로 TLB 압박, PCID로 완화:** Linux 커널 문서/일반 보안 자료(주의 표기).

## 낮은 신뢰도 / 주의 (본문에 반영함)

- **TLB 엔트리 수·연관도는 마이크로아키텍처별로 크게 다름** → 전부 "Skylake 대표값"으로 귀속,
  "세대·구현마다 다름" 명시. **낮은 신뢰도/주의.**
- **page walk 비용(메모리 4회 / 평균 <1.5회 / 수백 cycle)은 워크로드·시스템 의존** → 본문에
  "연구에 따라", "대표" 명시. PWC 정확 동작은 Intel 미공개라 학술 측정에 의존. **낮은 신뢰도/주의.**
- **TLB flush 비용 1000–5000 cycle, TLB miss 10–93%** 는 특정 논문 측정값 → 자릿수 감각용.
  **낮은 신뢰도/주의.**
- **VIPT는 L1에 흔하나 보편 강제 아님**(일부 캐시는 PIPT/aliasing 처리 별도) → "보통"으로 서술.
  **낮은 신뢰도/주의.**
- **huge page 단점(단편화·내부 낭비)·THP 동작**은 OS·설정 의존 → 개념 수준만. **낮은 신뢰도/주의.**

## 데모 ↔ 사실

- `PageWalkDiagram`: 48-bit VA = 9|9|9|9|12, CR3→PML4→PDPT→PD→PT→frame, "메모리 4회 접근" 강조.
  5-level은 캡션에서 언급.
- `TlbLookup`: VA → L1 DTLB(64) → L2 STLB(~1536) → page walk(PWC, 수십~수백 cycle) → TLB fill.
  수치는 Skylake 대표값으로 캡션에 귀속.
- `HugePageCoverage`: 엔트리 64개 고정으로 4KB(256KB) / 2MB(128MB) / 1GB(64GB) TLB reach 막대.
  엔트리 수·막대는 도식용(로그 직관)이라 캡션에 명시.
