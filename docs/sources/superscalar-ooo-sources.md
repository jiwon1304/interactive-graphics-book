# 출처 — superscalar-ooo ("슈퍼스칼라와 비순차 실행")

리서치 에이전트가 WebSearch로 수집·교차검증(WebFetch는 다수 호스트 403 → 검색 스니펫 + 1차
논문/교과서 교차확인). 다툼 소지 수치는 ≥2 출처. 마이크로아키텍처별 내부 수치는 귀속하고,
리버스 엔지니어링 추정은 명시.

## 핵심 사실 ↔ 출처

- **superscalar=multiple issue, IPC>1; in-order superscalar(원조 Pentium 2-wide) vs OoO superscalar:**
  H&P *Quantitative Approach* Ch.3 ·
  https://acg.cis.upenn.edu/milom/cis501-Fall10/lectures/07_superscalar.pdf ·
  https://www.sciencedirect.com/topics/computer-science/superscalar-processor.
- **OoO=dataflow 실행(피연산자 준비 시), in-order retire/commit:**
  https://cseweb.ucsd.edu/classes/wi13/cse240a/pdf/07/CSE240A-MBT-L13-ReorderBuffer.ppt.pdf · H&P Ch.3.6.
- **renaming은 WAR/WAW(name dep) 제거, RAW(true) 못 없앰; Tomasulo IBM 360/91(1967); ARF vs PRF:**
  https://en.wikipedia.org/wiki/Register_renaming · https://en.wikipedia.org/wiki/Tomasulo%27s_algorithm ·
  http://www.eecs.umich.edu/courses/eecs470/papers/RegisterRenaming_Sima.pdf (Sima IEEE Micro) ·
  https://people.ee.duke.edu/~sorin/ece252/lectures/4.2-tomasulo.pdf.
- **reservation station: 피연산자 대기, CDB 방송으로 wake-up; unified(Skylake) vs distributed(Zen/Tomasulo):**
  https://en.wikipedia.org/wiki/Reservation_station ·
  https://en.wikichip.org/wiki/intel/microarchitectures/skylake_(client).
- **ROB: in-order retire·precise exception·speculation 복구(squash):**
  https://cseweb.ucsd.edu/classes/wi13/cse240a/pdf/07/CSE240A-MBT-L13-ReorderBuffer.ppt.pdf · H&P Ch.3.6.
- **speculation: 예측 경로 미리 실행→ROB 보류→맞으면 commit/틀리면 squash:** 위 ROB 출처.
- **ILP 한계(Wall), basic block ~5~10 명령, 지속 IPC ~1~2:**
  https://www.eecs.harvard.edu/cs146-246/wall-ilp.pdf · https://bitsavers.org/pdf/dec/tech_reports/WRL-TN-15.pdf · H&P Ch.3.
- **Skylake: 4-wide decode/rename/retire, ROB 224, ~8 exec port, unified scheduler ~97, PRF 180(int)/168(vec):**
  https://en.wikichip.org/wiki/intel/microarchitectures/skylake_(client) ·
  https://chipsandcheese.com/p/skylake-intels-longest-serving-architecture ·
  https://www.csl.cornell.edu/courses/ece4750/2016f/handouts/ece4750-section-skylake.pdf.
- **Apple M1 Firestorm: ~8-wide decode, ROB ~600+, int PRF ~350 (리버스 엔지니어링 추정):**
  https://dougallj.github.io/applecpu/firestorm.html · https://www.anandtech.com/show/16226/apple-silicon-m1-a14-deep-dive/2.
- **x86-64 = 16 architectural GPR:** https://en.wikipedia.org/wiki/X86-64.

## 낮은 신뢰도 / 주의 (본문 반영함)

- **Apple M1 내부 수치 전부 리버스 엔지니어링** (Apple 미공개). ROB는 단일 ROB가 아니라 retire
  queue + reclaim table에 가까운 비표준 구조 → 본문에 "~600+ 느슨한 어림수, 추정"으로 명시. (LOW CONFIDENCE)
- **Skylake scheduler 97 entry:** 논리 크기. 일부 자료는 물리적 split(58+39) → "unified, 최대 97"로 서술.
- **Wall "지속 IPC ~1~2":** Wall 원문은 *parallelism* 상한(이상적 가정에선 더 큼)을 다룸 → 본문은
  "limited ILP/수확 체감"은 Wall, "지속 IPC ~1~2"는 H&P 룰오브섬으로 귀속. (MEDIUM confidence on 수치)
- **WebFetch 403:** 1차 논문/위키 verbatim 미확인 — 모두 ≥2 검색 출처로 교차확인.

## 데모 ↔ 사실

- `InOrderVsOoO`: load 미스 시 in-order는 독립 명령도 줄섬 vs OoO는 독립 명령 먼저 실행해 지연 메움.
  cycle 수는 도식용 예시(정확 미스 지연 아님).
- `RegisterRenaming`: r1 재사용 → I3가 I1과 WAW·I2와 WAR(가짜). 물리 p11 배정으로 제거. RAW(p10)는 유지.
- `OoODataflow`: front-end(in-order) → RS(피연산자 준비 순 실행, 비순차) → ROB(head부터 in-order retire) 스냅샷.
