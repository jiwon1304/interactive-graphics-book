# 핸드오프 — Variable Rate Shading

## 목적·범위
셰이딩 rate를 visibility/coverage에서 분리한다는 VRS의 핵심을 정확히 전달. 어디까지: coarse
pixel 의미(셰이딩만 broadcast, coverage/depth는 full), rate 단계(1x1~4x4), 세 source+2단
combiner(D3D12, Vulkan 대응), derivative→mip로 번지는 화질 영향, 적응 정책(foveated/CAS/MAS),
MSAA와의 직교. 어디서 멈췄나: 실제 셰이더 코드/구현, mesh shader per-prim 상세, sampler
feedback 연계는 다루지 않음(더 나아가기에서 포인터만).

## 위젯
1. `CoarsePixel.tsx` — **과정**. 같은 표면을 shading rate(1x1~4x4)로 바꿔 그림. 점=실제
   셰이딩된 픽셀, 그 색이 블록으로 broadcast. specular(고주파)는 뭉개지고 그라데이션(저주파)은
   버팀 → §1의 비대칭을 손으로 확인. 파라미터: rate, 셰이딩점 표시 토글. (단순화: coverage/depth
   full 해상도는 그림이 아니라 본문에서 설명.)
2. `Combiners.tsx` — **과정**(두 단계 결합). 세 source(per-draw/per-prim/image)가 두 combiner를
   거쳐 최종 rate가 되는 흐름도 + op 선택(passthrough/override/min/max/sum). min=고운 쪽, max=거친
   쪽. 입력값은 데모용 고정 대표값(2x1·1x2·2x2).

## 기술 노트
- D3D12 명세 기준. Vulkan은 details 박스에서만(MUL≠sum 차이 명시).
- combiner op 의미는 명세와 일치(축 log2값에서 min/max/add-saturate).
- 모든 2D 위젯: device-resolution putImageData(§5.1 B 패턴) 또는 벡터, dpr≤2, 테마 MutationObserver,
  touch-action none. 컨트롤은 Canvas 밖.

## 수치/근거
- 타일 8/16, rate 목록, tier, HW 도입연도, ~14%(Gears, 1인칭)·15~20%(NVIDIA 마케팅 플래그)는
  `docs/sources/variable-rate-shading-sources.md` 참조.

## 서사 의도
훅="모든 픽셀에 똑같은 정성을 들일 필요가 있나?". §1에서 "절반 해상도와 뭐가 다른가"를 명확히
구분(에지는 그대로). §4에서 흐림의 진짜 원인이 mip이라는 반전. 종합: "주의의 지도".

## TODO/확장
- 3D DemoCanvas 버전(실제 셰이딩된 구 + 화면 image 페인팅)으로 §5를 인터랙티브화 가능.
- mesh-shader/GPU-driven culling 챕터가 생기면 per-primitive rate로 상호링크.
- sampler feedback 챕터와 "화면 어디를 곱게/거칠게" 정책 공유 → RELATED 후보.

## 관련 토픽 (chapters.ts RELATED 제안)
texture-filtering-mipmapping(derivative/mip), rendering-execution-model(픽셀 쿼드),
memory-bandwidth-roofline(병목), graphics-pipeline-journey(MSAA/coverage).
