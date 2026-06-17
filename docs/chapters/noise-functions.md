# 챕터 핸드오프: 노이즈 함수 (noise-functions)

> section: **절차적 생성** · 작성: L2 집필 에이전트 · 상태: 초안 완료, L1 검토 대기

## 챕터 목적

절차적 노이즈를 **결과 텍스처가 아니라 만들어지는 과정**으로 이해시킨다. 격자 위 무작위
값/그래디언트 → 보간·완화 → 부드러운 필드 → fBm 옥타브 합 → 도메인 워핑의 흐름을, 글·수식과
6개의 인터랙티브 위젯으로 단계별로 보여준다. 데스크톱·모바일 모두에서 부드럽게 동작해야 한다.

## 파일

- 본문(MDX): `src/pages/chapters/noise-functions.mdx`
- 위젯 6종: `src/components/demos/noise-functions/*.tsx`
- 공용 노이즈 헬퍼: `src/components/demos/noise-functions/noise.ts`
- 본 문서: `docs/chapters/noise-functions.md`

> `src/chapters.ts`에는 아직 등록하지 않음(작업 지시상 L2가 건드리지 않음). L1이 `{ slug:
> 'noise-functions', title: '노이즈 함수', description: ..., section: '절차적 생성' }`을 순서에
> 맞게 추가해야 사이드바·이전/다음에 노출됨.

## 공용 헬퍼 (`noise.ts`) — 모든 위젯이 공유

순수 함수 모음. 모든 난수는 **정수 해시 기반 결정적 PRNG**(같은 좌표·seed ⇒ 같은 값)라 SSR
안전하고 seed 재현이 된다. 무거운 필드 생성은 위젯의 client effect 안에서만 호출한다.

수학 노트:

- **해시**: `hashU32`(32비트 비트 믹싱) + 큰 소수 가중(`374761393`, `668265263`)으로 좌표 분리.
  `valueAt(ix,iy,seed) ∈ [0,1)`, `gradientAt`는 해시 각도로 만든 단위 벡터.
- **완화**: `smoothstep = 3t²−2t³`(1차 도함수 0), `quintic = 6t⁵−15t⁴+10t³`(1·2차 도함수 0).
- **value noise 2D**: 코너 4개 양선형 보간, 완화는 보간 비율 $f_x,f_y$에 적용.
- **Perlin 2D**: $n(p)=\sum w_i\,(g_i\cdot(p-c_i))$. 격자점에서 오프셋 0 ⇒ 값 0. 시각화용
  `perlin2D01`은 ×(1/√2) 후 0.5 시프트.
- **simplex 2D**: `F2 = (√3−1)/2` skew, `G2 = (3−√3)/6` unskew. 점이 속한 삼각형의 3개 꼭짓점만
  기여, 각 기여 `(0.5−r²)⁴·(g·d)`, 최종 ×70 스케일 보정.
- **fBm**: $\sum_i g^i\,\text{noise}(l^i p)$. lacunarity·gain·octaves·base(value|perlin) 인자.
  층끼리 겹쳐 보이지 않게 옥타브마다 seed에 `o*1013`을 더함. 진폭 합으로 정규화 후 [0,1] 매핑.
  `fbmOctave`는 단일 옥타브 기여(썸네일용).

## 위젯 6종

> 렌더 방식: **6개 모두 plain React + 2D `<canvas>`** (R3F/DemoCanvas 미사용). 격자·단면·라벨을
> 또렷하게 그리기에 2D 캔버스가 최적이고 모바일에서 가볍다. 모두 DPR 상한 2, `width:100%` +
> ResizeObserver 반응형, `--text/--accent/--muted/--border/--surface/--bg` CSS 변수로 테마 대응
> (data-theme MutationObserver로 토글 시 재렌더). 노이즈 값 자체는 관례대로 grayscale 램프.

| # | 위젯 | 보여주는 것 | PROCESS/RESULT |
|---|------|-------------|----------------|
| 1 | ValueNoise1D | 1D 격자 난수 점 + 보간 곡선 | PROCESS |
| 2 | LatticeField2D | 2D value 필드 + 셀 코너값 + 가로 단면 | PROCESS |
| 3 | GradientVsValue | value vs Perlin, 그래디언트 화살표 | PROCESS |
| 4 | NoiseCompare | value/Perlin/simplex 3패널, 같은 seed | RESULT(공유 seed로 구성 차이 강조) |
| 5 | FbmOctaves | 옥타브 합 + 옥타브별 썸네일 | PROCESS |
| 6 | LiveField | fBm 놀이터 + 도메인 워핑 + 애니메이션 | PROCESS/PLAY |

### 1. ValueNoise1D — `ValueNoise1D.tsx`

- 개념: 정수 격자점의 무작위 값(점) 사이를 완화 보간한 1D 곡선.
- 컨트롤: `격자점 개수(주파수)` 2–24, `seed` 1–64, `보간 방식`(linear/smoothstep/quintic),
  `격자점 표시` 토글.
- 의도: 선형의 꺾임 vs quintic의 매끈함을 눈으로 비교. 곡선이 knot을 반드시 통과함을 강조.

### 2. LatticeField2D — `LatticeField2D.tsx`

- 개념: 2D value 필드(ImageData grayscale). 격자 오버레이로 프로브 셀의 코너 4값 라벨, 양선형
  혼합 직관. 필드 아래 두 번째 캔버스에 프로브 y의 **가로 단면** 곡선을 실시간 표시.
- 컨트롤: `주파수(셀 수)` 2–12, `seed`, `완화 방식`, `격자·코너값 표시` 토글.
- 상호작용: 필드 **포인터 드래그**로 프로브 이동(`setPointerCapture`, `touch-action:none`으로
  모바일 스크롤 방지).
- 의도: "코너는 무작위, 내부는 보간, 단면이 곧 노이즈 함수의 한 줄"을 체감.

### 3. GradientVsValue — `GradientVsValue.tsx`

- 개념: 같은 seed로 value(좌) vs Perlin(우). Perlin 패널에 격자점 무작위 그래디언트를 **화살표**로
  그림(+ 격자점 점). 내적 보간이 격자점에서 0 → 중간 회색.
- 컨트롤: `주파수` 2–10, `seed`, `그래디언트 화살표` 토글.
- 의도: value의 격자 자국 vs Perlin의 등방성, 화살표로 내적 직관.

### 4. NoiseCompare — `NoiseCompare.tsx`

- 개념: value/Perlin/simplex 3패널, 같은 seed. (대부분 결과 비교지만 공유 seed라 "같은 무작위,
  다른 구성"이 분명.)
- 컨트롤: `주파수` 2–12, `seed`.
- 의도: 격자 자국(value) / 축 편향(Perlin) / 균일·등방(simplex) 대비.

### 5. FbmOctaves — `FbmOctaves.tsx`

- 개념: 위 = 옥타브 합 필드, 아래 = 옥타브별 단독 기여 썸네일 행(비활성 옥타브는 어둡게). base는
  Perlin, lacunarity 2 고정, base 주파수 3.
- 컨트롤: `옥타브 수` 1–6, `gain` 0.2–0.8(기본 0.5), `seed`. 썸네일 라벨에 진폭 `gain^o` 표시.
- 의도: 옥타브를 더할수록 디테일이 **누적**되는 과정을 지켜보게 함.

### 6. LiveField — `LiveField.tsx`

- 개념: fBm(octaves 4 고정) 놀이터 + 도메인 워핑 토글. 워핑 시
  `(x + s·n(x,y), y + s·n(x+5.2, y+1.3))`. 애니메이션 시 시간 오프셋으로 흐름.
- 컨트롤: `주파수` 1–8, `seed`, `기본 노이즈`(perlin/value), `완화`, `도메인 워핑` 토글,
  `워핑 강도` 0–2, `애니메이션` 토글.
- 성능: 150×150 오프스크린 버퍼를 CSS로 업스케일(`drawImage`, 보간 on). 애니메이션 off면
  파라미터 해시 변화 시에만 재렌더(배터리 절약). 파라미터는 ref로 들어 RAF 루프 미재시작.
- 의도: "노이즈를 자기 좌표에 먹이면 유기적 패턴" 놀이.

## 참여(engagement) 의도

매 절마다 위젯이 바로 뒤에 오고, 리드인 문장이 "무엇을 해보라"를 지시한다. 드래그 가능한
프로브(2번), 화살표 토글(3번), 옥타브 누적(5번), 도메인 워핑·애니메이션(6번)으로 손이 계속
움직이게 한다. 놀라움 포인트: quintic이 격자 자국을 없애는 것, Perlin이 격자점에서 0인 것,
도메인 워핑 한 줄로 대리석이 생기는 것.

## 한계 / TODO / L1 검토 포인트

- `src/chapters.ts` 등록 필요(위 참조). slug: `noise-functions`, section: `절차적 생성`.
- **타입체크 미실행**: 지시상 L2는 `npm run check`/build를 돌리지 않음. L1이 `astro check`로
  TS strict 통과 확인 권장. 의도적으로 `any` 미사용.
- LiveField는 애니메이션 ON일 때 매 프레임 150² fBm(=22500점 × 옥타브4, 워핑 시 ×3)을 CPU로
  계산한다. 저사양 모바일에서 무거우면: (a) 기본 애니메이션 OFF로 바꾸거나, (b) 해상도 RES를
  120으로 낮추거나, (c) GPU 셰이더(R3F + DemoCanvas)로 이식 고려. 현재는 부드러움/단순함 균형상
  CPU 저해상도+업스케일 채택.
- 색 램프는 노이즈 값에 grayscale 사용(관례적·테마 무관). 원하면 `--accent` 기반 히트 램프로 교체
  가능.
- 두 패널/세 패널 위젯은 flex-wrap으로 좁은 화면에서 세로로 쌓임 — 모바일에서 정상.

## 확장 아이디어

- 3D/4D 노이즈(시간 축 슬라이스로 애니메이션), GPU 텍스처 노이즈.
- Worley/cellular, ridged/turbulence 변형(`noise.ts`에 함수 추가 → 새 위젯).
- 타일링 노이즈(주기 격자 해시) 데모.
- LatticeField2D에 세로 단면도 추가하면 양선형 직관이 더 강해짐.
