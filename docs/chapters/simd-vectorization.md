# 핸드오프 — simd-vectorization ("SIMD와 벡터화")

## 목적 / 범위
CPU SIMD의 직관(한 명령·여러 lane) → 폭(SSE/AVX/AVX-512, NEON/SVE) → 메모리 배치(AoS/SoA) →
정렬·마스킹·gather/scatter → 자동 벡터화 vs intrinsics → AVX-512 다운클럭(한 줄). 그래픽스 연결로
SIMT(./gpu-execution-model)와 대비. 캐시 챕터(./cpu-memory-hierarchy)와 연결.
다루지 않음: 구체 intrinsic API 레퍼런스, 컴파일러별 플래그 상세, SVE 프로그래밍 모델 심화.

## 위젯 (모두 정적 2D canvas, 내부폭 360, 테마 반응 — MutationObserver 재그리기)
- `ScalarVsSimd.tsx` — 스칼라 4회 vs SIMD 1회(4-wide) lane 다이어그램. **결과보다 메커니즘**(같은
  덧셈을 lane 병렬로). 파라미터 없음(고정 도식).
- `AosVsSoa.tsx` — 같은 입자 4개를 AoS/SoA로 배치, "x 4개 모으기"가 stride-3 gather vs 연속 load임을
  강조(진한 칸=x lane). SIMD load와 메모리 레이아웃의 관계를 보임.
- `MaskGather.tsx` — 위: mask 레지스터(k)가 lane on/off, 아래: 인덱스 벡터로 흩어진 메모리에서
  gather(화살표). 조건/불규칙 접근의 벡터화 도구.

## 기술 노트 / 단순화
- lane 다이어그램은 4-wide로 고정(폭 비교는 본문 표). 실제 AVX-512는 16 lane.
- AoS/SoA는 입자 4개·3필드로 축약(도식). AVX-512 다운클럭은 세대 의존이라 "Skylake-X 기준, Ice
  Lake 이후 완화"로 한 줄만.
- 모든 수치는 docs/sources/simd-vectorization-sources.md에서 ≥2 출처 교차확인.

## TODO / 확장
- chapters.ts에서 이 슬러그 `draft: true` 해제 필요(오케스트레이터가 중앙 등록).
- RELATED에 simd-vectorization ↔ gpu-execution-model, cpu-memory-hierarchy 간선 추가 고려.
- 확장: AoSoA 시각화, 자동 벡터화 리포트 예시, SVE vector-length-agnostic 도식.
