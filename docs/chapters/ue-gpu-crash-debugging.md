# 핸드오프 노트 — 언리얼 GPU 프로파일링 & 크래시 디버깅

`slug: ue-gpu-crash-debugging` · section: `Unreal RHI`

## 목적과 범위

최신 언리얼 엔진(UE5+)의 **GPU 프로파일링 & 크래시 디버깅** 워크플로를, 글 + KaTeX 유도 +
**7개의 정적 도식(static figure)** 으로 이해시킨다. 1차 출처는 **Luke Thatcher (Epic) 발표**
(`docs/sources/ue-gpu-crash-debugging-talk.md`). 모든 그림·사실관계는 이 노트를 기준으로
검증·수정한다.

> **정적-우선 원칙(중요)**: 이 챕터는 그래픽스 *렌더링*이 아니라 GPU 하드웨어·드라이버·시스템·
> 엔진 내부를 다루는 **시스템 주제**다. AUTHORING-GUIDE §1의 경험칙대로, 이런 주제는 조작보다
> **명료한 다이어그램/플로우**가 더 적합하다. 그래서 **7개 위젯을 모두 정적 도식으로 전환**했다
> (이전 버전은 슬라이더·토글·버튼·rAF 애니메이션이 달린 인터랙티브였음). 각 위젯은 이제
> 대표값으로 캔버스를 **1회만** 그리고, 발표가 전하려는 메커니즘을 **in-figure 라벨/주석**으로
> 박아 둔다. 조작이 *과정을 진짜로 드러내는* 경우가 없어 **인터랙티브로 남긴 것은 없다.**

서사 아크(탐정극 유지): **왜 GPU 디버깅이 어려운가(2초 지연 훅)** → ① RHI Breadcrumbs →
② RHI Submit Pipeline → ③ Stat GPU → ④ Unreal Insights + 펜스/데드락 → ⑤ 크래시 원인
(TDR·Page Fault)과 워크플로 → ⑥ 크래시 리포트 자동화(조립) → 더 나아가기.

**의도적으로 멈춘 지점**: 모델은 개념적 단순화다. 그림의 시간 단위는 실제 ms가 아닌 비교용
상대값이고, 스케줄러는 작은 리스트 스케줄러다. 백엔드별(D3D12/Vulkan) 펜스·배리어·레지던시
정책 차이, RDG 내부, 실제 벤더 툴 디스어셈블리는 "더 나아가기"에서 포인터만 제시한다.

## 파일

- 챕터: `src/pages/chapters/ue-gpu-crash-debugging.mdx`
  - 프로즈는 정적 도식에 맞게 조정됨("직접 해보세요/만져 보세요" → "아래 그림은 …"). 탐정 서사와
    발표 충실도는 유지. frontmatter description의 "인터랙티브로" → "도식으로". 더 나아가기 끝의
    노트에 "정적-우선" 판단 근거를 한 문단 추가.
- 위젯·공용 유틸: `src/components/demos/ue-gpu-crash-debugging/`
  - `ue2d.ts` — 공용 2D 툴킷(`command-queues/cq2d.ts`에서 검증된 패턴 복사):
    `setupCanvas`(HiDPI dpr≤2), `readTheme`/`observeTheme`(테마 변수), `roundRect`,
    `drawArrow`, `pill`, `withAlpha`, `pointerToCanvas`, `UE_COLORS`(의미색 맵), `monoFont(px)`.
    *(정적 전환 후 `pill`/`pointerToCanvas`는 현재 미사용이지만 그대로 둠 — export-only, TS 에러
    없음. noUnusedLocals는 astro strict에 미포함.)*
  - `useCanvas2d.ts` — 픽셀-공간 캔버스 훅. **정적 도식에 그대로 적합**: 마운트 시 1회 그리고
    ResizeObserver/테마 변경 시에만 재드로우. 모든 위젯이 `useCanvas2d(draw, [])`로 호출(=정지).
  - `usePointerDrag.ts` — iOS-safe 네이티브 포인터 훅. **정적 전환 후 어디서도 import 안 함**
    (드래그 위젯이 없으므로). 삭제 가능하나 보존(향후 인터랙티브 확장용). TS 에러 없음.
- 핸드오프(이 파일): `docs/chapters/ue-gpu-crash-debugging.md`

> 이 챕터는 자기 `<slug>` 폴더 + mdx + 이 노트만 만진다. **`chapters.ts`는 직접 수정하지 않았다.**
> 오케스트레이터가 등록할 항목:
> `{ slug: 'ue-gpu-crash-debugging', title: '언리얼 GPU 프로파일링 & 크래시 디버깅', description: 'RHI breadcrumbs·새 제출 파이프라인·Stat GPU·Unreal Insights·TDR/page fault·크래시 리포트 자동화', section: 'Unreal RHI' }`

## 위젯 목록 (모두 **정적 도식** · 2D canvas · 컨트롤 없음 · in-figure 라벨로 결론을 박음)

| # | 컴포넌트 | 가르치는 개념 | 정적으로 만든 방법(고정한 대표 상태) |
|---|----------|---------------|--------------------------------------|
| 1 | `BreadcrumbTracer.tsx` | RHI Breadcrumbs: 패스마다 monotonic 정수 기록 | **BasePass(인덱스 2)에서 hang한 크래시 직후**를 정지. 버퍼에 1·2·3 기록 후 정지(나머지 슬롯은 점선 "기록 멈춤"), 배너에 "마지막 기록값 3 → BasePass에서 멈췄다" + "CPU: ~2초 뒤 인지" 라벨. |
| 2 | `SubmitPipelineTimeline.tsx` | 새 RHI Submit Pipeline(변환·제출·동기화) | 대표값 N=4·폴링지연=2로 **옛/새 간트를 위·아래 1회** 그림. 옛 모델은 빗금 폴링 버블, 두 makespan 자로 단축을 보임. 제목에 버블 합계 라벨. |
| 3 | `StatGpuDiagnoser.tsx` | Stat GPU Busy/Wait/Idle 진단 규칙 | **세 시나리오 패널을 한 화면에 세로로** 정지: ①그래픽스 Wait=문제(빨강), ②같은 양의 컴퓨트 Wait=정상, ③Idle>0=CPU bound. 각 패널 아래 **판정 라벨**이 결론. |
| 4 | `InsightsFenceTimeline.tsx` | Insights 멀티 큐 타임라인 + 펜스 화살표, 데드락 | **두 타임라인을 위·아래** 정지: (위) 정상=펜스 #42+latency 화살표→작은 wait 스톨+makespan, (아래) 순환=양방향 빨간 펜스 화살표(#41)+ "DEADLOCK" 판정 바(발표 예시 ②). |
| 5 | `TdrCountdown.tsx` | TDR 2초 타임아웃 | **같은 2초 축 위 두 막대** 정지: 1.2s 정상 완료(✅), hang(끝없이 길어지는 화살표)이 t=2.0s에서 TDR 강제 종료(⛔, 발표 예시 ①). 빨간 2.0s 마커. |
| 6 | `PageFaultViz.tsx` | Page Fault: 해제된 MIP 참조 | **발표 예시 ③을 그대로** 정지: 예산 1%로 MIP0~3 해제(MIP4만 resident), 셰이더가 해제된 MIP3 참조 → 빨간 page fault 화살표/테두리/판정. MIP별 비용(u) 라벨, Aftermath 언급. |
| 7 | `CrashReportPipeline.tsx` | 크래시 리포트 자동화(수집→해시→dedup→Jira) | 흐름 4단계(수집→해시→조회→카운트)를 가로로, **dedup 결과 테이블**을 빈도순 정렬로 정지. ×6 BasePass hash=Blocker가 맨 위(빨간 강조 "최우선"), 아래로 Critical/Major/Minor. FNV-1a 해시는 마운트 시 `useMemo`에서 1회 계산. |

## 기술 노트 · 단순화 · 알려진 한계

- **정적 렌더 패턴**: 모든 위젯이 `useCanvas2d(draw, [])`. 입력(상태) 없이 모듈 상수/`useMemo([])`만
  사용 → 마운트·리사이즈·테마 변경 시에만 그림. **putImageData 미사용**(전부 벡터 → AUTHORING
  §5.1 함정 회피). 테마 색은 `DrawCtx.theme`에서 읽어 라이트/다크 자동 적응. 의미색만 `UE_COLORS`.
- **제거한 것**: 모든 `ControlPanel`/`Slider`/`SelectControl`, 캔버스 밖 `Btn`, rAF 루프
  (Breadcrumb 진행·TDR 점멸), `setTimeout` 단계 애니(CrashReport). `useState`/`useEffect`/`useRef`
  도 전부 제거됨(grep로 0 확인). SSR 위험 코드 없음.
- **캔버스 높이**: ②④는 두 도식을 쌓아 **340→340 / 330→420**, ③은 3패널로 **300→420**.
  나머지는 유지(①330 ⑤320 ⑥320 ⑦340). ~360px 폭 기준 가로 오버플로 없게 컬럼 폭 계산.
- **PageFault 대표값**: 비용 `4^((L-1)-ℓ)` → 256:64:16:4:1, 합 341. 예산 1%(=3.41)면 작은 MIP4(1)만
  들어가고 MIP0~3 해제 → **MIP3 참조 시 page fault**(발표 예시 ③에 정확히 일치). 참조 MIP=3 고정.
- **StatGpu 시나리오 값**: ①gWait45/cWait20, ②gWait6/cWait55, ③gIdle35/cIdle30. ①②가 "같은 양의
  Wait, 다른 결론"을 직접 보이도록 의도적으로 대비. 판정은 발표의 정성 규칙을 그대로 텍스트로 박음.
- **CrashReport 해시**: FNV-1a 32비트 → 6자리 hex(결정적, SSR 안전). 우선순위 컷오프
  count≥5 Blocker / ≥3 Critical / ≥2 Major / else Minor.

## 검증 상태 / TODO

- **이 에이전트는 `npm run check`/`build`/`dev`/`git`/`npm install`을 돌리지 않았다**(작업 제약).
  → **오케스트레이터가 `npm run check`(astro check) + `npm run build`로 최종 검증** 필요.
- **눈으로 확인할 점**(브라우저, 라이트/다크 양쪽):
  - 7개 위젯이 모두 **정지 상태로 한 번에** 그려지고 컨트롤이 사라졌는지.
  - ③ StatGpu 3패널·④ Insights 2타임라인·⑤ TDR 2막대가 캔버스 높이 안에 **세로 오버플로 없이**
    들어가는지(가장 빡빡한 건 ③④의 420px). ~360px 폭에서 가로 잘림 없는지.
  - ① 마지막 기록값 3 → BasePass 라벨, ⑥ MIP3 빨간 fault, ⑦ ×6 Blocker 맨 위 정렬이 의도대로인지.
  - 긴 판정 텍스트(③④⑥⑦)가 좁은 폭에서 잘리는지(현재 한 줄 그리기 — 필요하면 줄바꿈/폰트 축소 보강).

## 서사·재미 의도

- **훅 유지**: "범인은 2초 전에 도망쳤고 목격자는 다들 입을 다물고 있다" — GPU 비동기성을 탐정극으로.
  첫 그림(Breadcrumb)이 곧바로 "흔적으로 범인 짚기"를 보여 답의 실마리를 줌.
- 각 §에서 **직관 → 수식(유도) → 그 양을 보여 주는 정적 그림** 순서 유지. 발표의 3가지 실제 사례
  (①TDR hang ②AsyncCompute 데드락 ③MIP3 page fault)를 위젯 5·4·6에 그대로 정지된 장면으로 박음.
- 정적 전환에 맞춰 프로즈의 콜투액션을 "아래 그림은 …을 나란히/한눈에 보여 준다"로 바꿔 도식이
  **본문 주장의 증명**(WRITING-CRAFT #11)이 되도록 함.

## 확장 방법

- 정적이 원칙이지만, 만약 *조작이 과정을 진짜로 드러내는* 한 곳을 고른다면 ④(펜스 방향을 끌어
  데드락을 만드는 것)뿐이다 — 그 외는 정적이 더 명료하다. 추가 시에도 ④ 하나만 인터랙티브로.
- RDG 패스 그래프 도식(토폴로지 정렬 + transient aliasing → page fault)을 더하면 §4와 §5.2를 잇는다.
- 벤더 툴(Aftermath) 출력 모사: page fault 주소·디스어셈블리 줄을 보여 주는 정적 패널.
- `usePointerDrag.ts`는 향후 인터랙티브 확장 대비 보존(현재 미사용).
