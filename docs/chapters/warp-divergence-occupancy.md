# 핸드오프: 워프 다이버전스와 점유율 (`warp-divergence-occupancy`)

> `gpu-execution-model`(워프·SIMT·락스텝)의 **속편**. 워프를 안다고 가정하고, *동적* 거동을 다룬다:
> 레인이 갈릴 때(다이버전스), 지연을 어떻게 숨기나(스케줄러·점유율), 왜 점유율이 중요한가.
> 섹션 `GPU 실행 모델` · 난이도 중급→심화.

## 구성 / 도식 (전부 정적, 도식 글자 최소·설명은 캡션)
- `DivergenceReconverge.tsx` — if/else에서 then 레인 활성·else 마스킹 직렬화 → IPDOM 재수렴. 비용 = 두 경로의 합.
  본문에서 **ITS(Volta+ 독립 스레드 스케줄링)**를 엄격 재수렴 모델의 보정으로 산문 설명(별도 도식 아님).
- `PredicationVsBranch.tsx` — 분기+마스킹 vs predicated(양쪽 실행 후 선택). 경로 길이에 따른 손익분기.
- `SchedulerScoreboard.tsx` — 4 워프 스케줄러의 사이클별 발행; load stall(스코어보드) 시 다른 eligible 워프로 전환.
- `LatencyHidingLanes.tsx` — 저점유율(빈칸/버블) vs 고점유율(지연 은닉) 두 타임라인. 핵심: 워프수 ≈ 지연/처리량.
- `OccupancyLimiters.tsx` — 자원 막대(레지스터/스레드·SMEM/블록·워프 슬롯·블록 슬롯) 중 무엇이 active warp를 먼저 막나.

## 수학 (유도)
- 점유율 = active warps / max warps, 그리고 무엇이 상한을 정하나(레지스터·공유메모리·슬롯).
- **지연 은닉**: 필요한 워프 수 ≈ 지연 / 처리량 (Little's law 직관으로 유도).
- 다이버전스 직렬화 비용 = 양쪽 경로 합. 프레디케이션 손익분기 = 경로 길이.

## 규약
- 헬퍼는 폴더 자체 포함: `wdo2d.ts`(gem2d.ts 패턴) + `useCanvas2d.ts`. 테마 인식·HiDPI·`putImageData` 미사용.
- 정적 도식: `useCanvas2d(draw, [])`, 컨트롤/state/rAF 없음.

## 검수 필요 (브라우저 재연결 시)
- 라이트/다크 + 모바일(~360px)에서 5개 도식 **글자 겹침/잘림** 확인(특히 SchedulerScoreboard 사이클 격자, OccupancyLimiters 막대 라벨).
- 도식 안 글자가 정말 최소인지, 설명이 캡션에 있는지.
- 수치/수학(점유율·지연 은닉 공식) 한 번 더 교차 확인.
