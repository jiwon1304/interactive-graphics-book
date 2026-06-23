# GPU 전력·클럭(DVFS)과 thermal throttling — 출처와 검증 노트

집필·검수 시 사용한 1차/전문가 자료와, 본문 핵심 사실 ↔ 출처 대응.

## 핵심 사실 ↔ 출처

| 본문 주장 | 출처 | 비고 |
|---|---|---|
| GPU는 power·thermal·voltage 세 한계에 막힘, 먼저 닿는 게 병목 | NVIDIA Grace Power/Thermals, 전문가 정리(Pado Pado) | 확정(개념) |
| DVFS = 전압·주파수 실시간 조정해 TDP 안 유지 | NVIDIA Grace Power/Thermals, arXiv 1404.4629 | 확정 |
| 동적 전력 P = αCV²f | arXiv 1404.4629, ScienceDirect dynamic power | 확정(교과서적) |
| 전력은 V²에 비례, f는 선형, 고클럭엔 고전압 필요 → superlinear | ScienceDirect, arXiv 1404.4629 | 확정 |
| f ∝ V^(αc−1), αc≈1~2 (alpha-power law) | arXiv(검색 인용), DVFS 문헌 | 확정 |
| NVIDIA GPU Boost: TDP 근처로 코어 주파수 스케일, 가변 | NVIDIA GPU Boost 자료 | 확정(개념), 세대별 동작 차이 |
| AMD 동적 클럭(상응 기술) | 전문가 정리 | 확정(개념) |
| boost = 보장 아닌 가변 상한 | NVIDIA GPU Boost 설명, 통념 | 확정 |
| thermal throttling: 온도 한계 시 클럭/전압 down 보호 | 다수 자료(GGFix 등 일반 자료) | 확정(개념) |
| RTX 4090 TBP 450W | Tom's HW(교차), NVIDIA spec | 확정 |
| RX 7900 XTX TBP 355W | Tom's HW RX7900 리뷰, AMD spec | 확정 |
| 노트북 GPU TGP 35~115W 가변 | 전문가 정리/리뷰 | 확정(범위) |
| 약간 낮은 클럭(언더볼트/파워리밋)이 효율적 | Lambda Docs, arXiv 1407.8116 | 확정 |
| 대역폭=전력 (메모리 이동도 전력) | tile-based-rendering 챕터·roofline 통념 | 크로스링크 |

## 마케팅/미확정 (본문에서 완화·플래그)

- **throttle 온도(~83~90℃)·sustained 클럭·부스트 유지 시간**: 카드/BIOS/냉각/실리콘마다 크게 다름
  → 본문·도식 수치는 전부 **대표값**으로 명시. **낮은 신뢰도/주의.**
- 데모 곡선(ThrottleCurve/PowerClockCurve)은 정성적 형태만 정확 — 절대 수치 아님(figcaption 명시).
- RTX 3090 350W는 널리 알려진 값이나 본문에선 4090/7900XTX(교차확인된 값)만 단정 인용.

## 주요 URL

- https://docs.nvidia.com/dccpu/grace-perf-tuning-guide/power-thermals.html
- https://arxiv.org/pdf/1404.4629 (GPU energy efficiency survey: P=αCV²f, DVFS)
- https://arxiv.org/pdf/1407.8116 (temperature/frequency/voltage effects)
- https://docs.lambda.ai/hardware/servers/set-lower-gpu-power-limits/
- https://www.tomshardware.com/reviews/amd-radeon-rx-7900-xtx-and-xt-review-shooting-for-the-top (355W)
- https://www.sciencedirect.com/topics/computer-science/dynamic-power-consumption

## 검수 메모

- 수식 P ∝ V²f는 본문 KaTeX 블록으로 유도 맥락과 함께 제시(나열 아님).
- 세 데모 모두 "도식용 대표값" figcaption 명시. throttle/sustained 절대 수치 비단정.
