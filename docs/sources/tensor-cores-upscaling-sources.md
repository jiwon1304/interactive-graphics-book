# Tensor Core와 AI 업스케일링 — 출처와 검증 노트

집필·검수 시 사용한 1차/전문가 자료와, 핵심 사실 ↔ 출처 대응. 수치는 ≥2개 출처로
교차확인. 마케팅 집계/미확정은 명시.

## 핵심 사실 ↔ 출처

| 본문 주장 | 출처 | 비고 |
|---|---|---|
| Volta tensor core: D=A·B+C, 4×4 행렬(4×4×4 MMA). 입력 FP16, 누산 FP16/FP32 | NVIDIA Volta 백서, CUDA-9 blog, Cornell CVW | 확정 |
| **64 FMA/코어/클럭 = 128 FLOP/코어/클럭** | Volta 백서, CUDA-9 blog | 사용자 가정과 정확히 일치 |
| SM당 tensor core 8개 → 1024 FLOP/SM/클럭. V100 총 640개(80 SM) | Volta 백서 | 확정 |
| systolic array(weight-stationary): weight 정지, 입력 가로 흐름, 부분합 세로 누적 | arXiv systolic survey, TPU 자료 | **개념적 analogy** — NVIDIA는 tensor core 내부 회로 비공개 |
| 정밀도 세대: FP16/FP32(Volta) → INT8/INT4(Turing) → TF32/BF16/FP64+2:4 sparsity(Ampere) → FP8 E4M3/E5M2(Hopper/Ada) | NVIDIA Turing/Ampere/Hopper In-Depth blogs | 표로 정리, 확정 |
| BF16·TF32는 FP32와 같은 8비트 exponent 유지(범위), mantissa만 축소 | Ampere blog | TF32 m10, BF16 m7 |
| FP8: E4M3(정밀 우선)·E5M2(범위 우선) | Hopper blog/Transformer Engine | 확정 |
| 입력은 좁게, 누산은 넓게(FP16 곱 → FP32 누산) | Volta 백서 | §2 박스 |
| temporal upscaling = jitter(서브픽셀) + reproject(motion vector) + history 결합 | DLSS Wikipedia, NVIDIA DLSS 2.0, FSR2 GPUOpen | 핵심 직관 |
| DLSS 입력: 저해상도 색·motion vector·depth·exposure | NVIDIA DLSS 2.0 blog | 확정 |
| DLSS 2.x = tensor core 위 convolutional autoencoder | DLSS Wikipedia, NVIDIA | 확정 |
| DLSS 모드 축당 비율: 품질 67%(1.5×)·균형 58%·성능 50%(1/2)·초고성능 33%(1/3). 픽셀수=제곱 | DLSS Wikipedia, BenQ KC | 사용자 가정 일치, "픽셀수=제곱" 명시 |
| FSR 1 = 공간 전용(비-temporal, 비-ML). FSR 2/3 = temporal이지만 **비-ML**, 일반 셰이더 ALU | GPUOpen FSR2/3, Tom's, HotHardware(AMD 인용 "do not use ML") | 확정 — 핵심 차별점 |
| FSR 2/3 품질 비율 ≈ DLSS와 동급(품질 1.5×, 성능 2×, 초고성능 3×) | DeepWiki/GPUOpen | 균형 1.7×≈59% (DLSS 58%와 사실상 동일) |
| FSR 4(2025, RDNA4) = ML로 전환 | GPUOpen FSR FrameGen, 검색 | AMD의 비-ML→ML 변곡점 |
| XeSS = ML. Arc의 XMX(행렬 엔진)에서 가속, 그 외 GPU는 DP4a(INT8×4) 폴백 | Tom's, XMX/DP4a Medium | 확정 |
| Frame Generation(DLSS3 Ada OFA / FSR3 Fluid Motion Frames-비ML) — 사이 프레임 보간, 지연↑ | DLSS Wikipedia, GPUOpen FSR3 | details 박스 |
| Ray Reconstruction(DLSS 3.5) = NN denoiser. DLSS 4(2025) = transformer + multi-frame gen | NVIDIA Research DLSS4, 검색 | details 박스 |

## 마케팅 집계 / 미확정 (본문에서 플래그)

- **Volta "8×/9×/12×" vs Pascal**: 분모가 다른 집계(8×=SM당 peak, 12×=칩 전체 SM·클럭 포함).
  본문은 "SM당 약 8배"로 쓰고 12배는 "마케팅 집계"로 명시.
- **Ampere 2:4 sparsity "2배"**: 이론상 천장. 본문에서 "이론상", "천장값"으로 명시.
- **Hopper "6배 chip-to-chip", DLSS4 "40% 빠름/VRAM 30%↓"**: IHV 수치 — 본문은 단정 대신
  맥락만. V100 peak 120 vs 125 TFLOPS는 클럭 빈 반올림 차이(본문에 미사용).
- systolic 내부 구조: NVIDIA 비공개 → 데모·본문 모두 "개념적", "TPU식"이라 명시.

## 주요 URL

- Volta 백서: https://images.nvidia.com/content/volta-architecture/pdf/volta-architecture-whitepaper.pdf
- Programming Tensor Cores in CUDA 9: https://developer.nvidia.com/blog/programming-tensor-cores-cuda-9/
- Cornell CVW V100 Tensor Cores: https://cvw.cac.cornell.edu/gpu-architecture/gpu-example-tesla-v100/tensor_cores
- Turing In-Depth: https://developer.nvidia.com/blog/nvidia-turing-architecture-in-depth/
- Ampere In-Depth: https://developer.nvidia.com/blog/nvidia-ampere-architecture-in-depth/
- Hopper In-Depth / H100 Transformer Engine: https://developer.nvidia.com/blog/nvidia-hopper-architecture-in-depth/ · https://blogs.nvidia.com/blog/h100-transformer-engine/
- Systolic array survey: https://arxiv.org/html/2410.22595v1
- TPU architecture(Chip Letter): https://thechipletter.substack.com/p/googles-first-tpu-architecture
- DLSS Wikipedia: https://en.wikipedia.org/wiki/Deep_Learning_Super_Sampling
- NVIDIA DLSS 2.0: https://www.nvidia.com/en-us/geforce/news/nvidia-dlss-2-0-a-big-leap-in-ai-rendering/
- DLSS preset 비율(BenQ): https://www.benq.com/en-us/knowledge-center/knowledge/dlss-presets-performance-quality-balanced.html
- DLSS 4 Research / news: https://research.nvidia.com/labs/adlr/DLSS4/ · https://www.nvidia.com/en-us/geforce/news/dlss4-multi-frame-generation-ai-innovations/
- FSR Wikipedia: https://en.wikipedia.org/wiki/FidelityFX_Super_Resolution
- GPUOpen FSR2: https://gpuopen.com/manuals/fidelityfx_sdk2/techniques/super-resolution-temporal/
- GPUOpen FSR3: https://gpuopen.com/fidelityfx-super-resolution-3/
- AMD "FSR does not use ML"(HotHardware): https://hothardware.com/news/amd-claims-fsr-20-beats-native-resolution-without-ai
- FSR 모드/배율(DeepWiki): https://deepwiki.com/GPUOpen-Effects/FidelityFX-FSR/2.2-performance-and-quality-modes
- XeSS 개요(Tom's): https://www.tomshardware.com/news/intel-xess-technology-demo-and-overview
- XMX/DP4a(Medium): https://medium.com/@historymaster121/xmx-matrix-engines-and-deep-learning-for-xess-68a19ad646ab
- DirectX Cooperative Vectors(neural rendering): https://devblogs.microsoft.com/directx/cooperative-vector/

## 검수 메모

- 데모 `MACArray.tsx`: weight-stationary systolic 흐름 — 캡션·본문에 "NVIDIA 내부 비공개,
  TPU식 개념도"라 명시. 클럭 파동(i+j==step)은 systolic skew의 단순화.
- 데모 `TemporalJitter.tsx`: Halton(2,3) jitter로 서브픽셀 누적 → 고해상도 재구성. "고스팅"
  토글은 disocclusion에서 stale history 혼합을 강제 시연(교육적 단순화 — 실제 reproject 아님).
- 데모 `PrecisionLadder.tsx`: 비트 폭 = sign/exp/mantissa. INT8은 정수라 exp=0, int7로 표기.
  세대 라벨은 NVIDIA 백서 기준(표와 일치).
- DLSS 4.5(2025 후반 2세대 transformer) 검색에 등장하나 범위 밖 — "DLSS 4"를 오기재하지
  않도록 details 박스는 DLSS 4까지만 단정.
