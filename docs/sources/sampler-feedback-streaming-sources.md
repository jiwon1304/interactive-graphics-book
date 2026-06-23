# Sampler Feedback와 텍스처 스트리밍 — 출처와 검증 노트

집필·검수 시 사용한 1차/전문가 자료와, 본문의 핵심 사실 ↔ 출처 대응. DX12 명세 원문(DirectX-Specs)과
Microsoft DirectX 블로그, Intel GameTechDev 샘플을 교차확인.

## 핵심 사실 ↔ 출처

| 본문 주장 | 출처 | 비고 |
|---|---|---|
| Sampler Feedback = 셰이더가 실제로 어떤 texel/mip을 샘플했는지를 GPU가 기록 | DirectX-Specs SamplerFeedback, MS DirectX 블로그 | 확정 |
| HLSL intrinsic `WriteSamplerFeedback`(+Grad/Level/Bias/Clamp 변형), Shader Model 6.5 | DirectX-Specs, MS 블로그 | SM 6.5 확정 |
| 두 작은 맵: **feedback map**(원하는 mip — 필요한 것) vs **MinMip map**(실제 로드된 최소 mip — 가진 것) | GameTechDev README, DirectX-Specs | 핵심 대비 |
| feedback region 크기는 tiled resource의 타일 크기에 맞춤(`SamplerFeedbackRegion`, `D3D12_RESOURCE_DESC1`) | DirectX-Specs | 확정 |
| feedback를 읽으려면 `ResolveSubresourceRegion`(+`D3D12_RESOLVE_MODE_DECODE_SAMPLER_FEEDBACK`)로 decode/transcode | DirectX-Specs | "transcode" 단계 |
| Tiled/Sparse(reserved) resource = 64KB 타일 단위로 부분 residency. `UpdateTileMappings`로 타일 매핑 | DirectX-Specs Tiled Resources, GameTechDev | 확정 |
| 타일을 resident/non-resident로 바꾸면 MinMip map을 갱신 → GPU 접근을 그 region에서 clamp | GameTechDev README | residency↔MinMip 연동 |
| 절감 예: 전체 mip chain 524,288 KB vs tiled 51,584 KB (~1/10) | MS DirectX 블로그 | 대표 수치 |
| 100s of GB 자산을 훨씬 작은 물리 VRAM에 그릴 수 있음 | GameTechDev README | 확정 |
| Sampler Feedback Tier `TIER_1_0`(=0.9 거쳐 1.0). Windows 10 20H1(2004, build 19041)+ 및 지원 GPU 필요 | DirectX-Specs, MS 블로그 | 확정 |
| DX12 Ultimate(2020) 4대 기능: DXR 1.1, Mesh Shaders, VRS, **Sampler Feedback** | MS/NVIDIA/AMD DX12U 발표 | 확정 |
| DirectStorage = NVMe에서 직접 빠른 자산 로드 — SFS와 함께 스트리밍 파이프라인 구성 | MS DX12U, GameTechDev(샘플이 DirectStorage 사용) | 한 줄 언급 |

## 주의 (낮은 신뢰도/주의)

- "샘플별 정확한 footprint를 1:1로 안다"는 식의 과장 금지. Sampler Feedback은 **region(타일) 단위**의
  desired mip을 기록하지, 픽셀 단위 완벽 기록이 아니다(region 크기로 양자화). 본문에서 명시.
- 절감 배수(~1/10)는 **특정 샘플 장면**의 수치다. 실제 절감은 콘텐츠·카메라·해상도 의존 → "대표값"으로 표기.
- 하드웨어/드라이버 지원은 GPU·OS 버전에 따라 다르므로 "지원 GPU 필요"로 hedge.

## 주요 URL

- DirectX-Specs, Sampler Feedback: https://microsoft.github.io/DirectX-Specs/d3d/SamplerFeedback.html
  (raw: https://github.com/microsoft/DirectX-Specs/blob/master/d3d/SamplerFeedback.md)
- Microsoft DirectX 블로그, Coming to DirectX 12 — Sampler Feedback: https://devblogs.microsoft.com/directx/coming-to-directx-12-sampler-feedback-some-useful-once-hidden-data-unlocked/
- Intel GameTechDev, SamplerFeedbackStreaming(샘플+DirectStorage): https://github.com/GameTechDev/SamplerFeedbackStreaming
- Microsoft DirectX 블로그, Announcing DirectX 12 Ultimate: https://devblogs.microsoft.com/directx/announcing-directx-12-ultimate/
- AMD GPUOpen, DirectX 12 Ultimate: https://gpuopen.com/directx12-ultimate/
- NVIDIA, DirectX 12 Ultimate: https://www.nvidia.com/en-us/geforce/technologies/directx-12-ultimate/

## 검수 메모

- 데모: `FeedbackVsMinMip.tsx`(화면의 샘플된 영역 → feedback map의 desired mip 기록 도식),
  `TileResidencyMap.tsx`(타일 residency 그리드 — resident/non-resident와 절감),
  `StreamingLoop.tsx`(샘플→feedback→resolve→스트리밍→MinMip 갱신 루프 플로우).
- 절감 수치는 MS 블로그 대표값(~1/10)만 사용. 픽셀 단위가 아니라 region 단위라는 점을 도식에서 region
  그리드로 표현.
