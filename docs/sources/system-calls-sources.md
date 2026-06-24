# 출처 — system-calls ("시스템 콜과 user/kernel 경계")

WebSearch/WebFetch로 수집·교차검증. syscall ABI·MSR·vDSO·비용은 LWN, Linux 커널 문서/insides,
Wikibooks(x86 ABI), Brendan Gregg(KPTI 측정)로 ≥2 출처 교차확인. cycle·µs는 세대 의존이라
"자릿수/대표값"으로 hedge.

## 핵심 사실 ↔ 출처

- **보호 링: ring 0(커널) / ring 3(유저)만 실질 사용. 모드 전환은 트랩 명령으로만 통제된 진입점을 통해:**
  https://lwn.net/Articles/604515/ ·
  https://thecodinggopher.substack.com/p/understanding-user-mode-and-kernel
- **x86-64 syscall ABI: 번호=rax, 인자=rdi, rsi, rdx, r10, r8, r9(6개), 반환=rax.
  (주의: 함수 호출 규약의 4번째 인자는 rcx지만 syscall은 r10을 씀 — syscall이 rcx를 덮어쓰기 때문):**
  https://en.wikibooks.org/wiki/X86_Assembly/Interfacing_with_Linux ·
  https://www.cs.uaf.edu/2017/fall/cs301/lecture/11_17_syscall.html ·
  https://lwn.net/Articles/604515/
- **32비트 레거시 int 0x80: 번호=eax, 인자=ebx, ecx, edx, esi, edi, ebp, 반환=eax:**
  https://en.wikibooks.org/wiki/X86_Assembly/Interfacing_with_Linux ·
  https://www.cs.uaf.edu/2017/fall/cs301/lecture/11_17_syscall.html
- **syscall 하드웨어 동작(롱모드): RCX ← RIP(복귀주소), R11 ← RFLAGS, RIP ← LSTAR MSR,
  SFMASK로 RFLAGS 마스킹, CS/SS는 STAR에서. 즉시 ring 0 진입. sysret는 RCX→RIP, R11→RFLAGS 복원:**
  https://blog.slowerzs.net/archive/linux-kernel-syscalls/ ·
  https://wiki.osdev.org/SYSENTER ·
  https://kdlp.underground.software/articles/syscalls_end_to_end.html
- **MSR: LSTAR(0xC0000082)=커널 진입 RIP, STAR(0xC0000081)=CS/SS 셀렉터, SFMASK(0xC0000084)=
  진입 시 클리어할 RFLAGS 비트. 부팅 시 wrmsr로 설정:**
  https://wiki.osdev.org/SYSENTER ·
  https://blog.slowerzs.net/archive/linux-kernel-syscalls/
- **커널 진입 시 swapgs로 per-CPU 데이터 베이스(GS) 교체 → 유저 rsp 저장 후 커널 스택으로 전환.
  하드웨어는 스택을 자동 전환하지 않음(int와 달리) → 소프트웨어가 함:**
  https://blog.slowerzs.net/archive/linux-kernel-syscalls/ ·
  https://events.static.linuxfound.org/sites/events/files/slides/entry-lce.pdf (Borislav Petkov, SUSE) ·
  https://0xax.gitbooks.io/linux-insides/content/SysCall/linux-syscall-2.html
- **트랩 명령 종류: 64비트 syscall(AMD 도입), 32비트 sysenter(Intel), 레거시 int 0x80. Linux는
  __kernel_vsyscall(vDSO)이 CPU에 맞는 최적 메커니즘을 고름:**
  https://www.cs.uaf.edu/2017/fall/cs301/lecture/11_17_syscall.html ·
  https://man7.org/linux/man-pages/man7/vdso.7.html
- **vDSO: 커널이 유저 주소공간에 매핑하는 ELF 공유 라이브러리. gettimeofday/clock_gettime/getcpu/
  time 등 read-only 콜을 커널 진입 없이 유저공간에서 처리(커널이 비동기 갱신하는 공유 메모리 읽기 +
  rdtsc). 매핑은 ASLR로 무작위화:**
  https://man7.org/linux/man-pages/man7/vdso.7.html ·
  https://github.com/torvalds/linux/commit/2aae950b21e4bc789d1fc6668faf67e8748300b7 ·
  https://berthub.eu/articles/posts/on-linux-vdso-and-clockgettime/
- **null syscall(getpid 등) 비용 ≈ 70~100 cycle(현대 CPU, 핸들러 본체 제외, 명령 자체 진입/복귀):**
  https://howtech.substack.com/p/dissecting-the-syscall-instruction ·
  https://www.brendangregg.com/blog/2018-02-09/kpti-kaiser-meltdown-performance.html
- **KPTI(Meltdown 완화): 모드 전환마다 페이지테이블 전환/TLB flush로 syscall당 ~30~70 cycle 추가,
  syscall-heavy 워크로드에서 20~30% 저하 가능. PCID 지원 시 완화:**
  https://www.brendangregg.com/blog/2018-02-09/kpti-kaiser-meltdown-performance.html
- **libc 래퍼 + errno: libc가 syscall 명령을 감싸고, 반환값이 음수(-4095~-1)면 errno 설정 후 -1 반환:**
  https://lwn.net/Articles/604515/ ·
  https://en.wikibooks.org/wiki/X86_Assembly/Interfacing_with_Linux

## 크로스링크 (본 책 내부 챕터)

- 트랩 메커니즘 공유(예외·인터럽트와 같은 진입 경로): ./interrupts-exceptions
- 모드 전환 비용의 큰 부분인 TLB/페이지테이블: ./virtual-memory-tlb

## 낮은 신뢰도 / 주의 (본문에 반영함)

- **"null syscall 70~100 cycle"**은 CPU·마이크로아키텍처 의존 대표값 → "자릿수"로만. KPTI on/off로
  크게 변동(브렌던 그레그 측정: KPTI off 시 <130 cycle, on 시 최대 수백 cycle).
- **KPTI 20~30% 저하**는 syscall-heavy 워크로드 한정 — 일반 워크로드는 훨씬 작음. 본문에 조건 명시.
- **sysenter/sysret vs syscall/sysret 세부**(32 vs 64비트, Intel vs AMD 출신)는 개요 수준만. sysenter는
  복귀주소를 레지스터에 저장하지 않아 유저측 규약이 다름 — 깊이는 생략.
- **vDSO가 처리하는 콜 목록**은 아키텍처·커널 버전 의존(예: x86-64는 4개 안팎) → "대표 목록"으로.
- **errno 음수 범위 -4095**는 커널 관례(MAX_ERRNO) — 본문은 "음수 = 에러 코드" 수준으로 단순화.
