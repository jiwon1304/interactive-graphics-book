# (핸드오프) 상태·셰이더·PSO — 드라이버가 하는 변환

> 슬러그 `pipeline-state-shaders`, 섹션 **그래픽스 드라이버** — "그래픽스 드라이버" 5부작 중 **4편**.
> 1~3편(command buffer/비동기 제출, WDDM, draw 콜의 일생)을 읽은 독자 전제.
> 작성: 2026-06. 집필 L2 에이전트.

## 목적 / 범위
"드라이버가 하는 변환"을 세 축으로 깊게 다룬다.
1. **파이프라인 상태 변환 시점**: 상태란 무엇인가(blend/rasterizer/depth-stencil/sampler/input
   layout/RT format/MSAA)와 왜 하드웨어 변환이 비싼가(추상 enum→GPU 레지스터·명령, 셰이더와
   다른 상태의 결합). DX9 draw-time validation → DX10/11 immutable state object → DX12 PSO /
   Vulkan VkPipeline(생성 시 전부 컴파일). 비용이 hot loop(draw)→creation-time으로 이동 →
   생성이 무겁고 hitching → pipeline cache / dynamic state.
2. **셰이더 2단 컴파일**: HLSL→DXBC(fxc)/DXIL(dxc), GLSL/HLSL→SPIR-V(glslang/dxc -spirv) =
   offline IR; 이후 UMD JIT가 PSO/VkPipeline 생성 시 GPU ISA로 = online. 왜 느린가(최적화 컴파일),
   캐시(ID3D12PipelineLibrary / VkPipelineCache), graphics pipeline library.
3. **바인딩/디스크립터 모델**: D3D11 슬롯 → D3D12 descriptor heap + root signature → Vulkan
   descriptor set + pipeline layout. 셋의 1:1 대응(root constant↔push constant 포함).

범위 밖(다른 편/챕터로 위임): 명령이 GPU에 닿은 뒤 실행(gpu-execution-model), 제출/동기화
(command-queues, draw 콜의 일생), WDDM 레이어(directx-driver-internals), RHI(ue-gpu-crash-debugging).

## 위젯 목록 (폴더 `src/components/demos/pipeline-state-shaders/`)
모두 정적/저상호작용 2D 도식. `pss2d.ts`(dxd2d.ts 복사 + **wrapText** 추가 + 셰이더/Vulkan 색) +
`useCanvas2d.ts`(복사) 공유. **putImageData 없음**(전부 벡터) → HiDPI 함정 무관. 정적 캔버스라
touch-action 미설정(전역 CSS 스크롤 허용). 비유 금지 정책 준수, 용어 영어/발음.

1. **StateTranslationTiming.tsx** (정적) — directx판을 4 레인으로 확장(DX9/DX11/DX12/**Vulkan**).
   막대 높이=상태 변환 CPU 비용. DX9는 draw마다 높은 회색 막대, DX11은 state obj 선행+작은 draw,
   DX12 PSO·Vulkan VkPipeline은 큰 선행 막대+바닥 draw. **과정**: 비용이 draw→생성으로 *이동*.
   파라미터 없음(read-only). §1 본문 + 비용 이동 KaTeX 식과 연결.
2. **ShaderCompilePipeline.tsx** (정적) — 두 줄 병기: D3D12(HLSL→dxc→DXIL→UMD JIT@PSO→ISA),
   Vulkan(HLSL/GLSL→dxc/glslang→SPIR-V→driver JIT@pipeline→ISA). 가운데 세로 점선=offline/online
   경계. **과정**: 어디서 IR이 되고 어디서 ISA가 되는가. 파라미터 없음. §2.
3. **PsoBundle.tsx** (인터랙티브, S~I) — PSO/VkPipeline이 묶는 상태 조각들을 한 객체로.
   컨트롤: SelectControl `API`(dx12/vk → 라벨 전환), ToggleControl `dynamic state 분리`(켜면
   viewport/scissor 조각이 번들 밖 dynamic 칼럼으로 빠짐). **과정**: baked-in vs dynamic 경계,
   두 API 용어 대응. §1.3. (controls 프리미티브 사용, Canvas 밖 DOM.)
4. **BindingModels.tsx** (정적) — 세로로 3블록 쌓기(모바일 열 겹침 방지): D3D11 슬롯→드라이버
   패치 / D3D12 root signature→descriptor table→descriptor heap / Vulkan pipeline layout→
   descriptor set→descriptor pool. 같은 역할=같은 색. **과정/대응**: per-draw 패치가 어떻게
   사라지나 + 셋의 대응. 파라미터 없음. §3.

## 기술 노트
- **헬퍼 wrapText**: pss2d.ts에 추가. 공백 그리디 줄바꿈, align left/center, 세로 중앙 정렬,
  반환=줄 수. 긴 라벨(descriptor table, attachment formats 등)을 360~440px에서 박스 안에
  안 넘치게 그리려고 거의 모든 박스 텍스트에 사용.
- **COLORS**(pss2d.ts): dxd2d의 API 세대색(dx9/dx11/dx12) 유지 + **vk**(indigo 추가),
  컴파일 단계(hlsl/ir/jit/isa), PSO 상태 범주(shader/blend/raster/depth/input/rtformat),
  바인딩(slot/heap/rootsig). `as const`. TS strict 통과 목적.
- **PsoBundle** 상태는 useState(api, splitDynamic), 드래그 없음 → usePointerDrag 불필요.
  dynamic 분리 시 번들 폭 0.66로 줄고 오른쪽에 점선 dynamic 칼럼 등장.
- **수학**: §1.3 끝 KaTeX 박스 — 프레임 상태비용 $C=N_{create}c_{create}+N_{draw}c_{draw}$로
  비용 이동을 정량화($N_{create}\ll N_{draw}$ + 프레임마다 반복 안 됨이 핵심).

## 출처 / 검증
`docs/sources/pipeline-state-shaders-sources.md` 참조. 1차: Microsoft Learn(PSO/state object/
root signature/D3D9 setter), DirectX-Specs ResourceBinding, DXIL.rst(DXIL=LLVM bitcode subset,
IHV JIT 계약), Khronos Vulkan spec(VkPipeline/layout/dynamic/cache), Vulkan-Guide(SPIR-V/cache/
push constant), Vulkan-Samples(cache 24.4/50.4 ms), VK_EXT_graphics_pipeline_library proposal.
챕터 말미 "참고 자료" + 도식용 상대값 주석.

### 알려진 한계 / 검수 포인트
- StateTranslationTiming 막대 높이 = 도식용 상대값(특정 드라이버 측정 아님) — 말미 주석 명시.
- "수백 ms" 셰이더 컴파일 상한은 산업 사례 framing(단일 MS 문장은 narrow). 캐시 24.4/50.4 ms는
  Khronos 샘플 실측.
- D3D9 "draw-time validation" 용어는 일반 통용(메커니즘은 출처 확실, 정확한 단어는 추론).
- **펜딩 시각 검증**: 브라우저(클린 프로필) 라이트/다크/모바일(~360px)로 4개 도식 글자 겹침·잘림
  확인 필요(특히 BindingModels 3블록 노드 라벨, ShaderCompilePipeline 박스, PsoBundle dynamic 칼럼).

## chapters.ts 등록 (오케스트레이터가 중앙에서)
```ts
{ slug: 'pipeline-state-shaders', title: '상태·셰이더·PSO — 드라이버가 하는 변환',
  description: '파이프라인 상태 변환 시점(DX9→DX11→DX12/Vulkan), 셰이더 2단 컴파일(DXBC/DXIL/SPIR-V→ISA), 바인딩 모델 대응', section: '그래픽스 드라이버' }
```
5부작 순서상 3편(draw 콜의 일생) 뒤, 5편 앞.

## 확장 방법
- PsoBundle에 root signature/pipeline layout 내부(root constant/descriptor/table)를 펼치는
  토글 추가 가능(BindingModels와 중복 주의).
- 조합 폭발(PSO permutation) 시각화 위젯(셰이더 × RT format × blend) 추가 여지 — "더 나아가기"에 언급만.
