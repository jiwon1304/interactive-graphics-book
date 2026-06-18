# 핸드오프 노트 — 언리얼 GPU 프로파일링 & 크래시 디버깅

`slug: ue-gpu-crash-debugging` · section: `Unreal RHI`

## 목적과 범위

최신 언리얼 엔진(UE5+)의 **GPU 프로파일링 & 크래시 디버깅** 워크플로를, 글 + KaTeX 유도 +
7개의 과정-중심 2D 인터랙티브로 이해시킨다. 1차 출처는 **Luke Thatcher (Epic) 발표**
(`docs/sources/ue-gpu-crash-debugging-talk.md`). 모든 위젯·사실관계는 이 노트를 기준으로
검증·수정한다. 출처와 모순되지 않는 선에서 정확한 배경(명령 큐, MIP 비용, 의존 그래프 등)을
보강했다.

서사 아크: **왜 GPU 디버깅이 어려운가(2초 지연 훅)** → ① RHI Breadcrumbs → ② RHI Submit
Pipeline → ③ Stat GPU → ④ Unreal Insights + 펜스/데드락 → ⑤ 크래시 원인(TDR·Page Fault)과
워크플로 → ⑥ 크래시 리포트 자동화(조립) → 더 나아가기.

**의도적으로 멈춘 지점**: 모델은 개념적 단순화다. 위젯의 시간 단위는 실제 ms가 아닌 비교용
상대값이고, 스케줄러는 작은 리스트 스케줄러다. 백엔드별(D3D12/Vulkan) 펜스·배리어·레지던시
정책 차이, RDG 내부, 실제 벤더 툴 디스어셈블리는 "더 나아가기"에서 포인터만 제시하고
다루지 않았다.

## 파일

- 챕터: `src/pages/chapters/ue-gpu-crash-debugging.mdx`
- 위젯·공용 유틸: `src/components/demos/ue-gpu-crash-debugging/`
  - `ue2d.ts` — 공용 2D 툴킷. `command-queues/cq2d.ts`에서 검증된 패턴을 복사:
    `setupCanvas`(HiDPI dpr≤2), `readTheme`/`observeTheme`(테마 변수), `roundRect`,
    `drawArrow`, `pill`, `withAlpha`, `pointerToCanvas`. **추가**: `UE_COLORS`(의미색 맵),
    `monoFont(px)`.
  - `useCanvas2d.ts` — `ue2d`에서 import하는 픽셀-공간 캔버스 훅(ResizeObserver + 테마 변경
    자동 재드로우). `command-queues` 버전과 동일.
  - `usePointerDrag.ts` — iOS-safe 네이티브 포인터 훅(verbatim 복사).
- 핸드오프(이 파일): `docs/chapters/ue-gpu-crash-debugging.md`

> 이 챕터는 자기 `<slug>` 폴더 + mdx + 이 노트만 만든다. **`chapters.ts`는 직접 수정하지
> 않았다**(병렬 작업 충돌 방지). 오케스트레이터가 등록할 항목:
> `{ slug: 'ue-gpu-crash-debugging', title: '언리얼 GPU 프로파일링 & 크래시 디버깅', description: 'RHI breadcrumbs·새 제출 파이프라인·Stat GPU·Unreal Insights·TDR/page fault·크래시 리포트 자동화', section: 'Unreal RHI' }`

## 위젯 목록 (모두 2D canvas · 과정 중심 · 컨트롤은 캔버스 밖 DOM)

| # | 컴포넌트 | 가르치는 개념 | 과정/결과 | 주요 파라미터 |
|---|----------|---------------|-----------|----------------|
| 1 | `BreadcrumbTracer.tsx` | RHI Breadcrumbs: 패스마다 monotonic 정수 기록 | **과정** — rAF로 6패스를 한 칸씩 진행, 버퍼가 자라남; 크래시 주입 시 마지막 기록값이 멈춘 패스를 지목. CPU는 ~2초 뒤 인지. | `크래시 주입`(SelectControl: 없음/패스별), 프레임 실행/리셋 버튼 |
| 2 | `SubmitPipelineTimeline.tsx` | 새 RHI Submit Pipeline(변환·제출·동기화) | **과정/비교** — 옛(단일 스레드+폴링 버블) vs 새(병렬 변환·전용 제출·인터럽트 동기화) 간트를 위·아래로 비교. 폴링 버블이 옛 makespan을 부풀림. | `커맨드 리스트 수`(2–8), `펜스 polling 지연`(0–5) |
| 3 | `StatGpuDiagnoser.tsx` | Stat GPU Busy/Wait/Idle 진단 규칙 | **과정(진단)** — 프리셋/슬라이더로 비율 조절 → 발표 규칙으로 결론 도출(그래픽스 Wait=문제 / 컴퓨트 Wait=정상 / Idle>0=CPU bound). | `시나리오`(SelectControl), 그래픽스/컴퓨트 Wait·그래픽스 Idle 슬라이더 |
| 4 | `InsightsFenceTimeline.tsx` | Insights 멀티 큐 타임라인 + 펜스 화살표, 데드락 | **과정** — 펜스 화살표(번호+latency)가 스톨·makespan을 만들고, 순환 의존을 고르면 두 큐가 데드락으로 얼어붙음(사례 ②). | `펜스 방향`(SelectControl, deadlock 포함), `펜스 latency`, G/C 작업 길이 |
| 5 | `TdrCountdown.tsx` | TDR 2초 타임아웃 | **과정** — 작업 길이 슬라이더 → 디스패치 시 경과 타이머가 2초 한계에 닿으면 OS가 강제 종료(빨간 점멸). hang 프리셋=사례 ①. | `작업 길이`(0.2–4초), 디스패치/행 시나리오/리셋 버튼 |
| 6 | `PageFaultViz.tsx` | Page Fault: 해제된 MIP 참조 | **과정** — 메모리 예산을 줄이면 비싼 고해상도 MIP부터 evict; 해제된 MIP을 참조하면 page fault(사례 ③). 벤더 툴(Aftermath) 언급. | `메모리 예산`(5–100%), `참조 MIP`(0–4) |
| 7 | `CrashReportPipeline.tsx` | 크래시 리포트 자동화(수집→해시→dedup→Jira) | **과정** — active 콜스택을 FNV-1a 해시→테이블 조회→신규/카운트++; 같은 크래시 반복 시 우선순위 Minor→…→Blocker로 상승·재정렬. | `크래시 종류`(SelectControl, 무작위 포함), 보고 도착/테이블 비우기 버튼 |

## 기술 노트 · 단순화 · 알려진 한계

- **공용 패턴**: `command-queues` 챕터를 구조적 형제로 삼아 복제했다. 캔버스는 `useCanvas2d`
  로 HiDPI(dpr≤2) 셋업, 모두 **벡터로 직접 그림**(putImageData 미사용 → AUTHORING-GUIDE
  §5.1 함정 회피). 테마 색은 `theme`(DrawCtx)에서 읽어 라이트/다크 자동 적응. 의미색만
  `UE_COLORS` 고정.
- **버튼 프리미티브 부재**: 컨트롤 툴킷에 버튼이 없어, 각 위젯이 캔버스 밖 DOM에 `Btn`
  (CSS 변수만 읽는 플레인 버튼, min-height 38)을 직접 정의한다. 위젯 3·4·6은 버튼이 없어
  `Btn` 미포함.
- **시간 단위**: 위젯 2·4는 추상 상대 단위(또는 비교용 ms 표기)로, 실제 엔진 타이밍이 아니다.
  위젯 2의 새 모델은 변환 워커 3개(라운드로빈), per-stage 비용 translate=3/submit=1/gpu=2로
  고정. 위젯 3의 진단 임계값(그래픽스 Wait≥25 → 문제, Idle≥12 → CPU bound)은 발표의 정성적
  규칙을 위한 합리적 컷오프다.
- **PageFault 비용**: `cost(MIPℓ)=4^((L-1)-ℓ)` → 256:64:16:4:1, 합 341. 예산 채우기는 작은
  MIP(높은 레벨)부터. 기본 예산 40%면 MIP0이 빠져 **기본 상태에서 이미 page fault**가 보이도록
  설계(참조 MIP 기본=0).
- **CrashReport 해시/난수**: FNV-1a 32비트 → 6자리 hex, 무작위 프리셋은 시드 LCG. 모두
  **핸들러/이펙트 안에서만** 계산(SSR 안전, §5.3).
- **데드락 도달성**: 위젯 4의 `펜스 방향` SelectControl에 `순환 의존 (deadlock)` 옵션이 있어
  사용자가 반드시 데드락을 직접 만들 수 있다(요구사항).
- **SSR/모바일**: 모든 rAF/타이머는 언마운트 시 취소. 캔버스 높이 300–340px, `touchAction:
  none`, 탭 타깃 ≥38px. `client:visible`로만 로드.

## 검증 상태 / TODO

- 한 writer가 자기 4개 위젯 작성 중 `tsc --noEmit`(read-only) 0 errors를 보고했다. 단,
  **병렬 빌드 충돌 방지를 위해 이 에이전트는 `npm run check`/`build`/`dev`/`git`를 돌리지
  않았다.** → **오케스트레이터가 중앙에서 `npm run check`(astro check) + `npm run build`로
  최종 검증**할 것. 특히 확인할 점:
  - mdx의 7개 import 경로와 `client:visible` 삽입.
  - `chapters.ts` 등록(위 항목) 후 사이드바/이전·다음/홈 목차 반영.
  - 라이트/다크 양쪽에서 캔버스 가독성, ~360px 폭에서 가로 오버플로 없음.
  - 위젯 1·5·7의 rAF/setTimeout 애니메이션이 모바일에서 부드러운지.

## 서사·재미 의도

- **훅**: "범인은 2초 전에 도망쳤고 목격자는 다들 입을 다물고 있다" — GPU의 비동기성을
  탐정극으로. 첫 위젯(Breadcrumb)이 곧바로 "흔적으로 범인 짚기"를 보여 주며 답의 실마리를 줌.
- 각 §에서 **직관 → 수식(유도) → 그 양을 만지는 위젯** 순서를 지킴: breadcrumb 단조성,
  옛 makespan의 폴링 버블 $N\Delta$, Busy/Wait/Idle 분해, 펜스 의존 그래프의 사이클=데드락,
  TDR 임계 규칙, MIP 비용 4배 법칙, dedup의 $O(\text{리포트}) \to O(\text{고유 버그})$ 압축.
- 발표의 3가지 실제 사례(①TDR hang ②AsyncCompute 데드락 ③MIP3 page fault)를 각각 위젯
  5·4·6에 프리셋/시나리오로 박아 두어 "발표에서 본 그 사건"을 손으로 재현하게 함.

## 확장 방법

- 위젯 4를 사용자가 블록을 끌어 펜스를 직접 거는 방식으로 키우면 더 깊은 과정이 된다(현재는
  방향 SelectControl로 데드락 도달성을 보장하는 단순형).
- RDG 패스 그래프 위젯(의존성 토폴로지 정렬 + transient aliasing → page fault)을 추가하면
  §4와 §5.2를 잇는 다리가 된다.
- 벤더 툴(Aftermath) 출력 모사: page fault 주소·디스어셈블리 줄을 보여 주는 패널.
