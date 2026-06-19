# 핸드오프 노트 — 텍스처 압축 (slug: `texture-compression`)

섹션: **GPU ↔ 렌더링** (제안). 작성: L2 writer, 2026-06.

## 챕터 목적과 범위

블록 압축 텍스처가 *왜*·*어떻게* VRAM과 대역폭을 절감하는지를, BC1을 손으로 해부하며
가르친다. 핵심 통찰 하나로 챕터를 꿴다: **블록 압축 = 한 4×4 블록의 16색을, 두 끝점이
잇는 색공간 선분 위 4개 팔레트색으로 투영(projection)**. 거기서 아티팩트(블록·녹색 밴딩),
노멀맵용 BC5(Z 재구성), 하드웨어 디코드(TMU), 채널 패킹(ORM), 슈퍼컴프레션(KTX2)까지 확장.
참고 자료: Nathan Reed, "Understanding BCn Texture Compression Formats."

**다루는 범위 / 멈춘 지점:** BC1을 깊게(끝점·565·팔레트·인덱스·1비트 알파 모드), BC4/5는
중간 깊이(채널 정밀도는 `<details>`에서 보정), BC7/BC6H/ASTC는 개념적 소개(인코딩 알고리즘
세부는 안 들어감). DCC/Z 압축(무손실), 밉맵 결합, 인코더 최적화는 "더 나아가기"로만 포인터.

## 인터랙티브/정적 위젯 목록

모두 `src/components/demos/texture-compression/`. 자체 헬퍼 `tc2d.ts`(sdf2d.ts에서 테마/HiDPI/
blitImage 패턴 + BCn 수학) + 복사한 `usePointerDrag.ts`. 캔버스 안 글자는 라벨 최소, 설명은
전부 `<figcaption>`(MDX).

1. **WhyCompress.tsx** — *인터랙티브, 과정+결과*. 포맷(RGBA8/BC1/BC7)·해상도 슬라이더·밉 토글
   → VRAM/대역폭 막대(회색=RGBA8 기준선, 파랑=현재). "texel당 비트수 한 숫자가 메모리·대역폭에
   동시에 비례"를 보임. 8:1 / 75%+ 절감 확인. bpp 표: RGBA8=32, BC1=4, BC7=8.

2. **BC1Block.tsx** — *인터랙티브 드래그(usePointerDrag), 과정*. 챕터의 중심. 4×4 블록 16색을
   RGB 색공간 주평면(2D 투영)에 점으로 뿌리고, 끝점 c0·c1 선분 + 팔레트 4점 + 텍셀 투영선 표시.
   끝점 드래그 → 16텍셀 재양자화, 왼쪽 ‘원본 vs BC1 복원’ 4×4 그리드가 결과 반영. "압축=선분
   투영"을 손으로. ‘자동 끝점’ 버튼=주성분 fit. RGB→2D 투영은 블록색의 power-iteration 주평면.

3. **BlockArtifacts.tsx** — *인터랙티브, 과정/결과*. 절차적 이미지(그라데이션/하늘색 램프/둥근
   하이라이트)를 실제 4×4 BC1 인코딩. 보기 토글 원본↔BC1↔차이×8, 4×4 격자 오버레이. 블록
   파셋 + RGB565 녹색 밴딩(차이뷰의 초록/자홍 틴트)을 드러냄. **blitImage 사용**(HiDPI putImageData
   금지 준수). 소스 64×64.

4. **NormalBC5.tsx** — *인터랙티브, 결과 비교(과정성 있음)*. 절차적 범프 노멀 필드(가우시안 합의
   기울기)를 Lambert 라이팅. 저장 방식 토글: 원본 / BC1-RGB(565로 노멀을 색처럼 → 녹색틴트+계단
   하이라이트) / BC5(x,y 8비트 + z=√(1−x²−y²) 복원 → 매끈). 광원 방향 슬라이더로 하이라이트 쓸기.
   2D 라이팅 비교(풀 3D 노멀맵 라이팅 대신)로 가볍게.

5. **HardwareDecode.tsx** — *정적 도식*. VRAM→L2(압축)→TMU(디코드)→셰이더코어(RGBA) 4박스
   데이터플로 + 화살표. 압축 구간(파랑 띠) vs 비압축 구간(짧은 꼬리)을 색띠로. "디코드 위치가
   곧 이득"을 시각화. 비-렌더링 데이터플로라 정적(가이드 §1 경험칙).

6. **ChannelPacking.tsx** — *인터랙티브, 분해*. 절차적 흑백 3장(AO/Rough/Metal)을 ORM 한 장의
   R/G/B로 패킹. R/G/B 토글로 채널을 켜고 꺼 어느 맵이 어느 채널인지 분해. "샘플 1/3 + 블록
   압축과 직교해 곱으로 쌓임"을 가르침.

## 유도된 수학 (MDX, KaTeX)

- BC1 비트레이트: 8B/16texel=0.5B/texel=4bpp ⇒ RGBA8 대비 8:1. (RGB8 24bpp 대비 6:1도 언급.)
- 메모리 = W·H·b_px/8, 대역폭 = ×fps. 둘 다 b_px에 비례.
- 팔레트 = {c0, c1, ⅔c0+⅓c1, ⅓c0+⅔c1}; index = argmin ‖p − palette_k‖² (= 선분 투영).
- 노멀 Z 재구성: z=√(1−x²−y²) (탄젠트공간 +z 가정).
- 채널패킹×블록압축 = ⅓·⅛ (직교 절약).

## 기술 노트 / 단순화

- **tc2d.ts blitImage 시그니처가 sdf2d.ts와 다름**: `(ctx, img, dx, dy, dw, dh)`로 위치+크기를
  받아 임의 사각형에 배치(여러 서브이미지를 한 캔버스에 그리려고). `imageSmoothingEnabled=false`로
  블록 경계 또렷하게(확대 시 nearest). 원본 sdf2d.blitImage는 `(ctx,img,w,h)`만.
- **BC1Block의 RGB→2D 투영**은 실제 인코더와 무관한 *시각화용* 평면(블록색 주성분 2축). 끝점
  드래그도 그 평면에 한정(unproject). 끝점은 RGB로 저장하되 표시·히트테스트는 565-스냅 위치.
- **NormalBC5 BC5 근사**: 채널을 "8비트 양자화"로 단순화(실제 BC4 채널은 끝점 8비트+3비트 인덱스
  8단계 보간). `<details>`에서 명시. BC1-RGB 경로는 565 양자화 후 재정규화로 방향 왜곡 재현.
- **fitEndpoints**: power-iteration 주성분 1축의 min/max 투영점을 끝점으로(실제 인코더 휴리스틱의
  단순화). 데모용.
- 모든 절차적 에셋은 코드 생성(외부 fetch 없음). PRNG는 시드형 mulberry32(SSR 안전).
- 색 변수는 TS strict 위해 `RGB = [number,number,number]` 튜플, 가변 hex는 `string`.

## 알려진 한계 / TODO / 확장

- BC1Block 투영 평면이 블록색 분포에 따라 회전한다(주평면이라). 드래그 직관엔 무리 없으나,
  분포가 거의 1D면 v축이 임의로 정해질 수 있음(드물게 점들이 일직선).
- 펀치스루 알파(BC1 모드 플래그), BC3 알파 블록, BC7 파티션 갤러리, ASTC footprint 다이얼,
  ETC2/EAC, KTX2 capability 탐침은 미구현(범위 밖) — 후속 챕터/위젯 후보(topic-catalog §C 34,35,38,
  40,41,45).
- 밉맵 챕터가 생기면 BlockArtifacts/WhyCompress의 밉 토글과 교차링크 강화.

## 서사/재미 의도

훅 = "zip은 무작위 접근이 안 돼 GPU에서 즉사한다 → 블록 압축은 왜 다른가". 중심 반전 =
"압축 = 색공간 선분 투영"(BC1Block에서 손으로). predict-then-reveal: 565의 녹색 비대칭이
아티팩트로 돌아옴(2절 details → 3절 차이뷰). 2-독자 레이어링: 565/알파모드, BC4/5 정밀도,
sRGB·채널간섭을 `<details>`로. 마무리에서 "무작위 접근 제약이 거꾸로 우아한 설계를 강제했다"로
수미상관. gpu-execution-model과 교차링크(워프 32레인이 서로 다른 텍셀 샘플 → 각자 블록 디코드).

## chapters.ts 등록 (오케스트레이터가 중앙 등록)

```ts
{
  slug: 'texture-compression',
  title: '텍스처 압축 — 블록 안에 색을 가두다',
  description: '블록 압축(BCn/ASTC)·BC1 해부·아티팩트·BC5 노멀맵·하드웨어 디코드·채널 패킹·슈퍼컴프레션',
  section: 'GPU ↔ 렌더링',
}
```

주의: 현재 chapters.ts엔 'GPU ↔ 렌더링' 섹션이 없다(기존: 'GPU 명령 제출', 'GPU 실행 모델',
'Unreal RHI'). 프롬프트 지시대로 'GPU ↔ 렌더링'을 제안하나, 오케스트레이터가 기존 섹션
체계와 맞춰 조정할 수 있음.
```

## 브라우저 검증 필요(빌드/타입 통과 ≠ 올바른 렌더)

- **BC1Block 드래그**(가장 중요): 데스크톱 마우스 + iOS 터치 둘 다에서 c0/c1이 손가락/커서를
  따라오는지. 끝점 근처 28px 히트, 선분/투영선/그리드 갱신.
- **BlockArtifacts**: blitImage가 HiDPI(dpr2)에서 정사각 전체를 채우는지(좌상단 1/4 버그 없음),
  4×4 격자 정렬, 차이뷰 틴트 보이는지, ‘하늘색 램프’에서 밴딩.
- **NormalBC5**: 광원 회전 시 하이라이트 이동, BC1 vs BC5 차이가 눈에 띄는지(녹색틴트/계단).
- **WhyCompress**: 막대 비율·절감% 텍스트, 막대 우측 값이 캔버스 밖으로 안 잘리는지(padR=130).
- **ChannelPacking**: 위 3 흑백 + 아래 ORM 패킹, 채널 토글 시 색 성분 분리.
- 라이트/다크 테마 모두에서 색·대비(특히 정적 HardwareDecode의 파랑 띠 alpha).
```
