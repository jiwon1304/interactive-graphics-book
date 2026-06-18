# 챕터 핸드오프: 명령 큐와 동기화

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
  테마 변경 감시(`observeTheme`), 포인터→캔버스 좌표(`pointerToCanvas`), 색 보조
  (`withAlpha`, 의미색 상수 `QUEUE_COLORS` = graphics 파랑/compute 보라/copy 청록/
  ok 초록/bad 빨강/stall 주황), 그리기 보조(`roundRect`, `drawArrow`, `pill`).
- `useCanvas2d.ts` — **픽셀 공간** 2D 위젯 공용 훅(raymarching판과 달리 좌표 매퍼 없음).
  HiDPI 셋업 + ResizeObserver + 테마 변경 재드로우 + deps 변경 재드로우. `draw({ctx,w,h,theme})`.
- `usePointerDrag.ts` — iOS Safari 안전 네이티브 포인터 드래그(raymarching-sdf와 동일 패턴의
  **사본**; 챕터 폴더 자기완결성을 위해 복사). 시그니처 동일(`onDown/onMove/onUp/onHover/onLeave`).

모든 위젯: 캔버스 `className="demo-canvas"` + `touchAction:'none'`, 컨트롤은 `<Canvas>` 밖
DOM(`ControlPanel` + `Slider`/`ToggleControl`/`SelectControl`), 버튼 프리미티브가 없어
플레인 `<button>`을 CSS 변수로만 스타일링(테마 적응). `QUEUE_COLORS`는 라이트/다크 공통 의미색.

## 위젯별 정리 (의도적 배치 — 개념이 도입되는 그 자리)

### 1. CommandLifecycle.tsx — 과정 (record→submit→execute) · 1절
- **개념**: 명령의 세 단계와 **비동기 갭**. 3레인(CPU 기록 / 큐 / GPU 실행), 명령을 기록·제출,
  GPU가 큐를 **FIFO로 드레인**. 제출 ≠ 실행을 눈으로 보게 함.
- **PROCESS/RESULT**: PROCESS.
- **상호작용**: "명령 기록"(Draw→Dispatch→Copy→Clear 순환), "제출"(열린 리스트→큐, 점선 배치),
  "한 칸 실행"(수동 step), "자동 실행" 토글(RAF, commands/sec 슬라이더), "리셋". 읽기값:
  열린 리스트/큐 대기 배치/GPU 완료 수.
- **드라이브**: 자동 실행 시 RAF가 진행도를 슬라이더 속도로 전진, `queue[0]`에서 FIFO 드레인.

### 2. FenceFramesInFlight.tsx — 과정 (펜스 + frames-in-flight) · 2절 (챕터의 심장)
- **개념**: 펜스(단조 카운터)로 CPU↔GPU 동기화. 슬롯 `k mod N` 규칙 `fence ≥ k−N+1`로 CPU가
  GPU를 N프레임까지 앞섬. 처리량·레이턴시·메모리 삼각 트레이드오프.
- **PROCESS/RESULT**: PROCESS.
- **상호작용**: SelectControl N(1/2/3/4), Slider CPU/GPU 프레임 시간(ms), 재생/속도, 리셋.
  주황 해치=스톨, 펜스 큰 숫자 틱, 초록 점선 화살표=GPU완료→CPU언블록(펜스 시그널).
  읽기값: 펜스 값, CPU/GPU 롤링 stall %, 측정 레이턴시.
- **시뮬 모델(중요·정확)**: `simulate(N,cpu,gpu,60)`이 `cpuFree/gpuFree`로 60프레임 사전
  계산(파라미터 변경 시만). CPU는 `gpuExecEnd[k−N]` 대기, GPU는 `max(gpuFree, cpuEnd)` 대기.
  펜스=`gpuExecEnd ≤ now` 개수, 레이턴시=`cpuRecorded − fence`. now를 RAF로 흘리고 끝에서 0 루프.
- **교육 비트**: N=1 핑퐁(양쪽 스톨), N≥2 오버랩, GPU-bound면 레이턴시→N, CPU-bound면 GPU 기아.

### 3. TimelineSemaphoreGater.tsx — 과정 (큐↔큐 순서, happens-before) · 3절
- **개념**: 세마포어=큐↔큐(펜스=CPU↔GPU와 대비). 타임라인 값으로 happens-before 못박기
  (P가 v 시그널, Q가 ≥v 대기 ⇒ P≺Q). 이진 세마포어는 v∈{0,1} 특수경우.
- **PROCESS/RESULT**: PROCESS.
- **상호작용**: 두 큐 타임라인(그래픽스 G0/G1/G2, 컴퓨트 C0/C1). Slider "C1 대기 임계값 W"(0..3),
  SelectControl 어느 G가 시그널하는지/시그널 값, 재생/속도, 캔버스 위 "▲ 시각(t)" 스크럽 드래그.
  주황 스톨=동기화 비용, 초록 점선=G1→C1 happens-before. W=0이면 빨간 "준비 전 읽기" 경고.
- **교육 비트**: W=0 read-too-early 해저드 → W 올려 C1 대기 → 스톨이 곧 GPU 유휴(비용).

### 4. HazardChecker.tsx — 과정 (RAW/WAR/WAW + 올바른 배리어) · 4절
- **개념**: 같은 리소스 연속 두 연산의 세 해저드와, 그걸 막는 배리어(src/dst 스테이지+접근,
  이미지면 레이아웃 전이). 명시적 API는 자동으로 안 넣어줌 = 정확성은 사용자 몫.
- **PROCESS/RESULT**: PROCESS(정확성 체커).
- **상호작용**: SelectControl 시나리오 (RAW write→read[레이아웃 전이 필요] / WAW / WAR).
  하단 BARRIER 토큰을 A/B 틈으로 **드래그**(usePointerDrag) 또는 토글. "src/dst 단계·접근 지정"·
  "레이아웃 전이 포함" 토글. 검증 결과 pill(✗ 해저드 / ✗ 레이아웃 누락 / ✓ 해저드 없음) + 정밀 사유.
- **체커 진리표(정확)**: 배리어 없음/단계 미지정 → 해당 해저드. RAW+배리어+단계지만 레이아웃 누락
  → `missingLayout`. (레이아웃 포함 || 비RAW) → ok. ok일 때만 B 카드 리소스 상태 칩이 새
  레이아웃으로 전이(교육 비트).

### 5. BarrierStageScope.tsx — 과정 (배리어=스코프, 과/저동기화) · 4절
- **개념**: 배리어는 "벽"이 아니라 파이프라인 스테이지 **범위**. srcStage="앞 명령이 이 단계까지
  도달", dstStage="뒤 명령을 이 단계부터 막음". 너무 넓으면 직렬화(오버랩 죽음), 좁으면 해저드.
- **PROCESS/RESULT**: PROCESS.
- **상호작용**: 좌우 스테이지 사다리(producer/consumer), 그래픽스 순서
  `TOP_OF_PIPE→VERTEX_SHADER→EARLY_FRAGMENT_TESTS→FRAGMENT_SHADER→COLOR_ATTACHMENT_OUTPUT→BOTTOM_OF_PIPE`.
  왼쪽 src 핸들·오른쪽 dst 핸들 **드래그**. SelectControl 3개 시나리오, "전체 배리어" 토글.
- **체커(정확)**: `covered = (src ≥ writeStage) && (dst ≤ readStage)`,
  `over = max(0,src−write) + max(0,read−dst)`. over=0이면 tight, >0이면 과동기화 N단계.

### 6. AsyncOverlapTimeline.tsx — 과정+결과 (멀티 큐 오버랩 이득·비용) · 5절
- **개념**: 독립 작업을 다른 큐에 올리면 GPU에서 동시 실행(async 컴퓨트가 노는 ALU 메움).
  교차 큐 의존은 세마포어 대기=스톨(동기화 비용). `순이득=오버랩 절감−스톨`.
- **PROCESS/RESULT**: PROCESS(블록 탭으로 스케줄 재구성)+RESULT(makespan/절감 수치).
- **상호작용**: 5패스 Gantt(그래픽스/컴퓨트 2레인). 패스 블록을 **탭**해 큐 전환(usePointerDrag
  히트테스트). Slider SSAO·Lighting 길이, ToggleControl "교차 큐 의존(세마포어)", 리셋.
  점선 세마포어 화살표 C-SSAO→G-Lighting, 주황 스톨, 페이드 직렬 기준선, makespan 자.
- **스케줄러(정확)**: 큐 내 FIFO 직렬, 큐 간 동시. 의존(라이팅←SSAO)은 두 패스가 다른 큐일 때만
  적용. 손검증: 기본 직렬18/makespan11/39%절감, SSAO 길게+의존 시 스톨3→makespan14.
- **교육 비트**: 전부 그래픽스=0%, 컴퓨트 옮기면 makespan↓, 의존 켜면 스톨이 절감 갉아먹음,
  SSAO 키우면 오버랩이 더는 이득 아님.

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
