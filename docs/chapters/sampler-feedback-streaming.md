# 핸드오프 노트 — `sampler-feedback-streaming` (Sampler Feedback와 텍스처 스트리밍)

## 목적과 범위
**Sampler Feedback**(DX12)이 셰이더가 실제로 샘플한 mip/region을 기록하고, 그 정보로 tiled/sparse
resource의 **필요한 타일만 스트리밍**해 VRAM을 아끼는 메커니즘을 가르친다. 훅: "수백 GB 자산을
수~수십 GB VRAM에 어떻게?". texture-filtering-mipmapping(LOD 선택)의 다음 단계 = LOD 결과를 기록해
메모리 관리에 사용.

**멈춘 곳:** PRT/sparse의 HW 페이지 테이블 세부, DirectStorage 내부(GDeflate 등), 콘솔(Xbox SFS)
하드웨어 특화, Vulkan sparse residency 대응은 포인터만.

## 그림 목록 (전부 STATIC 2D 캔버스 · MutationObserver 테마 redraw · CSS 변수 색)
1. **FeedbackVsMinMip.tsx** — 두 그리드: feedback map(원하는 mip) vs MinMip map(가진 mip). feedback이
   더 고해상도를 원하는 칸을 빨강 테두리(=로드 필요). 숫자=mip(0=고해상도).
2. **TileResidencyMap.tsx** — 64KB 타일 residency 그리드(보이는 타일만 resident) + VRAM 100% vs
   feedback 기반 절감 막대 비교.
3. **StreamingLoop.tsx** — 샘플→feedback 기록→resolve/decode→타일 스트리밍(DirectStorage)→매핑/MinMip
   갱신 세로 루프 + 루프백 화살표(과정형 — 자기조정 사이클).

## 기술 노트 / 정확도
- DirectX-Specs 명세 + MS DirectX 블로그 + Intel GameTechDev 샘플 교차확인.
- **region(타일) 단위** 양자화 강조 — 픽셀 단위 완벽 기록이 아님(과장 금지). 본문·figcaption에 명시.
- ~1/10 절감(524,288→51,584 KB)은 MS 샘플 **대표값** — "콘텐츠·카메라·해상도 의존"으로 hedge.
- WriteSamplerFeedback=SM 6.5, ResolveSubresourceRegion(DECODE_SAMPLER_FEEDBACK), UpdateTileMappings,
  SamplerFeedbackRegion 모두 명세 확인. DX12 Ultimate(2020) 4대 기능, Win10 20H1+.

## 확장 방법 / 관련 토픽
- texture-filtering-mipmapping(LOD), cpu-gpu-transfer(DirectStorage/전송), variable-rate-shading
  (같은 "필요한 곳에만" 철학 — 연산 vs 메모리).
- chapters.ts RELATED 후보: `sampler-feedback-streaming: ['texture-filtering-mipmapping', 'cpu-gpu-transfer']`.
