# 핸드오프 — Texture Filtering과 Mipmap (slug: `texture-filtering-mipmapping`)

섹션: **GPU ↔ 렌더링** (rendering-execution-model 다음, texture-compression 앞).
작성: 2026-06. 스타일: 새 정책(비유 최소·용어 영어/발음 유지 — `이방성`→`anisotropic` 등).

## 목적과 범위

`rendering-execution-model`이 LOD $\lambda = \log_2 \rho$를 *고르는* 데서 멈췄다. 이 챕터는 그
다음 — 고른 레벨(들)에서 텍셀을 *실제로 읽는* 법: minification aliasing(왜 평균이 필요한가,
Nyquist) → mipmap(+33% 메모리 유도) → bilinear(4텍셀 가중치 유도) → trilinear(레벨 사이 blend,
mip seam) → anisotropic(길쭉한 footprint, N탭). 두 챕터(rendering-execution / texture-compression)가
모두 "다음은 filtering"이라고 가리키던 자리를 채운다.

**멈춘 지점:** mip 생성 커널·gamma-correct/sRGB filtering·mip bias·texture cache·divergent LOD는
"더 나아가기"의 포인터로만. 카탈로그 `topic-catalog-hw-rendering.md` §B(16~22) 흡수.

## 위젯 (모두 `src/components/demos/texture-filtering-mipmapping/`)

자체 헬퍼 `tf2d.ts`(re2d.ts 패턴 + 필터링 수학: makeTexture/downsample/buildMipChain/
sampleNearest·Bilinear·Trilinear/lodFromRho/hsv 없음·rgbToCss). `useCanvas2d.ts`(tf2d import 버전),
`usePointerDrag.ts`(복사본). **텍스처는 putImageData 대신 셀마다 fillRect**로 그림 → §5.1 함정
원천 회피(작은 격자라 충분, dpr 변환 존중).

| # | 컴포넌트 | 가르치는 것 | 과정/결과 | 조작 |
|---|---|---|---|---|
| 1 | `MinificationAliasing.tsx` | minification aliasing/shimmer; nearest vs prefilter 평균 | 과정(위상 끌면 moaré가 산다) | Toggle 필터 + Slider 위상 |
| 2 | `MipChain.tsx` | 1/2 피라미드, box filter, +33%(=4/3) 메모리, λ로 레벨 선택 | 과정 | Slider rho→λ + Toggle trilinear |
| 3 | `Bilinear.tsx` | 4텍셀 가중치 (1-tx)(1-ty)…, 합=1; nearest vs bilinear | 과정(드래그로 가중치 이동) | 샘플점 드래그(usePointerDrag) |
| 4 | `Trilinear.tsx` | 레벨 사이 blend, mip seam 제거 | 과정(toggle로 띠 사라짐) | Toggle trilinear |
| 5 | `Anisotropic.tsx` | footprint 타원, isotropic 과흐림 vs N탭 anisotropic; 원근 바닥 + footprint inset | 과정 | Toggle aniso + Slider max-aniso |

배치: 1(훅: aliasing) → §1 Nyquist(정적 설명, 위젯 없음) → 2(mipmap+메모리 유도) → 3(bilinear) →
4(trilinear) → 5(anisotropic) → §6 조립(샘플 1회의 5단계) → §7 더 나아가기.

## 유도된 수학 (MDX, KaTeX)
- Nyquist: 샘플링 ≥ 2f, 픽셀당 1샘플 한계 → 고주파가 moaré로 접힘 → prefilter가 해법.
- mip 메모리: $\sum 1/4^k = 4/3$ (+33%).
- LOD: $\lambda = \log_2 \rho$ (지난 챕터 회수).
- bilinear: 분리형 lerp 전개 → 4 가중치, 합=1.
- trilinear: $(1-f)\,\text{bi}(L_{\lfloor\lambda\rfloor}) + f\,\text{bi}(L_{\lceil\lambda\rceil})$, 8텍셀.
- anisotropic: footprint 벡터 $\mathbf f_x,\mathbf f_y = T\,\partial(u,v)/\partial(x,y)$,
  $N=\lceil \ell_{\max}/\ell_{\min}\rceil$, $\lambda=\log_2(\ell_{\max}/N)$, 장축 N탭 평균.

## 기술 노트 / 단순화 (적대적 검수 대상)
- **MinificationAliasing**: 1D 사각파(주기 8텍셀)로 단순화. "옳은 값"=footprint 평균을 64-서브샘플
  평균으로 근사(적분 대용). rho는 열 위치에 따라 기하적으로 1→~24.
- **Anisotropic**: 원근 바닥 매핑 `mapUV`는 *시각화용* 단순 모델(focal 등 생략). footprint는
  `mapUV(px+1)/(py+1)` 유한차분으로 구함(quad 미분과 같은 원리). 탭/LOD 공식은 표준 근사이며
  실제 하드웨어(EWA 등)와 다름 — 도식 목적. cell=5로 그려 성능 확보(먼 행만 N탭).
- **Trilinear/MipChain**: 텍스처 'brick'(red/tan) size 32 → chain 6레벨. mapUV는 위=멀리(λ↑).
- 색: COLORS 의미색(`as const`), 가변 hex는 string. TS strict 통과(check 0 errors).
- 절차적 에셋만(외부 fetch 없음). SSR 안전.

## 펜딩 — 브라우저 시각 검증 (빌드/타입 통과 ≠ 올바른 렌더)
- MinificationAliasing: 위상 슬라이더로 OFF시 무늬가 *움직이고* ON시 안정한지.
- Bilinear: 드래그(특히 iOS 터치)로 보라 점이 따라오나, 4 가중치 합=1, 오른쪽 swatch 차이.
- Trilinear: OFF시 점선 위치에 가로 seam, ON시 사라짐.
- Anisotropic: aniso OFF시 멀리 바닥 뭉개짐 → ON시 선명, inset 평행사변형/탭이 장축 따라, ratio가
  위쪽일수록 큼. **canvas y-down 부호**(§5.5) — 원근 매핑/화살표 방향 눈으로 확인.
- MipChain: 레벨 강조 테두리가 rho↑시 오른쪽 이동, 메모리 막대 꼬리=1/3.
- 라이트/다크, 모바일 폭(≤400px) 라벨 겹침.

## 확장 / 관련
- gamma-correct mip, mip bias/TAA, texture cache 지역성, divergent LOD(textureGrad/Lod) → 후속 위젯/챕터.
- 교차링크: rendering-execution-model(미분→LOD), texture-compression(저장은 직교).
