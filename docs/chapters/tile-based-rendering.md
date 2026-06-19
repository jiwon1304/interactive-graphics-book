# 핸드오프 노트 — Tile-Based Rendering과 모바일 GPU

`slug: tile-based-rendering` · 작성 L2 · 토픽 카탈로그 §E(59~73, hw-rendering)

## 목적 / 범위

"모바일 GPU는 왜 화면을 타일로 나눠 그리는가"에 답하는 챕터. 핵심 명제는 **DRAM 대역폭 =
전력**. IMR(데스크톱식 즉시 모드)이 모든 프래그먼트를 DRAM 프레임버퍼에 read/write 하는 데
반해, TBR/TBDR은 화면을 16×16~32×32 타일로 나눠 온칩 SRAM(GMEM)에서 한 타일을 완성하고
끝에 한 번만 DRAM에 쓴다. 대가는 geometry를 먼저 다 처리하는 binning pass(parameter buffer).

**다루는 것**: IMR vs TBR 외부 트래픽, GMEM 타일 크기 계산, binning/parameter buffer,
대역폭 절감비 유도(2d → 실측 ~1.96×), HSR/zero overdraw, 모바일 z-prepass 역효과,
HSR을 깨는 것(반투명·discard·SV_Depth)과 제출 순서 황금률, load/store op, 대역폭=전력(pJ/byte).

**멈춘 곳(포인터만)**: subpass on-tile deferred, PLS/framebuffer fetch, Adreno FlexRender/LRZ,
Apple imageblock/tile shader/memoryless — §9 "더 나아가기"에 링크/언급만.

## 위젯표 (5개)

| # | 컴포넌트 | 종류 | 가르치는 것 | 과정/결과 | 주요 파라미터 |
|---|----------|------|------------|----------|--------------|
| 1 | `ImrVsTbr.tsx` | I | overdraw↑ 시 IMR 외부 DRAM 접근은 비례(×2d), TBR은 불변(=1) | 과정 | overdraw 1~12 |
| 2 | `TileBinning.tsx` | S | geometry→binning(타일별 prim 리스트)→render 데이터플로; 삼각형이 어느 타일에 걸치나 | 정적 | 없음(고정 삼각형 3개) |
| 3 | `BandwidthCalc.tsx` | I | 해상도·overdraw·fps → IMR vs TBR GB/s 막대 + 절감 배수 | 계산기 | 해상도·overdraw 1~10·fps 30~120 |
| 4 | `HsrOverdraw.tsx` | I | HSR on=픽셀당 셰이딩 1×(zero overdraw); off 또는 반투명/discard=레이어 수 | 과정 | HSR 토글·HSR깨기 토글 |
| 5 | `BandwidthIsPower.tsx` | I | 외부 트래픽 바이트 → 에너지(mW); DRAM ~100 pJ/byte vs 온칩 ~1 | 과정 | 프레임당 MB 5~120 |

도식 규칙 준수: 메커니즘/데이터플로(binning)는 정적, 시각적 트레이드오프(overdraw·대역폭·HSR·전력)는 인터랙티브.

## 유도한 수학 (본문 KaTeX)

- 훅 숫자: 1080p·od4·60fps IMR color ≈ 3.8 GB/s (`1920×1080×4×2×4×60`).
- IMR 외부 트래픽: `B_IMR ≈ W·H·b·(r+w)·d·F`, color RMW(r+w=2) → `2·WH·b·d·F`.
- TBR: `B_TBR ≈ W·H·b·F + parameter buffer` (color 타일당 1회 write, d 항 소거).
- GMEM 타일: 32×32×(4+4)B = 8KB; MSAA4× ≈ 32KB; vs 1080p FB 전체 ≈ 16.6MB(못 올림).
- 절감비: `B_IMR/B_TBR ≈ 2d` (이론), 실측 보수값 ~1.96×.
- 대역폭=전력: DRAM 60~150 pJ/byte, 온칩 ~1, FLOP ~0.05 pJ(DRAM 1B의 ~1/2000).

## 단순화 / 근사 (검수 주의)

- **color 트래픽만 모델** (depth 트래픽 제외). 본문·figcaption에서 명시했고, "depth 넣으면 IMR이
  더 불리 → 실제 절감 더 큼"으로 보정. `bandwidth()`는 IMR=`px·bpp·2·od·fps`, TBR=`px·bpp·1·fps+param`.
- **parameter buffer 프레임당 8MB 고정 가정** (BandwidthCalc). 실제는 지오메트리량 의존. 도식용.
- **절감비 ~1.96×**: 업계에서 흔히 인용되는 대표값(ARM 등 자료 기반). 콘텐츠 의존이라 본문은 "보수적 추정"으로 표현.
- **HsrOverdraw**: HSR 효과를 이산 모델(보이는 1개 vs 전부)로. 실제 HSR은 더 정교(on-chip depth resolve)하지만 셰이딩 횟수 결과는 동일.
- **에너지 mW 환산**: `bytes/s × pJ/byte / 1e9 = mW`. pJ/byte 값은 대표값(범위 중앙).
- pJ/FLOP·pJ/byte 절대값은 공정·세대 의존 — 비대칭(~수백~수천×)이 요지이며 본문도 그렇게 표현.

## 기술 노트

- 헬퍼: `tbr2d.ts`(tf2d.ts 복사·적응 — readTheme/observeTheme/setupCanvas/withAlpha/roundRect/
  label/drawArrow/monoFont/COLORS/pointerToCanvas + 대역폭/전력 모델 함수), `useCanvas2d.ts`(헬퍼
  import 버전), `usePointerDrag.ts`(복사 — 현재 위젯들은 드래그 미사용이나 규약대로 비치).
- 캔버스 텍스처/격자는 fillRect로만(§5.1 putImageData 함정 회피). putImageData 미사용.
- COLORS `as const`, 가변 색은 `let col: string` (HsrOverdraw). 미사용 import 없음.
- 모든 위젯 컨트롤은 `<Canvas>` 밖(2D canvas + ControlPanel). three 미사용(전부 2D 도식).

## chapters.ts 등록 제안 항목

배열에서 `texture-compression` **다음**(hw-rendering 섹션 흐름: rendering-execution-model →
texture-filtering-mipmapping → texture-compression → **tile-based-rendering**)에 추가 제안:

```ts
{
  slug: 'tile-based-rendering',
  title: 'Tile-Based Rendering과 모바일 GPU',
  description: '모바일 GPU가 화면을 타일로 그리는 이유 — DRAM 대역폭과 전력. IMR vs TBR/TBDR, GMEM·binning·HSR·overdraw·load/store op',
  section: 'GPU ↔ 렌더링',
}
```

(확인함: 같은 섹션의 rendering-execution-model / texture-filtering-mipmapping / texture-compression 가 모두 `section: 'GPU ↔ 렌더링'` 을 씀.)

## 검증 필요 (TODO)

- `npm run check`(TS strict) · `npm run build` — 본 에이전트는 병렬 규약상 미실행. 오케스트레이터가 중앙 검증.
- **브라우저 렌더 확인**(§7): 5개 위젯 라이트/다크 양쪽, 모바일 폭에서 막대/격자 레이아웃 안 깨지는지.
  특히 ImrVsTbr는 overdraw 12×에서 레이어 스택 높이(layerH 최소화)·막대 캡션 위치 확인.
- TileBinning `triCoversTile`은 4×4 샘플 근사라 아주 얇은 삼각형은 일부 타일을 놓칠 수 있음(도식이라 무방).
- y-down(§5.5): 모든 그리기가 위→아래 단순 레이아웃이라 방향 부호 이슈 없음(화살표는 binning 가로 방향만).

## 서사 의도

훅(폰 GPU는 근본적으로 다르다 + 3.8GB/s 숫자) → ImrVsTbr로 즉시 체감 → IMR/GMEM/binning 유도 →
대역폭 계산기 → HSR/overdraw(모바일 특유의 함정) → load/store op → 조립 → 대역폭=전력으로 닫기.
"답은 처음부터 끝까지 대역폭과 전력"을 반복 모티프로. rendering-execution-model(early-Z·overdraw),
texture-compression(직교 절감), command-queues(제출)로 상호 링크.
