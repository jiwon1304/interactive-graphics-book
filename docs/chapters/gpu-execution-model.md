# 핸드오프 노트 — `gpu-execution-model` (GPU 실행 모델 — 워프와 락스텝)

## 목적과 범위

[`command-queues`](../../src/pages/chapters/command-queues.mdx)(명령 *제출*)의 **실행 짝**
챕터. "명령을 큐에 제출했다 — 그런데 GPU 칩 *안에서* 그 명령은 실제로 어떻게 실행되나?"라는
질문으로 연다. 가르치는 한 가지 핵심: **GPU는 스레드를 32개씩 워프로 묶어 락스텝(lockstep)으로
실행하며, 이 "32"가 코어 수·블록 크기·분기 비용 전부를 지배한다.**

다루는 범위(어디까지):
- SM/CU의 내부 구조(4 파티션, ALU 레인, SFU/LSU/텐서, 공유 메모리/L1).
- "CUDA 코어 = FP32 ALU 레인 하나"라는 용어 교정.
- 마케팅 코어 수 = 레인 × 파티션 × SM 곱셈 유도.
- 워프 = 32 스레드 락스텝, 블록→워프 분해($\lceil T/32 \rceil$), 활용률.
- SIMT = SIMD HW + HW 관리 per-lane predicate mask, 워프 다이버전스 비용.
- 한 디스패치가 그리드→블록→워프→명령으로 흐르는 조립, 지연 숨기기.

**멈춘 곳(범위 밖, "더 나아가기"로 포인터만):** 점유율/레지스터 압박의 정량 모델, 메모리
coalescing·뱅크 충돌, warp shuffle/subgroup 연산, 벤더 용어 사전. 이들은 후속 챕터 후보.

## 그림 목록 (전부 STATIC · 캔버스 글자 최소 · 설명은 figcaption)

이 챕터는 GPU **하드웨어 구조** 주제라(AUTHORING-GUIDE §1: 비-렌더링은 정적 도식이 낫다)
모든 그림이 **정적 2D 캔버스 도식**이다. 슬라이더·애니메이션·useState·rAF **없음**.
각 컴포넌트는 `useCanvas2d(draw, [])`로 대표 상태를 한 번만 그린다. 가르치는 건 **결과가
아니라 구조/메커니즘**(과정형).

1. **SmFloorplan.tsx** — 한 SM의 평면도. 4 파티션(각 워프 스케줄러·레지스터 파일·FP32×16
   그리드·INT/SFU/LSU·텐서) + 하단 공유 메모리/L1 + Tex. 캔버스 글자: 짧은 블록명만.
   **가르치는 한 가지:** SM은 단일 코어가 아니라 4개 독립 파티션으로 쪼개져 있고, "CUDA
   코어"는 파란 FP32 레인 하나일 뿐. (왜 여기: 다음 두 그림(코어 수·워프)의 전제가 되는
   구조를 먼저 세움.)
2. **CoreCountBuilder.tsx** — `32 × 4 × 144 = 18,432 CUDA 코어` 라벨 산수. 캔버스 글자:
   세 인자 박스(큰 수 + 2줄 단위) + 결과 박스. **가르치는 한 가지:** 마케팅 코어 수는
   신비한 측정값이 아니라 레인×파티션×SM 곱셈 한 줄. (본문 KaTeX에서 $128 = 32\times4$,
   $18432 = 128\times144$로 단계 유도.)
3. **WarpLockstep.tsx** — 단일 명령 박스(FMA) → 8열×4행=32 레인 그리드로 브로드캐스트
   화살표. 캔버스 글자: "1 instr", "→ 32 lanes", 레인 인덱스는 듬성듬성(0,7,15,23,31)만,
   나머지는 점. **가르치는 한 가지:** 워프=32 스레드 락스텝, 한 명령이 한 사이클에 32레인
   동시 실행. (본문: 256→8워프, 250→여전히 8워프(6레인 낭비), 33→2워프, 활용률 식, AMD 64폭.)
4. **SimtVsSimd.tsx** — 좌(SIMD 수동 마스크)·우(SIMT HW predicate) 두 패널. 같은 8레인이
   if/else 분기. then/else 행마다 활성=초록, 마스크 off=빨강 X. 캔버스 글자: 패널 제목 +
   then/else 라벨 + 짧은 코드 4줄. **가르치는 한 가지:** SIMT = SIMD 하드웨어 + HW가
   관리하는 per-lane predicate mask(프로그래머는 평범한 if/else만 쓴다). (본문: 다이버전스
   비용 $t_{then}+t_{else}$, "워프 내부에서만 비용", 그래픽스 적합성.)

## 기술 노트 / 단순화

- **자급자족 폴더**: `gem2d.ts`(setupCanvas/readTheme/observeTheme/ThemeColors + withAlpha/
  roundRect/drawArrow/monoFont/centerText/labelBox + COLORS) + `useCanvas2d.ts`는
  command-queues의 cq2d.ts/useCanvas2d.ts를 본떠 새로 만든 것(공유 import 없음, 병렬 충돌 방지).
- **숫자는 대표값**: 파티션당 32 FP32, SM당 4 파티션(=128/SM), 144 SM(≈RTX 4090/AD102),
  레지스터 16K×32b, 공유메모리 128KB는 Ada/Ampere 세대 라운드값. 세대마다 다름을 캡션/
  `<details>`에 명시. Ampere/Ada의 FP32+INT 겸용 레인 논란은 깔끔한 "32 FP32" 모델로 단순화
  (details에 각주).
- **HiDPI(§5.1)**: 전부 벡터 도식, `putImageData` 안 씀. setupCanvas가 dpr 변환 → CSS 픽셀로 직접 그림.
- **터치(§5.2)**: 정적이라 드래그 없음. 그래도 캔버스에 `touchAction:'none'` 인라인 + `.demo-canvas`.
- **테마**: 색은 readTheme로 CSS 변수에서 읽고 COLORS는 테마 무관 의미색(라이트/다크 양쪽 채도 확보).
  observeTheme로 테마 토글 시 자동 재드로우.
- **수학(유도)**: $\lceil T/W \rceil$(블록→워프), 활용률 $T/(W\lceil T/W\rceil)$,
  코어수 = 레인×파티션×SM, 다이버전스 $t_{then}\to t_{then}+t_{else}$. 전부 구체값으로 확인
  (256/250/33, 128, 18432).

## 서사/재미 의도

- **훅(정의 금지)**: "CUDA 코어 16,384개"라는 터무니없는 숫자로 시작 → CPU 코어와 비교해
  "뭔가 이상하다" → 환상 깨기로 이어짐.
- **직관 손잡이**: CUDA 코어=컨베이어 팔 하나, 워프=제식 행진 분대(구령 하나에 32명).
- **naive 실패 보이기**: "코어 18,432개면 18,432개 다른 일?" → 아니오(분대 576개). "33스레드면
  워프 1개?" → 아니오(2개, 31레인 낭비). predict-then-reveal로 배치.
- **2-독자 레이어링**: 본문은 직관·핵심 식, `<details>`에 (a) FP32만 세는 이유/Ampere 겸용,
  (b) AMD 웨이브프론트 64/Wave32, (c) Volta 독립 스레드 스케줄링·재수렴 — 깊은 독자용.
- **가장 헷갈리는 지점 박스**: "18,432 ≠ 자유로운 코어 18,432" 인용 박스로 콕 집음.

## 등록 항목 (오케스트레이터가 chapters.ts에 추가)

```ts
{
  slug: 'gpu-execution-model',
  title: 'GPU 실행 모델 — 워프와 락스텝',
  description: 'SM/CU 구조·코어 수의 정체·블록→워프 분해·SIMT와 락스텝',
  section: 'GPU 실행 모델',
}
```

배치 제안: 새 섹션 `GPU 실행 모델`로, 기존 `GPU 명령 제출`(command-queues) **다음**에 두면
"제출 → 실행" 서사가 사이드바에서도 자연스럽다. (`command-queues`를 같은 섹션으로 합쳐도 됨 —
취향. 현재는 command-queues가 'GPU 명령 제출' 섹션이라 그 바로 뒤 새 섹션으로 제안.)

## TODO / 확장

- 후속: 점유율·레지스터 압박, 메모리 coalescing, warp shuffle/subgroup — "더 나아가기"가 그 포인터.
- 브라우저 검증 권장(아래). 특히 narrow(모바일 ~360px)에서 SmFloorplan 4파티션 텍스트 겹침,
  CoreCountBuilder 박스 가로폭, WarpLockstep "→ 32 lanes" 라벨이 화살표 팬과 안 겹치는지.

## 브라우저 검증 체크리스트

1. 네 그림이 라이트/다크 양쪽에서 또렷한가(색·테두리 대비).
2. SmFloorplan: 2×2 파티션 안의 작은 라벨(워프 스케줄러/레지스터/FP32×16/INT·SFU·LSU/텐서)이
   안 겹치고 읽히는가. 좁은 폭에서 텍스트 클리핑 확인.
3. CoreCountBuilder: `32 × 4 × 144 = 18,432`가 한 줄에 들어오는가(좁은 폭에서 박스 겹침 여부).
4. WarpLockstep: 명령 박스→32레인 브로드캐스트 화살표 팬이 보이고, "→ 32 lanes" 라벨이
   화살표와 안 겹치는가. 인덱스 0/7/15/23/31만 라벨, 나머지 점.
5. SimtVsSimd: 두 패널이 나란히, 초록 활성/빨강 X 마스크가 then/else에서 반대인가.
6. 모바일 폭에서 캔버스가 안 깨지고 스크롤이 잘 되는가(정적이라 터치 드래그는 없음).
