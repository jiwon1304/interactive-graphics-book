# 출처 — texture-filtering-mipmapping ("Texture Filtering과 Mipmap")

소급 검증일: 2026-06. 1차/권위 자료 기준. 검증 방법: Williams 1983 원문(PDF), OpenGL spec,
Khronos 확장 텍스트로 교차확인.

핵심 결론: **본문 사실관계에 실질적 오류 없음.** mipmap +33%, $\lambda=\log_2\rho$, bilinear
4-텍셀 가중합, trilinear 8-텍셀, anisotropic footprint assembly가 모두 1차 자료와 일치한다.

---

## 1. Mipmap의 원전 — Williams 1983 (trilinear의 출처이기도)

- **Lance Williams, "Pyramidal Parametrics", SIGGRAPH '83, Computer Graphics 17(3), July 1983, pp.1–11.**
  https://www.cs.cmu.edu/afs/cs/academic/class/15869-f11/www/readings/williams83_mipmap.pdf
  - mipmap("mip" = *multum in parvo*) = 절반씩 줄인 prefilter 피라미드. 레벨 간·레벨 내
    선형 보간을 합친 **trilinear** 보간(원문이 도입). 본문 §2·§4의 골격이 여기서 나온다.
  - **본문 ↔ 출처:** "원본(L0)에서 가로·세로 절반씩, 레벨 $k$ 텍셀 = 원본 $2^k\times2^k$ 대표",
    "레벨 사이를 소수부로 섞는 것이 trilinear" 일치.

## 2. Nyquist–Shannon · minification aliasing · prefiltering

- **Nyquist–Shannon sampling theorem** — 최고 주파수 $f$ 복원에 $\ge 2f$ 샘플 필요. 화면은
  픽셀당 1 샘플(Nyquist 한계 0.5 cycle/pixel). 위반 시 고주파가 저주파 moiré로 *aliasing*.
  - 참고(표준): https://en.wikipedia.org/wiki/Nyquist–Shannon_sampling_theorem
  - **본문 ↔ 출처:** "샘플링 주파수 픽셀당 1, 한계 0.5 cycle/pixel, 초과 시 moiré" — 정의와 일치.
- **해법: supersampling(비쌈) vs prefiltering(쌈).** 텍스처는 미리 만드는 자원이라 prefilter가
  압도적으로 싸다 — mipmap의 동기. 표준 서술과 일치.

### 검증 — mip chain 메모리 = 원본의 4/3 (+33%)
- $\sum_{k=0}^{\infty} 1/4^k = 1/(1-1/4) = 4/3$. **산술적으로 정확.** "추가 +33%" 옳음.

## 3. Bilinear — 4 텍셀 가중 평균

- **OpenGL 4.6 spec §8.14 (LINEAR within a level)** —
  https://registry.khronos.org/OpenGL/specs/gl/glspec46.core.pdf
  - bilinear = 둘러싼 4 텍셀을 소수부 $t_x,t_y$로 가중. 본문 전개식
    $c=(1-t_x)(1-t_y)c_{00}+\dots+t_xt_yc_{11}$, 가중치 합 $=1$ 정확.
  - **본문 ↔ 출처:** "TMU가 4 텍셀 읽기+가중합을 1 샘플로 처리 → bilinear=1 샘플" 일치(표준 HW 동작).

## 4. Trilinear — 두 레벨을 소수부로

- **OpenGL spec §8.14 (LINEAR_MIPMAP_LINEAR)** + **Williams 1983.**
  - $c=(1-f)\,\text{bi}(L_{\lfloor\lambda\rfloor})+f\,\text{bi}(L_{\lceil\lambda\rceil})$,
    $f=\lambda-\lfloor\lambda\rfloor$. 총 $2\times4=8$ 텍셀, 비용 bilinear의 2배. mip seam 제거.
  - **본문 ↔ 출처:** "tri = bilinear 2차원 + 레벨 차원", "8 텍셀", "seam 사라짐" 일치.

## 5. Anisotropic — 길쭉한 footprint, footprint assembly

- **GL_EXT_texture_filter_anisotropic** — Khronos Registry
  https://registry.khronos.org/OpenGL/extensions/EXT/EXT_texture_filter_anisotropic.txt
  - *"Instead of a single sample at (u,v,lambda), 'N' locations in the mipmap at LOD Lambda are
    sampled within the texture footprint of the pixel."* 장축 방향으로 N 샘플 평균.
  - `TEXTURE_MAX_ANISOTROPY_EXT`(부동 비율, 예 16.0), 최소 지원 `MAX_TEXTURE_MAX_ANISOTROPY`
    $\ge 16.0$. → 본문 "max-aniso ×16 상한" 일치.
- **ARB_texture_filter_anisotropic** — https://registry.khronos.org/OpenGL/extensions/ARB/ARB_texture_filter_anisotropic.txt
- **footprint assembly** — 장축을 따라 한 줄의 mip 샘플들을 합치는 일반 구현
  (NVIDIA, "Anisotropic Texture Filtering in OpenGL").
  - **본문 ↔ 출처:** footprint = $\mathbf f_x,\mathbf f_y$ 평행사변형, $N=\lceil\ell_{\max}/\ell_{\min}\rceil$,
    $\lambda=\log_2(\ell_{\max}/N)$, 장축 N탭·단축 한 샘플 LOD — *대표 모델*로 spec 정신과 일치.
    (★ 정확한 $N$·LOD 계산식은 spec이 구현 정의로 둠 → 본문 식은 footprint assembly의 표준
    교과서 근사임을 명시. 도식용으로 적절.)

## 6. 더 나아가기 — gamma-correct mip, mip bias, divergent LOD

- **sRGB mip 생성:** 비선형 sRGB 값 그대로 평균하면 어두워짐 → linear에서 평균 후 재인코딩.
  표준 권고(예: https://learn.microsoft.com/en-us/windows/win32/direct3d10/d3d10-graphics-programming-guide-resources-block-compression — sRGB 관련, 및 색공간 일반).
- **textureGrad/textureLod로 divergent quad의 미분/LOD 직접 지정** — OpenGL spec `textureGrad`,
  https://registry.khronos.org/OpenGL-Refpages/gl4/html/textureGrad.xhtml. 본문 서술과 일치.

---

## 대표값/주의 (flag)
- anisotropic $N=\lceil\ell_{\max}/\ell_{\min}\rceil$·$\lambda=\log_2(\ell_{\max}/N)$ 는 **교과서
  근사/도식 모델**(정확식은 구현 정의). 본문이 이를 직설적으로 제시하나, spec이 정확 공식을
  강제하지 않음을 독자가 오해하지 않도록 본 노트에 명시.
- "bilinear=1 샘플 / trilinear=2 샘플 / aniso=N 샘플" 은 표준 비용 모델(절대 사이클 아님).

## 결론
**오류·검토 필요 항목 없음.** 4/3 메모리, $\lambda=\log_2\rho$, bilinear/trilinear 가중식,
anisotropic footprint assembly가 1차 자료와 일치. anisotropic 식은 "대표 모델"로 이해하면 정확.
