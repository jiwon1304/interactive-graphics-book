# 출처 — demand-paging ("페이지 폴트와 디맨드 페이징")

리서치 에이전트가 웹 검색으로 수집·교차검증. OSTEP/대학 강의노트(Cornell CS4410, Wisconsin
CS537, UMass) + Linux VM 분석 글 + Wikipedia를 교차확인. (세션 중 일부 origin이 WebFetch 403 →
복수 검색 스니펫으로 교차확인.)

## 핵심 사실 ↔ 출처

- 디맨드 페이징: 가상 주소를 예약(reserve)해도 물리 프레임은 **처음 접근(touch)할 때** 할당.
  mmap는 즉시 포인터만 돌려주고, 실제 할당은 첫 page fault 때 일어남:
  https://offlinemark.com/demand-paging/ ·
  https://rahalkar.dev/posts/2025-03-16-linux-virtual-memory-mmap-page-faults/
- minor(soft) fault: 디스크 I/O 없이 해결(zero page 할당, page cache에 이미 있는 페이지 매핑,
  COW 복제). major(hard) fault: 디스크/스왑에서 읽어야 함:
  https://linuxvox.com/blog/linux-will-zeroed-page-pagefault-on-first-read-or-on-first-write/ ·
  https://biriukov.dev/docs/page-cache/5-more-about-mmap-file-access/
- invalid fault → SIGSEGV: 폴트 주소가 어떤 VMA에도 속하지 않으면(스택 확장 가능 범위도 아니면)
  커널이 SIGSEGV를 보냄. Intel 매뉴얼의 "invalid page fault"가 userspace에선 SIGSEGV:
  https://blog.cloudflare.com/why-is-there-a-v-in-sigsegv-segmentation-fault/ ·
  https://en.wikipedia.org/wiki/Segmentation_fault ·
  https://medium.com/@xinyijun/cause-analysis-of-segmentation-fault-on-linux-1d69e59bb0e3
- 폴트 처리 3단계: ① CPU가 page fault 예외 발생 ② 커널이 VMA 조회→프레임 확보→PTE 갱신
  ③ 폴트 일으킨 명령을 **재시작(restart)**:
  https://medium.com/@xinyijun/cause-analysis-of-segmentation-fault-on-linux-1d69e59bb0e3
- 익명 메모리 첫 **읽기**는 read-only로 공유되는 system-wide **zero page**에 COW 매핑되고,
  첫 **쓰기** 때 비로소 실제 프레임을 할당·복사:
  https://linuxvox.com/blog/linux-will-zeroed-page-pagefault-on-first-read-or-on-first-write/
- fork 후 부모/자식이 페이지를 read-only로 공유, 한쪽이 쓰면 그 페이지만 복제(COW). 파일 백킹의
  MAP_PRIVATE도 같은 COW로 page cache 공유 유지:
  https://offlinemark.com/demand-paging/ ·
  https://biriukov.dev/docs/page-cache/5-more-about-mmap-file-access/
- mmap: file-backed(page cache 통해 매핑) vs anonymous(swap이 백킹), MAP_SHARED vs MAP_PRIVATE:
  https://biriukov.dev/docs/page-cache/5-more-about-mmap-file-access/ ·
  https://rahalkar.dev/posts/2025-03-16-linux-virtual-memory-mmap-page-faults/
- clock(second-chance) 교체: reference/use bit를 hardware가 접근 시 set, OS가 주기적으로 clear.
  원형 리스트의 hand가 돌며 use=1이면 0으로 내리고 second chance, use=0이면 victim. LRU의 근사:
  https://www.cs.cornell.edu/courses/cs4410/2017su/lectures/lec14-replacement.html ·
  https://pages.cs.wisc.edu/~bart/537/lecturenotes/s20.html ·
  https://www.cs.utexas.edu/~witchel/372/lectures/16.PageReplacementAlgos.pdf
- working set W(t,Δ): 최근 Δ 시간 동안 참조된 페이지 집합. 합이 가용 프레임보다 크면 thrashing:
  https://www.cs.cornell.edu/courses/cs4410/2018su/lectures/lec15-thrashing.html ·
  https://lass.cs.umass.edu/~shenoy/courses/fall13/lectures/Lec15_notes.pdf
- thrashing 대응: 프로세스 일부 suspend/kill로 multiprogramming degree 낮춤:
  https://www.cs.cornell.edu/courses/cs4410/2018su/lectures/lec15-thrashing.html

## 데모 ↔ 사실

- `FaultFlow`: 접근→PTE present? →(minor/major/invalid) 분기→프레임 확보·PTE 갱신→명령 재시작.
- `CowDiagram`: fork 직후 부모·자식이 같은 프레임 공유(read-only) / 한쪽 쓰기 후 그 페이지만 복제.
- `ClockReplace`: 원형 프레임 + use bit, hand 위치, victim 선정 한 컷.

## 낮은 신뢰도/주의 (본문 반영)

- "minor/major" 용어와 Linux의 정확한 분류 경계는 글마다 미묘하게 다름 → 본문은 "디스크 I/O 유무"를
  기준으로 단정하고, swap-in을 major의 예로 둠. major fault에 디스크 I/O가 따른다는 점만 단정.
- zero page COW 동작은 Linux 특정 구현(`ZERO_PAGE`) → "Linux에서는"으로 한정. 다른 OS는 다를 수 있음.
- clock 변형(2-handed clock, NRU의 dirty bit 조합, Linux의 active/inactive LRU 리스트)은 본문에서
  "근사·변형이 많다"로 hedge하고 second-chance 1-hand를 대표로 그림.
- TLB/HW page walk는 이 챕터에서 다루지 않음(virtual-memory-tlb로 cross-link, 중복 회피).
</content>
</invoke>
