# 챕터 핸드오프: 명령 큐와 동기화

> **2026-06-18 개정 — 정적화(static-first):** 이 챕터는 **비-렌더링 시스템 주제**(GPU 명령 제출·
> 동기화·API)다. AUTHORING-GUIDE §1의 정제된 원칙("렌더링은 인터랙티브가 맞고, 그 외 시스템 주제는
> 대개 정적 다이어그램이 낫다")에 따라 **위젯 6개를 전부 정적 도식으로 전환**했다. 각 위젯이 "라이브
> 조작이 정적 라벨 그림으로는 못 주는 과정을 진짜로 드러내는가?"를 따졌고, 6개 모두 **NO**였다 —
> 타임라인/도식은 잘 고른 한 스냅샷 + 직접 그린 라벨/주석이 슬라이더·스크럽·드래그보다 더 또렷하다.
> 전환 내용: `ControlPanel`/`Slider`/`ToggleControl`/`SelectControl` 제거, rAF 애니메이션 제거,
> `useState`/포인터 드래그 제거, `usePointerDrag.ts` **삭제**, `cq2d.ts`의 `pointerToCanvas` 제거.
> 시뮬/체커 로직은 **그대로 보존**하되 대표 고정값으로 한 번만 그린다. 모든 위젯은 여전히
> `useCanvas2d`로 테마 인식·HiDPI 정확(§5.1 함정 회피)·리사이즈/테마 변경 재드로우를 유지한다.
> (정적이어도 `client:visible`은 그대로 — 테마 변수를 읽으려면 클라이언트에서 1회 그려야 한다.)

- **slug**: `command-queues`
- **section**: `GPU 명령 제출` (이 책 GPU 하드웨어/저수준 API 영역의 **첫 챕터**, 이후 ~110개 GPU 챕터의 템플릿)
- **mdx**: `src/pages/chapters/command-queues.mdx`
- **데모 디렉터리**: `src/components/demos/command-queues/`
- **등록**: `src/chapters.ts`에 `GPU 명령 제출` 섹션 첫 항목으로 추가 완료(렌더링 섹션 뒤).

## 챕터 목적 / 범위

현대 명시적 API(**D3D12·Vulkan**, Metal·WebGPU 보주)에서 CPU가 GPU에 일을 시키는
**명령 제출 + 동기화** 메커니즘을 다룹니다. 핵심 메시지: "`draw()`는 함수 호출이 아니라
종이에 명령을 적는 것"이고, CPU/GPU(그리고 여러 큐)는 서로 다른 시계로 도는 두 일꾼이라
그 **시간 간격**을 다루는 네 도구 — **큐·펜스·세마포어·배리어** — 가 필요하다는 것.

"엄밀함"은 강제 수식이 아니라 **정확한 동기화 의미론**(happens-before, 타임라인 값),
**비용 모델**(CPU 오버헤드, frames-in-flight 레이턴시 vs 메모리, 오버랩 절감 vs 스톨),
**정확성 해저드**(RAW/WAR/WAW, 레이아웃 전이)로 잡았습니다. 한 챕터로 응집(분할 안 함).

**다루는 범위**: 큐/큐 패밀리, record→submit→execute 생명주기, 펜스 & N frames-in-flight,
타임라인 세마포어 & happens-before, 파이프라인 배리어(src/dst 스테이지+접근, 레이아웃 전이,
스코프), 멀티 큐 async 오버랩(이득·비용). **멈춘 곳**: 스플릿 배리어/이벤트, 배리어 배칭,
Enhanced Barriers/synchronization2의 정밀 마스크, 멀티 GPU는 7절에서 "더 나아가기"로만 언급.

## 공용 유틸 (위젯 6개가 공유)

> 이 챕터 위젯은 모두 **2D 캔버스 타임라인/도식**입니다(3D 없음). 따라서 raymarching-sdf의
> SDF 씬 매퍼(x∈[-2,2])가 아니라 **픽셀 공간**에 직접 그립니다. 이를 위해 별도 헬퍼를 둠.

- `cq2d.ts` — HiDPI 캔버스 셋업(`setupCanvas`, dpr 상한 2), 테마 색 읽기(`readTheme`),
  테마 변경 감시(`observeTheme`), 색 보조(`withAlpha`, 의미색 상수 `QUEUE_COLORS` = graphics 파랑/
  compute 보라/copy 청록/ok 초록/bad 빨강/stall 주황), 그리기 보조(`roundRect`, `drawArrow`, `pill`).
  (정적화 후 `pointerToCanvas`는 쓰는 곳이 없어 제거함.)
- `useCanvas2d.ts` — **픽셀 공간** 2D 위젯 공용 훅(raymarching판과 달리 좌표 매퍼 없음).
  HiDPI 셋업 + ResizeObserver + 테마 변경 재드로우 + deps 변경 재드로우. `draw({ctx,w,h,theme})`.
  정적 도식은 `useCanvas2d(draw, [])`로 호출 — 마운트 시 1회 그리고, 리사이즈/테마 변경 때만 다시 그린다.
- ~~`usePointerDrag.ts`~~ — **삭제됨**(정적화로 드래그가 사라짐). 후속 GPU 챕터에서 드래그가
  다시 필요하면 raymarching-sdf의 `usePointerDrag.ts`를 사본으로 가져오면 된다(이전과 동일 패턴).

모든 위젯: 캔버스 `className="demo-canvas"`, `<figure className="demo">` 안에 캔버스 + `figcaption`.
컨트롤(`ControlPanel`/`Slider`/`Toggle`/`Select`)·버튼은 정적화로 **전부 제거**. `QUEUE_COLORS`는
라이트/다크 공통 의미색. AsyncOverlap만 캔버스 아래에 작은 읽기용 수치 줄(직렬/makespan/절감/스톨)을 둠.

## 위젯별 정리 (전부 정적 도식 — 정적화 후)

> 6개 전부 **STATIC**. 아래 "왜 정적이면 충분한가"가 곧 판단 근거다(라이브가 정적 라벨 그림으로
> 못 주는 과정을 드러내지 못함). 시뮬/체커/스케줄러 **로직은 보존**하고 대표 고정값으로 한 번 그린다.

### 1. CommandLifecycle.tsx — STATIC · 1절
- **개념**: 명령의 세 단계(record→submit→execute)와 **비동기 갭**. 제출 ≠ 실행.
- **정적 도식**: 3레인 스냅샷 — ① CPU 열린 리스트(Draw, Clear) ② 큐에 제출된 배치 #1[Draw,Dispatch]/
  #2[Copy,Draw]가 FIFO 대기(점선 묶음, "← 먼저 꺼냄") ③ GPU가 배치 #1의 한 명령(Dispatch, 55%
  진행) 실행 중 + 완료 history 2개. ①→②(제출)·②→③(드레인) 흐름 화살표와 라벨.
- **왜 정적이면 충분한가**: "제출했지만 아직 실행 안 됨, 큐에 FIFO로 쌓임"은 **한 장면의 공간 배치**로
  완전히 전달된다. 명령을 하나씩 눌러 쌓는 과정은 같은 그림을 손으로 재현할 뿐 새 통찰이 없다.

### 2. FenceFramesInFlight.tsx — STATIC (2개 비교 패널) · 2절
- **개념**: 펜스(단조 카운터)로 CPU↔GPU 동기화. 슬롯 `k mod N` 규칙 `fence ≥ k−N+1`. 처리량·
  레이턴시·메모리 삼각 트레이드오프.
- **정적 도식**: **N=1 vs N=3을 세로로 나란히**(둘 다 cpu=gpu=8 ms, 같은 ms→px 스케일, 0..56 ms 창).
  N=1은 주황 해치 스톨이 번갈아 = 핑퐁, 펜스 박스 **3**. N=3은 두 레인이 겹쳐 거의 꽉 참, 펜스 박스
  **6**(같은 창에서 2배 처리량). 초록 점선 = 펜스 시그널(스톨을 푸는 순간, N=1 패널에 표시).
- **시뮬(보존·정확)**: `simulate(N,8,8,8)`. CPU는 `gpuExecEnd[k−N]` 대기, GPU는 `max(gpuFree,cpuEnd)`.
  펜스 = `gpuExecEnd ≤ 56` 개수.
- **왜 정적이면 충분한가**: 핵심 통찰은 "N을 키우면 두 레인이 겹친다"인데, **N=1과 N=3을 동시에
  나란히 두는 정적 비교**가 시간을 흘려보내며 N 슬라이더를 바꾸는 것보다 오히려 더 직접적이다.
  (GPU≫CPU 레이턴시→N 수렴은 figcaption 한 문장으로 언급.) **이 챕터에서 가장 인터랙티브를 고민한
  위젯**이지만, 비교-정적이 더 또렷하다고 판단.

### 3. TimelineSemaphoreGater.tsx — STATIC · 3절
- **개념**: 세마포어=큐↔큐. 타임라인 값으로 happens-before 못박기(P가 v 시그널, Q가 ≥v 대기 ⇒ P≺Q).
- **정적 도식**: 고정 설정 **G1이 값 2 시그널 / C1은 ≥2 대기**, 스케줄 종료 시점 1컷. G1 끝(t=3.0)에
  signal 2 마커(초록 점), C1은 자연 시작(1.3)부터 G1 끝(3.0)까지 **주황 스톨** 후 실행. G1→C1 초록
  점선 "happens-before". 타임라인 값 카운터 v=2(틱 0..3), `C1: wait ≥ 2` 알약. W=0 위험은 caption으로.
- **왜 정적이면 충분한가**: 의존이 한 작업을 "붙잡아 두는" 구조는 **스톨 구간 + 화살표**라는 정적
  주석으로 완결된다. 스크럽으로 값이 차오르는 걸 보는 건 같은 그림을 시간축으로 훑을 뿐.

### 4. HazardChecker.tsx — STATIC · 4절
- **개념**: RAW/WAR/WAW 세 해저드와 그걸 막는 배리어(src/dst 스테이지+접근, 이미지면 레이아웃 전이).
- **정적 도식**: 대표로 **RAW(렌더 타깃→샘플)** 1컷에 **올바른 배리어**를 그림 — A 카드(write,
  COLOR_ATTACHMENT) → BARRIER(세로 막대, `COLOR_ATTACHMENT_OUTPUT/WRITE ▸ FRAGMENT_SHADER/READ`,
  레이아웃 `COLOR_ATTACHMENT_OPTIMAL ▸ SHADER_READ_ONLY_OPTIMAL`) → B 카드(read, 새 레이아웃 칩).
  우상단 `✓ 해저드 없음`. **하단에 두 실패 모드를 텍스트로**: ① 배리어 없음 → RAW 해저드, ② 레이아웃
  누락 → 쓰레기 샘플. (체커 `evaluate` 진리표는 정적화로 제거 — 정답 1컷만 그림.)
- **왜 정적이면 충분한가**: 원래는 드래그-퀴즈(맞히기)였는데, 가르치려는 것은 "올바른 배리어의 구성과
  두 실패 모드"라는 **사실**이다. 정답 + 실패 주석을 직접 라벨로 보여주는 게 더 빠르고 확실하다.

### 5. BarrierStageScope.tsx — STATIC · 4절
- **개념**: 배리어 = 파이프라인 스테이지 **범위**. srcStage="앞 명령이 이 단계까지 도달", dstStage=
  "뒤 명령을 이 단계부터 막음". 너무 넓으면 직렬화(오버랩 죽음), 좁으면 해저드.
- **정적 도식**: 시나리오 고정 **RT→샘플링**(쓰기=COLOR_OUTPUT, 읽기=FRAGMENT)에서 **tight한 정답
  스코프**(src=COLOR_OUTPUT, dst=FRAGMENT) 1컷. 좌 사다리 src 이하 주황 음영(+"↑ 안 기다림"),
  우 사다리 dst 이상 파랑 음영(+"↓ 먼저 진행 가능"), 빨간 "실제 쓰기"/초록 "실제 읽기" 강조,
  초록 커버 화살표. 하단에 tight vs 전체 배리어(과동기화) 비교 주석.
- **체커(보존·정확)**: `covered = (src ≥ write) && (dst ≤ read)`, `over = max(0,src−write)+max(0,read−dst)`
  관계 자체는 그림이 보여줌(여기선 over=0). 핸들은 드래그 불가 — 위치 표시 점으로만.
- **왜 정적이면 충분한가**: "딱 맞는 스코프"의 모양은 **음영 + 강조 테두리 + 화살표**로 한눈에 보인다.
  드래그로 어긋나게 해보는 건 figcaption의 "너무 넓으면/좁으면" 문장이 대신한다.

### 6. AsyncOverlapTimeline.tsx — STATIC · 5절
- **개념**: 독립 작업을 다른 큐에 올리면 동시 실행(노는 ALU 메움). 교차 큐 의존 = 세마포어 대기 = 스톨.
- **정적 도식**: 대표 스케줄 **컴퓨트 패스(C-SSAO/C-Particles)는 컴퓨트 레인 + 교차 큐 의존 ON** 1컷.
  고정 길이: shadow=3, gbuffer=3, ssao=8, particles=3, lighting=4(스톨이 또렷이 보이게 고름).
  위 "직렬 기준선"(faded) vs 아래 두 레인 간트, C-SSAO→G-Lighting **세마포어 점선 + 주황 스톨**,
  초록 makespan 자. 캔버스 아래 수치 줄: **직렬 21 / makespan 12 / 절감 9(43%) / 스톨 2**.
- **스케줄러(보존·정확)**: 큐 내 FIFO 직렬, 큐 간 동시, 의존(lighting←ssao)은 다른 큐일 때만 적용.
  손검증: graphics[shadow 0–3, gbuffer 3–6, lighting **8–12**(ssao 신호 8 대기 → stall 2)],
  compute[ssao 0–8, particles 8–11]. makespan=12, serial=21, stall=2. (수치는 caption 아래 줄에 라이브 계산.)
- **왜 정적이면 충분한가**: "오버랩이 이득을 주다가 의존 스톨이 갉아먹는다"는 메시지는 **한 장에 직렬
  기준선 + 겹친 스케줄 + 스톨**을 같이 두면 다 보인다. 블록을 탭해 옮기는 건 그 결론을 손으로 재현할 뿐.

## 기술 노트 / 단순화

- 모든 시뮬은 **개념 전달용 결정론적 모델**입니다(실제 드라이버 스케줄러와 1:1 아님).
  특히 FenceFramesInFlight는 CPU/GPU 프레임 시간을 상수로 두고, AsyncOverlap은 정수 길이의
  고정 패스 5개에 단일 의존만 둡니다. 의도는 트레이드오프의 **방향과 메커니즘**을 정확히 보이는 것.
- HazardChecker/BarrierStageScope의 검증 로직은 **논리적으로 정확**하게 작성(교육-정확성 위젯).
  단계 이름/시나리오는 대표 사례로 한정(그래픽스 사다리 1종).
- 수식은 KaTeX(mdx에서만). `.tsx` 캡션엔 `$...$` 미사용(유니코드/평문). 펜스 규칙
  `fence ≥ k−N+1`, happens-before, 커버/과동기화 식, `순이득=절감−스톨`이 본문 하이라이트.
- HiDPI: 벡터/타임라인이라 `putImageData` 안 씀 → `setupCanvas`의 dpr 변환 ctx에 직접 벡터로
  그림(§5.1 함정 회피). 드래그는 `usePointerDrag`(iOS), 캔버스 `touch-action:none`.
- `astro/tsconfigs/strict` 사용(`noUncheckedIndexedAccess`는 strictest에만 있어 off). `any` 없음.

## 인터랙션 / 몰입 의도

- 훅: "`draw()`를 호출하면 삼각형이 그려진다? — 사실이 아니다." 시간 간격을 모든 것의 출발점으로.
- 서사 골격: **간격 → (언제 끝났나)펜스 → (큐 순서)세마포어 → (재정렬 길들이기)배리어 →
  (간격을 이득으로)오버랩 → 한 프레임 조립**. 각 절이 다음 위젯의 질문을 던지고 답하게 배치.
- 각 위젯 아래 figcaption에 **"직접 해보세요"** + "놀라운 포인트"(N=1 핑퐁, W=0 read-too-early,
  레이아웃 누락 2차 실패, 과동기화 손해, 오버랩이 안 갚는 지점).

## 한계 / TODO / 확장

- 이 챕터는 GPU 영역의 **첫 챕터이자 템플릿**입니다. 후속 GPU 챕터는 이 `cq2d.ts`/`useCanvas2d.ts`/
  `usePointerDrag.ts` 픽셀-공간 2D 타임라인 패턴을 재사용/일반화하면 됩니다(필요시 공용 위치로 승격).
- **확장 아이디어**: 스플릿 배리어(시작/끝 분리)로 그 사이 일을 채우는 위젯, 배리어 배칭 비교,
  실제 GPU 타임스탬프 쿼리로 스톨 측정하는 사례, present/스왑체인 세마포어 체인 시각화.
- **관련 토픽**: 렌더 패스/서브패스(배리어 자동화), 디스크립터/바인딩, 파이프라인 상태 객체(PSO),
  GPU 메모리/힙·서브얼로케이션, 멀티 GPU(AFR/SFR).
- `usePointerDrag.ts`는 raymarching-sdf 사본 — 만약 공용 훅으로 추출하면 양쪽을 함께 갱신할 것.
