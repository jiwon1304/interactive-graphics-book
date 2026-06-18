# (출처 노트) 최신 언리얼 엔진의 GPU 프로파일링과 크래시 디버깅

> 강연 정리 노트. **Luke Thatcher (Epic Games)** 발표를 참고. (원문 스크린샷은 여기 포함 안 됨.)
> `ue-gpu-crash-debugging` 챕터의 1차 출처 자료. 집필/수정 에이전트는 이 내용을 기준으로 작성·검증한다.

## GPU 디버깅의 어려움
- GPU 크래시가 발생해도 CPU가 인식하는 건 약 **2초 뒤**.
- 알 수 없는 것들이 많음 — 특히 **compute**는 추적이 어렵다.

## 최신 RHI 개선사항

### RHI Breadcrumbs
- 렌더링이 진행되는 동안 각 **렌더 패스에서 흔적(breadcrumb)** 을 남김.
- 내부에 버퍼를 두고 **integer 값을 계속(monotonic) 기록**.
- 어느 패스에서 크래시났는지 확인 가능.
- 매크로로 추적: **Scope, RDG event scope, RHI breadcrumb, RDG pass name**.
- 통합·일관성: **Stat GPU, Profile GPU, Unreal Insights가 모두 RHI Breadcrumb 위에서 동작**.
  스레드·GPU에서 이름이 일정하게 유지됨.

### RHI Submit Pipeline
- Graphics 파이프라인은 큐로 진행되는데 **Fence로 블로킹** → 유휴 상태(**bubble**).
- 기존 RHI Thread는 한 스레드에 역할이 너무 많았음:
  - 제한적인 병렬 처리.
  - Fence가 **polling 방식**이라 즉각적 반응이 어려움.
- 그래서 **RHI 제출 파이프라인**을 추가:
  - **변환(Translate)**: 여러 스레드에서 RHI 커맨드를 **병렬 변환**.
  - **제출(Submit)**: 전용 스레드가 GPU 큐에 **빠르게 제출**(배칭 등).
  - **동기화(Sync)**: **인터럽트 스레드**가 GPU 펜스에 **즉시 반응**(polling X). 크래시도 마찬가지로 즉시 인지.

## GPU 프로파일링

### Stat GPU
- **Busy / Wait / Idle** 상태 제공.
  - graphics에서 **Wait**이면 문제 (compute는 wait이 정상).
  - **Idle > 0 : CPU bound**.

### Unreal Insights
- CPU·GPU 작업을 **동일한 타임라인**에서 제공.
- GPU의 **graphics queue / compute queue**에 대한 busy/wait/idle 시각화.
- **fence arrow**: multi-queue 상황에서 순서를 따라갈 수 있음.
  - fence number 표기.
  - **latency** 표기 = signal을 받았을 때부터 GPU shader를 준비하고 실제 커널을 런치하는 때까지의 시간.
- GPU interruption → CPU interrupt thread → thread interrupt.
- 기존 **immediate cmdlist**를 쓰면 **병렬 변환 불가**(single thread only).

## GPU 크래시 디버깅
- CPU는 크래시 즉시 멈춰 콜스택을 주지만, **GPU는 늦게 멈추고** 스레드가 많아 찾기 어려움.

### 주요 원인
- **TDR (timeout)**: OS가 정한 시간 내 미완료 시 프로세스 종료 (Windows = **2초**).
- **Page Fault**: 해제됐거나 아직 올라오지 않은 리소스에 접근.

### 디버깅 전 기본 점검(sanity check)
- 그래픽 드라이버 최신화, background 프로세스 정리, GPU 메모리 사용량 확인, 재현용 개발환경 점검.

### 디버거 켜기
- 실행 인자: `-gpucrashdebugging` `-gpubreadcrumbs` (약 **2MB 공유 메모리** 사용).

### 재현 조건 단순화 (플래그 끄기)
- `-onethread`: 멀티스레드 렌더링 타이밍 제거.
- `-rdgimmediate`: RDG 병렬/비동기 끄기.
- `-d3ddebug`: 검증 레이어 켜기.

### 실제 크래시 해결 흐름
- breadcrumbs를 켜서 **active 단계**를 찾음 → 거기서 크래시 발생.
- 예시 1: 잘못된 주소 참조 → 큰 수로 루프 → **행(hang)** → OS가 프로세스 종료(TDR).
- 예시 2: **AsyncCompute가 active** → 확인해보니 **Graphics 큐의 펜스를 대기 중** → **deadlock**.
- 예시 3: **MIP3가 없는데 참조** → **page fault** (메모리 부족으로 해제됐는데 접근).
  - MIP 접근/페이지 폴트 주소 등 정보는 **벤더 소프트웨어** 사용 (NVIDIA = **Aftermath**).

### 크래시 리포트 자동화
1. 문제 보고가 들어오면 전체 로그가 아니라 **active 상태였던 콜스택만** 수집.
2. 콜스택을 **hashing** 해서 상황을 unique하게 식별.
3. 이미 리포트된 콜스택이면 **카운트 증가** → Jira에서 중요도 상승.
