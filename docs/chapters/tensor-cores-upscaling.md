# 핸드오프 — Tensor Core와 AI 업스케일링

## 목적·범위
아래에서 위로: tensor core가 무슨 회로인가(4×4 MMA, systolic) → 정밀도 사다리 → 그 위의
temporal upscaling(jitter+reproject+history) → DLSS/FSR/XeSS의 "같은 뼈대 다른 두뇌". 어디서
멈췄나: 망 학습 세부, frame gen/ray reconstruction은 details 박스로만, neural rendering은
더 나아가기 포인터. CUDA 프로그래밍/WMMA API는 다루지 않음.

## 위젯
1. `MACArray.tsx` — **과정**(systolic 파동). weight-stationary MAC array에서 입력이 한 클럭씩
   전진(i+j==step 대각 파동), 부분합 세로 누적, 열 밑에서 c 출력. 파라미터: clock 슬라이더.
   **개념적 analogy**(NVIDIA 내부 비공개, TPU식)임을 캡션·본문에 명시.
2. `PrecisionLadder.tsx` — **정적**. FP32/TF32/FP16/BF16/FP8 E4M3·E5M2/INT8의 sign·exp·mantissa
   비트 폭 막대. exp=범위, mantissa=정밀도. BF16/TF32가 exp 8 유지(범위)하는 두 갈래를 보여줌.
   draw-once. 세대 라벨은 본문 표와 일치.
3. `TemporalJitter.tsx` — **과정**(시간 누적). Halton(2,3) 서브픽셀 jitter 샘플을 N프레임 쌓아
   비스듬한 에지를 고해상도로 재구성(왼=1프레임, 오=누적). "history 안 버림" 토글로 disocclusion
   ghosting 시연. 파라미터: 누적 프레임 수, 고스팅 토글. (단순화: 실제 reproject 아닌 교육용 혼합.)

## 기술 노트
- 모든 2D 위젯: dpr≤2, device-resolution(§5.1 B) 또는 벡터, 테마 MutationObserver, touch-action none.
- TemporalJitter: ground truth는 대각 에지 f(x,y). 빈 셀은 단순 행 보간으로 채움(시각화용).
- MACArray N=3, maxStep=2N. clock 파동은 systolic skew의 단순화.

## 수치/근거
- 64FMA/128FLOP/8코어·1024FLOP/SM, 정밀도 세대표, DLSS 모드 67/58/50/33%(축당, 픽셀수=제곱),
  FSR2/3 비-ML, XeSS XMX+DP4a는 `docs/sources/tensor-cores-upscaling-sources.md` 참조.
- 마케팅 집계(Volta 8×/12×, sparsity 2×, DLSS4 수치)는 본문에서 플래그.

## 서사 의도
훅="적게 그렸는데 더 좋아 보인다 — 공짜 점심?". 두 겹 답(무엇을/무엇으로 계산). §3-4가 클라이맥스:
temporal upscaling=시간에 흩뿌린 supersampling, 진짜 어려운 건 stale history 버리기 → α 가중치
→ "ML이냐 휴리스틱이냐"가 DLSS/FSR를 가름.

## TODO/확장
- §3 위젯에 motion-vector reproject를 실제로 적용한 버전(현재는 jitter 누적+강제 고스팅).
- neural rendering(Cooperative Vectors) 챕터가 생기면 상호링크.
- FSR 4 / DLSS 4 후속(transformer)은 시점 의존 — 갱신 시 sources의 "미확정" 메모 확인.

## 관련 토픽 (chapters.ts RELATED 제안)
gpu-execution-model(CUDA 코어 대비), memory-bandwidth-roofline(FP8/INT8 대역폭 동기),
raytracing-hardware(ray reconstruction), variable-rate-shading(둘 다 "적게 그리고 잘 보이기").
