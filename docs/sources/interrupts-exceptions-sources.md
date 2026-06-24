# 출처 — interrupts-exceptions ("인터럽트와 예외")

WebSearch/WebFetch로 수집·교차검증. 메커니즘(IDT 게이트·예외 분류·APIC/MSI·top/bottom half)은
Intel SDM 정리(osdev wiki·Wikipedia·MIT 6.828 강의노트)와 Linux 문서/LWN로 ≥2 출처 교차확인했다.
절대 수치(cycle·µs·"N배")는 환경·세대 의존이라 "자릿수/대표값"으로만 귀속하고 hedge.

## 핵심 사실 ↔ 출처

- **예외 분류 fault/trap/abort — 저장된 IP 의미가 다름(fault=재시작 가능, 폴팅 명령 자체를 가리킴;
  trap=다음 명령을 가리킴, 재시작 X; abort=치명적, 재시작 불가):**
  https://wiki.osdev.org/Exceptions ·
  https://www.microcontrollertips.com/exceptions-traps-and-interrupts-whats-the-difference-faq/ ·
  https://pdos.csail.mit.edu/6.828/2005/lec/lec8-slides.pdf
- **예외 벡터(0~31 고정): #DE=0(divide, fault), #DB=1(debug, fault/trap), #BP=3(breakpoint, trap),
  #UD=6(invalid opcode, fault), #DF=8(double fault, abort, 에러코드 0), #GP=13(general protection,
  fault, 에러코드), #PF=14(page fault, fault, 에러코드 + CR2), #MC=18(machine check, abort):**
  https://wiki.osdev.org/Exceptions ·
  https://en.wikipedia.org/wiki/Interrupt_descriptor_table
- **IDT: interrupt gate vs trap gate의 유일한 차이는 IF 플래그 — interrupt gate는 진입 시 IF를 클리어
  (추가 maskable 인터럽트 차단), trap gate는 IF 유지. 둘 다 EFLAGS 저장 후 TF 클리어:**
  https://en.wikipedia.org/wiki/Interrupt_descriptor_table ·
  https://www.scs.stanford.edu/nyu/04fa/lab/i386/s09_06.htm (Intel 매뉴얼 9.6) ·
  https://xem.github.io/minix86/manual/intel-x86-and-64-manual-vol3/o_fe12b1e2a880e0ce-200.html
- **인터럽트 컨트롤러 진화: 8259 PIC(IRQ0-7 8 라인 + 캐스케이드 15), APIC = LAPIC(CPU 내장,
  P5/P54C 이후) + I/O APIC(시스템 버스). LAPIC가 멀티프로세서 라우팅을 가능케 함:**
  https://en.wikipedia.org/wiki/Advanced_Programmable_Interrupt_Controller ·
  https://habr.com/en/articles/446312/
- **MSI/MSI-X: 전용 신호선 없이 시스템 버스로 "메시지(주소+데이터 쓰기)"를 보냄 → LAPIC가 수신.
  라인 공유 없음(디바이스마다 고유 벡터), I/O APIC를 대체 가능, LAPIC 필요. Intel 연구상 MSI가
  I/O APIC보다 ~3배, PIC보다 ~5배 빠름(대표 수치):**
  https://en.wikipedia.org/wiki/Advanced_Programmable_Interrupt_Controller ·
  https://habr.com/en/articles/446312/
- **top half / bottom half: top half=request_irq로 등록된 ISR(짧게·즉시), bottom half=나중에 안전한
  시점에 실행되도록 스케줄. 메커니즘: softirq, tasklet(softirq 위에 구현, 한 번에 한 CPU),
  workqueue(kworker 커널 스레드, process context, sleep 가능):**
  https://www.oreilly.com/library/view/understanding-the-linux/0596002130/ch04s07.html ·
  https://thinkty.net/general/2024/04/29/bottom_half.html ·
  https://github.com/firmianay/Life-long-Learner/blob/master/linux-kernel-development/chapter-8.md
- **bottom half 지연(측정값, 대표): softirq median ≈ 4.0µs, tasklet ≈ 4.7µs, workqueue ≈ 24.1µs
  (work item이 softirq·tasklet 뒤에 실행되어 지연·jitter 큼):**
  https://www4.cs.fau.de/Publications/2018/herzog_18_sbesc.pdf (INTSPECT, FAU)
- **폴링 vs 인터럽트 트레이드오프(고빈도 이벤트에서는 NAPI식 폴링 전환이 인터럽트 폭주보다 유리):**
  https://www.oreilly.com/library/view/understanding-the-linux/0596002130/ch04s07.html ·
  본 책 내부 일반 지식(Linux NAPI 개념).

## 크로스링크 (본 책 내부 챕터)

- 트랩 메커니즘 공유: ./system-calls
- 인터럽트가 깨우는 스케줄러·컨텍스트 전환: ./os-scheduling-context-switch

## 낮은 신뢰도 / 주의 (본문에 반영함)

- **"MSI가 PIC보다 5배 / I/O APIC보다 3배"**는 Intel 인용 대표 수치 — 워크로드·세대 의존. 본문은
  "대략", "Intel 인용 대표값"으로 hedge.
- **bottom half 지연 µs 값**은 특정 하드웨어/커널(FAU INTSPECT 측정)의 median → "자릿수/대표값"으로만.
  workqueue가 softirq보다 한 자릿수 느리다는 *순서*가 핵심.
- **#DB(debug)**는 원인에 따라 fault 또는 trap으로 동작 — 본문은 "조건에 따라"로 표기.
- **예외 벡터 번호**는 x86 고정값이지만 다른 ISA(ARM 등)는 다름 — 본문은 x86 기준임을 명시.
- 실제 Linux는 x86-64에서 IDT 엔트리를 대부분 interrupt gate로 깔고, IST(Interrupt Stack Table)로
  #DF·#MC·NMI 등 별도 스택을 씀 — 세부는 개요 수준만 다룸.
