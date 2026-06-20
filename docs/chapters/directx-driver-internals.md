# 핸드오프 — DirectX 드라이버 내부 (slug: `directx-driver-internals`)

섹션: **GPU 명령 제출** (command-queues 다음). 작성: 2026-06.
스타일: **비유 금지 + 전공자 대상**(사용자 명시). 용어는 영어/발음 유지(UMD/KMD/PSO/DDI/barrier 등).

## 1차 출처 (사용자 지시: 공식 문서/전문가 글 기반 작성·검수)
- **출처 노트: `docs/sources/directx-driver-internals-sources.md`** — 모든 핵심 주장의 근거(Microsoft
  Learn WDDM/DDI 문서, DirectX-Specs, Loggini/agraphicsguynotes 등)와 URL이 정리돼 있다. 수정 전
  반드시 읽을 것.
- **검수 시 교차확인된 수정**: 초안은 "VidMM이 GPU VA를 패치"라며 WDDM 1.x(물리주소+patch list)와
  WDDM 2.0(per-process GPUVA, patch 제거)을 혼동 → **세대 구분으로 수정**(§1·§2 본문, WddmStack·
  DrawCallPath figcaption/라벨). 근거: *GPU Virtual Memory in WDDM 2.0* — "UMD ... no longer relies on
  dynamic patching ... doesn't generate allocation or patch location lists".
- **DrawCallCost ns 수치는 출처 미확정** → 본문·figcaption·chapters에 "도식용 대표 차수"로 명시.

## 목적과 범위

"DX9·DX11·DX12 드라이버 뒤에서 일어나는 일"을 설명. 핵심 명제: 세 API는 **같은 WDDM 스택**을
쓰며, 차이는 *어느 레이어가 무엇을 언제 하느냐*의 분담이다. 일을 **draw-time→creation-time**,
**driver→application**으로 옮겨 온 역사로 꿴다.

다루는 범위: WDDM 레이어(runtime/UMD/KMD/Dxgkrnl·VidMM·VidSch), draw call 경로(command
buffer·allocation/patch list·제출), 상태 변환 시점(DX9 draw-time validation → DX10/11 state
object → DX12 PSO), 셰이더 IR(DXBC/FXC vs DXIL/DXC, UMD JIT), hazard tracking·resource
barrier, residency(자동 vs MakeResident), 버퍼 renaming(Map DISCARD), 스레딩(단일/deferred
context 에뮬/DX12 allocator+list+queue·bundle), draw call CPU 비용 분해.

멈춘 지점(더 나아가기 포인터): WDDM 2.7 GPU hardware scheduling, Vulkan/Mantle 수렴, DXR,
엔진 RHI는 링크만.

## 위젯 (모두 `src/components/demos/directx-driver-internals/`)

헬퍼 `dxd2d.ts`(cq2d/tf2d 패턴 + `box()` 라벨박스 헬퍼 + COLORS: 레이어/ API세대/비용범주),
`useCanvas2d.ts`(dxd2d import). **전부 벡터 도식 — putImageData 미사용**(§5.1 무관).

| # | 컴포넌트 | 유형 | 가르치는 것 |
|---|---|---|---|
| 1 | `WddmStack.tsx` | 정적 | App→runtime→UMD→[user/kernel]→Dxgkrnl(VidMM/VidSch)→KMD/GPU 레이어 스택 |
| 2 | `DrawCallPath.tsx` | 정적 | 한 Draw의 경로: user 모드 per-draw 변환 → command buffer → 제출 시 kernel → GPU |
| 3 | `ApiResponsibilities.tsx` | 정적(비교표) | DX9/11/12 × {상태변환시점·hazard·residency·스레딩·바인딩·셰이더IR} |
| 4 | `StateTranslationTiming.tsx` | 정적(타임라인) | 변환 비용 시점: DX9 draw마다 / DX11 state obj+draw / DX12 PSO 생성 한 번 |
| 5 | `CommandRecordingThreads.tsx` | 정적 | 단일(DX9) / immediate+deferred 에뮬(DX11) / N스레드 alloc+list→Direct·Compute·Copy 큐(DX12) |
| 6 | `DrawCallCost.tsx` | **인터랙티브** | draw 수 슬라이더 → DX11 vs DX12 프레임 CPU를 범주별 누적 막대 + 16.6ms 예산선 |

도식 규칙 근거: 드라이버/시스템 내부라 **정적 기본**(가이드 §1 경험칙). 6번만 "CPU 비용이 draw
수에 따라 어떻게 갈리는지"를 *과정*으로 드러내 인터랙티브.

## 기술적 정확성 노트 (적대적 검수 대상 — 전공자 독자)

- WDDM UMD/KMD 분리, DDI, Dxgkrnl=VidMM(residency·VA)·VidSch(scheduler), WDDM 2.0 per-process
  GPU VA(패치 감소) — 사실. WDDM 2.7 HW scheduling은 더 나아가기로만.
- DX9 draw-time validation(흩어진 SetRenderState→draw 시 변환), DX10 state object 도입,
  DX11 immutable state object + free-threaded 자원생성 + immediate/deferred context.
- **deferred context 드라이버 에뮬**: `D3D11_FEATURE_DATA_THREADING.DriverCommandLists` 미지원 시
  runtime이 replay → 병렬 이득 제한. (정확)
- DX12 PSO(생성 시 ISA 컴파일), ResourceBarrier(transition/UAV/aliasing), descriptor heap+root
  signature, MakeResident/Evict, Direct/Compute/Copy 큐 + ID3D12Fence, bundle. (정확)
- 셰이더: HLSL→DXBC(fxc)/DXIL(dxc), UMD JIT가 ISA로(DX11 셰이더 생성/첫 사용, DX12 PSO 생성).
- Map(WRITE_DISCARD) 버퍼 renaming/versioning은 DX11 드라이버 동작; DX12는 수동 upload heap+fence.
- **DrawCallCost 수치는 도식용 대표 차수**(검증180/상태340/디스크립터240/제출140 ns DX11,
  30/25/15/30 DX12) — 특정 드라이버 측정 아님. figcaption·본문에 명시. 요점은 절대값이 아니라
  구성비와 기울기(DX11이 16.6ms를 먼저 넘음).

## 브라우저 시각 검증 펜딩 (빌드 통과 ≠ 올바른 렌더)
- WddmStack/DrawCallPath: 박스·화살표·user/kernel 점선 라벨 겹침, 좁은 폭(≤400px)에서 텍스트 잘림.
- ApiResponsibilities: 6행×3열 셀 텍스트가 칸 안에 들어오는지(특히 'descriptor heap + root sig'),
  DX12 강조 테두리 위치.
- StateTranslationTiming: 막대 높이 대비(DX9 draw 높음 / DX12 PSO 앞 큰 막대 + draw 바닥).
- CommandRecordingThreads: DX11 replay 점선 화살표·DX12 스레드→큐 연결선이 엉키지 않는지(가장 복잡).
- DrawCallCost: 슬라이더로 DX11 막대가 16.6ms 선을 넘는 지점, 범례 줄바꿈, 라이트/다크.

## chapters.ts 등록 (중앙 등록 완료)
```ts
{ slug: 'directx-driver-internals',
  title: 'DirectX 드라이버 내부 — DX9·DX11·DX12 Under the Hood',
  description: 'WDDM 스택·UMD/KMD·command buffer 제출·상태 변환 타이밍·hazard tracking·residency·draw call 비용',
  section: 'GPU 명령 제출' }
```

## 교차링크
command-queues(fence/배리어/제출 모델), gpu-execution-model(command buffer가 GPU에 닿은 뒤),
ue-gpu-crash-debugging(엔진 RHI 추상). 전부 bare 상대 슬러그.

## 확장 후보
WDDM 2.7 HW scheduling 도식, Vulkan↔DX12 1:1 대응표, DXR/work graphs, PSO 캐시·hitching 위젯.
