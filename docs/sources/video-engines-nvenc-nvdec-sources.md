# 비디오 엔진 — NVENC/NVDEC와 디스플레이 엔진 — 출처와 검증 노트

집필·검수 시 사용한 1차/전문가 자료와, 본문의 핵심 사실 ↔ 출처 대응. 세대별 코덱 지원·세대 번호는
세부가 자료마다 갈리므로 ≥2개 출처로 교차확인했고, 단정이 어려운 부분은 본문에서 hedge했다.

## 핵심 사실 ↔ 출처

| 본문 주장 | 출처 | 비고 |
|---|---|---|
| NVENC/NVDEC는 CUDA(셰이더) 코어와 **분리된 고정기능(ASIC) 블록** — 인코딩 중에도 코어는 다른 일 가능 | NVIDIA Video Codec SDK, Wikipedia NVENC, EmergentMind | 확정 |
| NVENC AV1 인코딩은 **Ada Lovelace(8세대, 2022)** 에서 도입 | NVIDIA Ada AV1 블로그, Wikipedia NVENC | 확정 |
| HEVC(H.265) 인코딩은 Maxwell(2세대)~ , 10-bit HEVC(Main10)은 Pascal | Wikipedia NVENC | 세대 번호는 자료마다 1~2 차이 → 본문은 아키텍처 이름으로 표기 |
| AV1 **디코딩**은 Ampere(NVDEC)부터, AV1 **인코딩**은 Ada부터 | Wikipedia NVENC/NVDEC, NVIDIA Ada 블로그 | 디코드/인코드 비대칭 강조 |
| NVDEC 디코드 코덱: MPEG-2, VC-1, H.264, HEVC, VP8, VP9, AV1 | NVIDIA Video Codec SDK, HandBrake docs | 확정 |
| Ada는 GPU당 NVENC 엔진을 소비자 최대 2개, 프로/서버 최대 3개. 8K60 split-frame encoding(SFE) | NVIDIA Ada AV1·8K60 블로그 | SKU별 개수는 다양 → "최대" 표기 |
| 고정기능 인코더는 같은 화질에서 SW 인코더 대비 **수십 분의 1 전력 + 훨씬 낮은 지연** | EmergentMind, arXiv UHD live-streaming 평가 | "order of magnitude lower power" 인용 |
| HW 인코더는 면적·복잡도 제약으로 일부 기능(B-frame 수·참조 프레임·RDO)을 생략/단순화 | EmergentMind, Wikipedia NVENC | "SW가 최고 화질" hedge 근거 |
| 디스플레이 엔진/디스플레이 컨트롤러는 셰이더와 별개 블록 — 프레임버퍼를 스캔아웃, 오버레이 평면 합성(MPO), 색공간/스케일/회전 | Linux kernel MPO docs, Wikipedia DRM, Grokipedia VDC | display-pipeline 챕터와 크로스링크 |
| MPO(Multiplane Overlay) = 고정기능으로 평면 합성 → 셰이더 합성 생략, 전력 절약 | Linux kernel amdgpu MPO docs | 확정 |

## 세대/코덱 (주의: 자료마다 세대 번호가 갈림 — 낮은 신뢰도/주의)

- NVENC "세대" 번호는 NVIDIA가 공식 일관 표기를 안 해 자료마다 다르다(Kepler=1세대 vs 다른 카운트).
  본문은 세대 숫자 대신 **아키텍처 이름(Kepler/Maxwell/Pascal/Turing/Ampere/Ada)** 으로 적었다.
- 정확한 세대별 코덱/프로파일·B-frame·4:4:4 지원 매트릭스는 SKU·드라이버·SDK 버전에 따라 달라지므로,
  본문은 "대표 흐름"만 제시하고 정확한 매트릭스는 NVIDIA Video Codec SDK Application Note를 보라고 안내.

## 주요 URL

- NVIDIA Video Codec SDK: https://developer.nvidia.com/video-codec-sdk
- NVIDIA, AV1 and Ada Lovelace: https://developer.nvidia.com/blog/improving-video-quality-and-performance-with-av1-and-nvidia-ada-lovelace-architecture/
- NVIDIA, 8K60 Split-Frame Encoding: https://developer.nvidia.com/blog/video-encoding-at-8k60-with-split-frame-encoding-and-nvidia-ada-lovelace-architecture/
- Wikipedia, NVENC (세대별·코덱): https://en.wikipedia.org/wiki/NVENC
- HandBrake, NVENC 문서: https://handbrake.fr/docs/en/latest/technical/video-nvenc.html
- EmergentMind, Hardware-Accelerated Video Encoders / NVENC: https://www.emergentmind.com/topics/hardware-accelerated-video-encoders · https://www.emergentmind.com/topics/nvidia-encoder-nvenc
- arXiv, HW 인코더 UHD live-streaming 평가: https://arxiv.org/html/2511.18686v1
- Linux kernel, Multiplane Overlay (MPO): https://docs.kernel.org/gpu/amdgpu/display/mpo-overview.html
- Wikipedia, Direct Rendering Manager (display engine as separate engine): https://en.wikipedia.org/wiki/Direct_Rendering_Manager

## 검수 메모

- 데모는 모두 정적 도식. `BlockDataflow.tsx`(고정기능 블록 vs 셰이더 코어 데이터 흐름)와
  `DecodeDisplayPath.tsx`(디코드→VRAM→디스플레이 엔진 스캔아웃)는 본문 §고정기능·§디스플레이와 정합.
- 정확한 화질/전력 배수는 워크로드·튜닝 의존 → 본문은 "수십 분의 1 전력" 정도로만, 정밀 수치 회피.
