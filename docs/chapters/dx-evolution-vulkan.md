# (핸드오프) DX9 → DX11 → DX12, 그리고 Vulkan — 무엇이·왜 바뀌었나

> slug: `dx-evolution-vulkan` · section: `그래픽스 드라이버` · 5부작(드라이버) 중 **5편(종합/비교)**.
> 이 챕터를 수정할 다른 에이전트를 위한 노트. 집필 전 `docs/sources/dx-evolution-vulkan-sources.md`를
> 먼저 읽을 것.

## 목적 / 범위
앞 4편(gpu-cpu-conversation / wddm-graphics-stack / draw-call-journey / pipeline-state-shaders)을
**세대 축**에 모아, DX9→DX11→DX12→Vulkan에서 **무엇이·왜 바뀌었나**를 종합한다. 한 줄 요지:
통제·책임을 드라이버→앱으로 옮긴 역사이며, DX12와 Vulkan은 같은 문제(드라이버 per-draw 오버헤드,
CPU 병목)의 같은 답이라 거의 1:1로 대응한다.

**기존 `directx-driver-internals` 챕터를 흡수·확장한다** — 오케스트레이터가 그 챕터를 제거 예정.
이 폴더는 자급자족(dev2d.ts/useCanvas2d.ts가 directx 챕터에 의존하지 않음).

다루는 것: ① draw call CPU 오버헤드 + Mantle 동기, ② 상태 변환 시점(draw-time→creation-time,
PSO/VkPipeline), ③ hazard/전이(DX11 자동 vs ResourceBarrier/vkCmdPipelineBarrier), ④ residency/메모리
(자동 vs MakeResident/vkAllocateMemory, DX11 renaming 소멸), ⑤ 스레딩(단일→deferred→N스레드 cmd
list/buffer + 큐), ⑥ 동기화(fence 하나 vs fence+semaphore, timeline semaphore 수렴), ⑦ D3D12↔Vulkan
1:1 대응표. 멈춘 곳: 실제 코드 예제·세부 API 시그니처는 안 다룸(개념 대응에 집중). HAGS·RHI는 포인터만.

## 위젯 목록 (`src/components/demos/dx-evolution-vulkan/`)
헬퍼: `dev2d.ts`(directx dxd2d.ts 복사 + **wrapText/labelWrapped 추가** + Vulkan 색 `COLORS.vulkan`),
`useCanvas2d.ts`(directx와 동일, dev2d에서 import). 드래그 위젯 없어 usePointerDrag 미사용.

1. **ApiResponsibilities.tsx** (정적 표) — 행=관심사(상태변환/hazard/residency/스레딩/바인딩/셰이더IR),
   열=DX9/DX11/DX12/**Vulkan**(directx 표에 Vulkan 열 추가). 셀은 **wrapText로 줄바꿈**, 행 높이는 줄
   수에 맞춰 가변. "앱이 직접" 칸(hazard/residency/바인딩의 DX12·Vulkan)은 테두리 강조. 과정/결과: 분담
   *비교*(정적이 맞음). height 320.
2. **CommandRecordingThreads.tsx** (정적) — 4레인: DX9 단일 / DX11 immediate+deferred(replay 점선,
   에뮬*) / DX12 N스레드(alloc+list)→Direct·Compute·Copy / **Vulkan** N스레드(pool+cmdbuf)→Graphics·
   Compute·Transfer Q. DX12/Vulkan은 `drawParallelLanes` 헬퍼로 공통화(구조 동일, 라벨만 다름).
   height 380.
3. **DrawCallCost.tsx** (인터랙티브) — directx의 것 재사용. 둘째 막대를 **"DX12/Vk"** 로 묶음(같은
   explicit 모델). draw 수 슬라이더 → 범주별(검증/상태·hazard/디스크립터/제출) 누적막대 + 16.6ms 예산선.
   과정: draw 늘리며 *어디서* 예산을 넘는지 본다. **ns는 도식용 대표 차수**(캡션·sources 명시). height 220.
4. **D3d12VulkanMap.tsx** (정적) — D3D12(좌)↔Vulkan(우) 8쌍 1:1 대응, 가운데 연결선+역할 라벨.
   PSO↔VkPipeline / RootSig↔VkPipelineLayout / DescHeap↔VkDescriptorSet / CmdList↔VkCommandBuffer /
   CmdAllocator↔VkCommandPool / CmdQueue↔VkQueue / Fence↔VkFence+Semaphore / ResourceBarrier↔
   PipelineBarrier. 박스 텍스트 wrapText. height 360.

## 기술 노트 / 단순화
- 색: `COLORS.vulkan = #ef4444`(빨강). dx12=초록, dx11=주황, dx9=분홍. DrawCallCost의 `submit`도 빨강
  이라 예산선/Vulkan 색이 같은 맥락에서 겹치진 않음(다른 위젯).
- 동기화 절(6장)에서 "VkSemaphore=GPU↔GPU, VkFence=GPU→host"는 Vulkan-Guide 직접 근거. timeline
  semaphore는 "superset/포괄"로만 서술(과장 금지 — sources §6 주의).
- ns 수치(DrawCallCost): 특정 드라이버 측정 아님. 절대값 아니라 구성·기울기가 요점.
- bare 슬러그 링크: 1~4편(`gpu-cpu-conversation`·`wddm-graphics-stack`·`draw-call-journey`·
  `pipeline-state-shaders`) + `command-queues`·`gpu-execution-model`·`ue-gpu-crash-debugging`.
  **1~4편이 아직 chapters.ts에 없으면 dead link** — 오케스트레이터가 5편 등록 시 함께 확인.

## 서사 의도
훅: "바뀐 건 하드웨어가 아니라 일의 주인". 1절에서 *왜*(CPU 병목+Mantle) 먼저 → 2~6절 항목별 →
7절에서 "거의 같은 API"로 수렴(D3d12VulkanMap이 클라이맥스). predict-then-reveal보다 "부분→종합"
구조. 비유 금지(AUTHORING §1.5) — 메커니즘 직설. 용어 영어/발음.

## TODO / 확장
- 실제 코드 스니펫(ResourceBarrier vs vkCmdPipelineBarrier 나란히)을 `<details>`로 추가하면 심화 독자에 좋음.
- DrawCallCost ns를 공개 프로파일(3DMark API overhead 등) 수치로 교체할 수 있으면 신뢰도↑.
- HAGS(WDDM 2.7)·RHI는 별도 챕터 후보.

## chapters.ts 등록(오케스트레이터가 중앙에서)
```ts
{
  slug: 'dx-evolution-vulkan',
  title: 'DX9 → DX11 → DX12, 그리고 Vulkan',
  description: '세대별로 무엇이·왜 바뀌었나 — hazard·residency·스레딩·draw call 오버헤드와 D3D12↔Vulkan 1:1 대응',
  section: '그래픽스 드라이버',
}
```
드라이버 5부작의 마지막. 앞 4편(미등록이면 함께 등록) 다음, 기존 `directx-driver-internals`는 제거.
