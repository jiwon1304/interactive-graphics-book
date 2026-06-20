# 핸드오프 — 드로우 콜의 일생 (`draw-call-journey`)

> 그래픽스 드라이버 5부작 **3편**. 1편(`gpu-cpu-conversation`)·2편(`wddm-graphics-stack`)을 전제로
> "한 번의 Draw가 GPU에 닿기까지 전 과정"을 자세히. 4편=상태/PSO 변환의 *내용*, 5편=D3D11 immediate
> vs D3D12/Vulkan *깊은 대비*. 이 챕터는 그 둘로 가는 포인터만 남기고 경로 자체에 집중.

## 목적 / 범위
- API 호출 → runtime 검증 → DDI → UMD가 상태를 하드웨어 명령으로 변환해 command buffer에 append
  (전부 user 모드, per-draw) → buffer full/Flush/Present 시 `D3DKMTSubmitCommand`로 커널 제출
  (user→kernel 전환, 제출 단위) → VidMM residency → VidSch ring → GPU 실행.
- **핵심 프레임: per-draw(user CPU) vs 제출 단위(kernel, 분할 상환)** 의 분리.
- Vulkan 나란히: `vkCmd*`는 VkCommandBuffer에 *직접 기록*(D3D12에 가까움), `vkQueueSubmit`로 배치.
- 멈춘 지점: 상태/PSO 변환의 내용(4편), immediate↔explicit 전체 대비·Runtime Bypass(5편)는 포인터만.

## 위젯 (폴더 `src/components/demos/draw-call-journey/`)
헬퍼: `dcj2d.ts`(directx의 dxd2d.ts 복사 + **wrapText 추가** + COLORS.vk 추가), `useCanvas2d.ts`(동일 패턴).
드래그 위젯 없음 → `usePointerDrag` 미사용. 전부 정적/슬라이더라 putImageData 없음.

1. **DrawCallPath.tsx** — (정적/과정) 한 Draw의 경로. 윗줄=per-draw user / 아랫줄=제출 시 kernel.
   directx의 DrawCallPath보다 천천히(append·Flush·경계 라벨 명시). **모바일 세로 적응**: `w<520`이면
   세로 스택 레이아웃으로 전환(canvas height가 `min(78vw,560px)`로 가변). per-draw 비용=윗줄을 가르침.
2. **RecordVsSubmit.tsx** — (인터랙티브/과정) 슬라이더 "제출당 draw 수". 프레임 draw 수 고정(DRAWS=4096),
   제출 횟수=ceil(DRAWS/perSubmit) → 위쪽 칸 묶음(칸=제출 1회) + 아래 CPU/프레임 막대(기록 고정 +
   커널 가변) + "draw당 커널 비용 ns". 커널 전환 **분할 상환**을 직접 만지게. 대표값: KERNEL_NS=8000,
   RECORD_NS=250.
3. **DrawCostBreakdown.tsx** — (인터랙티브) directx DrawCallCost 초보 친화 재구성. 위=한 Draw의 user CPU를
   4범주로 분해(검증/상태·hazard/디스크립터/기록, 합 PER_DRAW_NS=950), 아래=draws 슬라이더로 프레임 합 vs
   16.6ms 예산. 범주의 *의미*는 캡션에서 풀이. 대표 차수.
4. **D3dVsVulkanRecord.tsx** — (정적) 위 레인=D3D11 immediate(Draw마다 UMD 변환→immediate buffer),
   아래 레인=D3D12 command list/Vulkan VkCommandBuffer(vkCmdDraw가 버퍼에 직접 기록 → 나중에
   ExecuteCommandLists/vkQueueSubmit 배치). `w<480`이면 라벨 축약(cmd Draw). 두 레인 항상 세로 유지.

## 기술 노트 / 근사
- **수치는 전부 "도식용 대표값"**(본문·캡션·sources에 명시). 출처상 절대 ns는 확정 안 됨
  (directx DrawCallCost와 동일 주의). 관계(분할상환·구성비·기울기)가 요점.
- DrawCostBreakdown은 제출(분할상환분)을 per-draw 막대에서 생략 — §2 RecordVsSubmit에서 따로 다루므로.
- 색: COLORS는 directx와 일치(레이어/세대/비용범주). Vulkan용 `vk`(진보라) 추가.
- 링크는 mdx에서 bare 상대 슬러그(`gpu-cpu-conversation`, `wddm-graphics-stack`) — base 경로 존중.
  ⚠️ 1·2편 slug가 확정값과 다르면 mdx 링크 텍스트/슬러그 동기화 필요(현재 가정: 1=gpu-cpu-conversation,
  2=wddm-graphics-stack, 4·5편은 아직 링크 안 검).

## 출처
`docs/sources/draw-call-journey-sources.md`. 핵심: User-Mode Work Submission / D3DKMTSubmitCommand
(user 모드 생성·patch list 없음), Vulkan Command Buffers(Action Command) + vkQueueSubmit(배치·고비용),
DirectX-Specs CPU Efficiency("execution-time < 10% of command list CPU") + Runtime Bypass, fgiesen.

## TODO / 검증 펜딩
- `npm run check`(astro check) + `npm run build` — 오케스트레이터가 중앙에서.
- 브라우저(클린 프로필) 시각 검증: 라이트/다크 + 모바일 ~360px. 특히 DrawCallPath 세로 전환,
  RecordVsSubmit 칸이 perSubmit=1(제출 4096회)에서 너무 촘촘할 때 / 1024에서 칸 1개일 때 라벨 겹침,
  D3dVsVulkanRecord 좁은 폭 라벨 잘림.
- 1·2·4·5편 slug 확정 시 mdx 상대 링크 재확인.

## chapters.ts 등록 항목 (오케스트레이터가 등록)
```ts
{ slug: 'draw-call-journey', title: '드로우 콜의 일생 — Draw 한 번이 GPU에 닿기까지',
  description: 'Draw() 한 번이 runtime 검증·UMD 변환·command buffer·커널 제출을 거쳐 GPU에 닿기까지. per-draw vs 제출 단위 비용, D3D11 immediate vs D3D12/Vulkan 기록 대비.',
  section: '그래픽스 드라이버' }
```
