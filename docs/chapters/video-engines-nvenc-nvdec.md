# 핸드오프 노트 — `video-engines-nvenc-nvdec` (비디오 엔진 — NVENC/NVDEC와 디스플레이 엔진)

## 목적과 범위
GPU 안의 **고정기능 비디오 블록**(NVENC 인코드 · NVDEC 디코드)과 **디스플레이 엔진**이 셰이더
코어와 분리된 별도 회로라는 점을 가르친다. 훅: "게임을 돌리며 동시에 인코딩해도 프레임이 안 떨어지는
이유". 다루는 범위: 고정기능 vs 셰이더 분리, 왜 전용 블록인가(전력·지연), 인코드 파이프라인 개요
(ME→변환/양자화→엔트로피), 코덱(H.264/HEVC/AV1, AV1 인코딩은 Ada부터), 디스플레이 엔진/스캔아웃/
MPO 합성, 스트리밍·녹화 사용례.

**멈춘 곳:** 코덱 내부(DCT·CABAC 수학), B-frame 구조, 디스플레이 스캔아웃 이후(VBlank/VRR — 이건
display-pipeline 챕터로 크로스링크).

## 그림 목록 (전부 STATIC 2D 캔버스 · MutationObserver 테마 redraw · CSS 변수 색)
1. **BlockDataflow.tsx** — GPU 다이 안 셰이더 코어 vs NVENC/NVDEC 블록, 공유 VRAM 경유 데이터 흐름.
   가르치는 것: 두 블록이 분리돼 동시 동작(과정형 — 데이터가 어디로 흐르나).
2. **EncodePipeline.tsx** — 인코드 5단계 세로 스택(입력→ME→변환/양자화→엔트로피→비트스트림). ME를
   강조색으로(가장 비쌈).
3. **DecodeDisplayPath.tsx** — NVDEC→VRAM→디스플레이 엔진(MPO 합성)→모니터 세로 경로. display-pipeline
   크로스링크를 figcaption에 둠.

## 기술 노트 / 정확도
- NVENC 세대 번호는 자료마다 카운트가 달라(공식 일관 표기 없음) **아키텍처 이름**으로 표기. 출처
  노트(`docs/sources/video-engines-nvenc-nvdec-sources.md`)에 "낮은 신뢰도/주의"로 명시.
- AV1: 디코드(Ampere)와 인코드(Ada) 시점이 다름 — 본문에서 구분.
- "수십 분의 1 전력"은 EmergentMind/arXiv의 "order of magnitude" 근거. 정밀 배수는 회피.
- NVENC 개수(소비자 2 / 프로 3), 8K60 split-frame encoding은 Ada 한정.

## 확장 방법 / 관련 토픽
- display-pipeline(스캔아웃 이후), cpu-gpu-transfer(VRAM), texture-compression(고정기능 디코드 비교).
- chapters.ts RELATED 후보: `video-engines-nvenc-nvdec: ['display-pipeline']`(오케스트레이터가 등록).
