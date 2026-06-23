# 출처 — branch-prediction ("분기 예측")

리서치 에이전트가 WebSearch로 수집·교차검증(WebFetch는 다수 호스트 403 → 검색 스니펫 + 1차
논문 메타데이터로 교차확인). 다툼 소지 수치는 ≥2 출처. 절대 cycle/정확도는 워크로드·환경 의존이라
"범위/대표값"으로 서술.

## 핵심 사실 ↔ 출처

- **예측 동기(분기 미해소 시 fetch stall, 깊을수록 비쌈):** H&P *Quantitative Approach* Ch.3 ·
  https://www.sciencedirect.com/topics/computer-science/branch-prediction.
- **static: always-T/N, BTFNT(backward-taken/forward-not-taken):**
  https://en.wikipedia.org/wiki/Branch_predictor.
- **2-bit saturating counter(bimodal), 4상태·hysteresis, 원전 J.E. Smith 1981 ISCA:**
  https://www.cs.cmu.edu/afs/cs/academic/class/15740-s18/www/lectures/16-branch-prediction.pdf ·
  https://www.cis.upenn.edu/~cis5710/spring2024/slides/10_branchprediction.pdf.
- **BHT/PHT=방향(counter, PC 인덱스) vs BTB=목적지 주소+tag:**
  https://www.sciencedirect.com/topics/computer-science/branch-target-buffer ·
  https://www.cse.iitk.ac.in/users/biswap/CS422/L9-BP.pdf.
- **two-level(global GHR vs local) Yeh & Patt 1991/92:**
  https://dl.acm.org/doi/10.1145/146628.139709.
- **gshare = PC ⊕ GHR (McFarling 1993, gselect=concat보다 aliasing↓):**
  https://american.cs.ucdavis.edu/academic/readings/papers/mcfarling.pdf.
- **TAGE = TAgged GEometric history length(Seznec), 여러 history 길이·tag, CBP 표준; TAGE-SC-L CBP-5(2016) 우승:**
  https://www.cs.cmu.edu/~18742/papers/Seznec2011.pdf · https://jilp.org/cbp2014/paper/AndreSeznec.pdf ·
  https://team.inria.fr/alf/members/andre-seznec/branch-prediction-research/.
- **최신 예측기 MPKI 한 자릿수(~2~4), 많은 워크로드 >99% 정확:**
  https://jilp.org/cbp2014/paper/AndreSeznec.pdf · https://arxiv.org/pdf/1906.08170 ("not a solved problem").
- **misprediction penalty ~15~20 cycle(Skylake), 깊이 비례:**
  https://www.agner.org/optimize/microarchitecture.pdf · https://xania.org/201602/bpu-part-two (Godbolt).
- **branchless/cmov: control→data dependency, 양쪽 계산·의존 사슬↑, 예측 낮을 때 유리(경험칙 ~75%):**
  https://en.algorithmica.org/hpc/pipelining/branchless/ · https://kristerw.github.io/2022/05/24/branchless/.
- **Spectre v1(bounds check bypass, CVE-2017-5753): 예측기 훈련→경계검사 투기적 우회→캐시 side channel:**
  https://spectreattack.com/spectre.pdf · https://docs.kernel.org/admin-guide/hw-vuln/spectre.html.

## 낮은 신뢰도 / 주의 (본문 반영함)

- **static 정확도 "60~70%":** 단일 정전 수치 없음, 워크로드·출처 편차 → 범위로 서술. (LOW CONFIDENCE)
- **Smith 2-bit "1981 ISCA":** 출처는 일관되게 Smith 귀속하나 1차 PDF로 연도/venue 직접 확인은 못 함 →
  본문은 "J. E. Smith 1981"로만, 인쇄 전 1차 확인 권장.
- **misprediction "16~17 cycle":** Agner Fog 실측은 15~20 범위 → 본문은 범위로 인용.
- **cmov ~75% 임계:** 하드 상수 아닌 컴파일러 경험칙 → "휴리스틱"으로 명시.
- **">99% 정확도":** 워크로드 의존 → MPKI(2~4)와 함께·"풀린 문제 아님" 단서 병기.
- **WebFetch 403:** 1차 논문 verbatim 미확인 — 모두 ≥2 검색 출처로 교차확인.

## 데모 ↔ 사실

- `TwoBitFSM`: 4상태 세로 스택, T↑/N↓ 포화, hysteresis(강→약만 바뀜) 시각화.
- `BhtBtb`: PC가 BHT(방향 2-bit)와 BTB(target+tag) 두 표를 동시 인덱싱, 둘 다 IF에서 즉답.
- `GshareIndex`: 8-bit 예시로 PC ⊕ GHR → PHT index(전역 문맥별 다른 counter). 비트열은 도식용 예시값.
