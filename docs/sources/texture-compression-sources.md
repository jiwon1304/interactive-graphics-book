# 출처 — texture-compression ("텍스처 압축 — 블록 안에 색을 가두다")

소급 검증일: 2026-06. Microsoft BCn 문서·Khronos ASTC·전문가 분석(fgiesen, Reed) 기준.

핵심 결론: **본문 사실관계에 실질적 오류 없음.** BC1 8바이트·565·2비트 인덱스·1/3·2/3 보간·
1-비트 알파(끝점 순서), BC5=BC4×2, BC7 8모드/64파티션, BC6H FP16, ASTC 0.89~8 bpp가 모두
1차 자료와 일치한다. 한 곳(BC4 details 블록의 "6개/8개" 표현)만 정밀화 메모를 남긴다(아래 ★).

---

## 1. 왜 압축하나 — 대역폭/메모리 (둘 다 $b_{px}$에 정비례)

- 비압축 메모리 $= W\cdot H\cdot b_{px}/8$, 대역폭 $\approx \times\,\text{fps}$. 산술적으로 자명.
  RGBA8 = 32 bit. BC1 = 4 bpp → 8:1(RGBA8 기준), "6:1"은 RGB8(24bit) 기준 — 본문 서술 정확.
- 대역폭이 진짜 보상이라는 동기는 IHV 공통 서술(예: ARM/Imagination 텍스처 압축 가이드).

## 2. BC1 해부 (예전 이름 DXT1)

- **Block Compression (Direct3D 10/11) — Microsoft Learn**
  https://learn.microsoft.com/en-us/windows/win32/direct3d10/d3d10-graphics-programming-guide-resources-block-compression
  https://learn.microsoft.com/en-us/windows/win32/direct3d11/texture-block-compression-in-direct3d-11
  - BC1 = **4×4 블록**, 끝점 2개 **RGB565**(각 16 bit) + 텍셀당 **2-bit 인덱스** 16개
    = $32+32 = 64$ bit = **8 바이트** = 0.5 B/texel = **4 bpp**. 본문 산수 정확.
  - 팔레트 4색: $c_0$, $c_1$, $\tfrac23c_0+\tfrac13c_1$, $\tfrac13c_0+\tfrac23c_1$
    (= 1/3, 2/3 보간). 본문 식 일치.
  - **1-비트 펀치스루 알파 모드:** 끝점 16-bit 정수 대소($c_0>c_1$ vs $c_0\le c_1$)로 모드 결정.
    $c_0\le c_1$이면 팔레트 = $\{c_0, c_1, \tfrac12(c_0{+}c_1), \text{투명}\}$. 본문 details 정확.
- **S3 Texture Compression — Wikipedia**(교차확인)
  https://en.wikipedia.org/wiki/S3_Texture_Compression
- **Nathan Reed, "Understanding BCn Texture Compression Formats"**(전문가 분석)
  https://www.reedbeta.com/blog/understanding-bcn-texture-compression-formats/
  - 565 채널 비대칭(녹색 6비트=64단계, R/B 5비트=32단계), 끝점/인덱스 구조 확인.
- **fgiesen, "GPU BCn decoding"**(하드웨어 디코드 관점)
  https://fgiesen.wordpress.com/2021/10/04/gpu-bcn-decoding/
  - 565·인덱스·하드웨어 즉석 디코드 회로 관점 보강.
- **검증 — "압축 = 3D 색을 1D 선분으로 투영, 끝점=주성분(PCA) 축":** 표준 인코더 설명과 일치
  (선분 위 최근접점 = 투영 후 4격자 스냅). 본문 §2 기하 해석 정확.

## 3. 아티팩트 — 블록 모자이크 · 녹색 밴딩

- 블록마다 독립 끝점 → 4×4 facet 모자이크, 그라데이션에 밴딩. 565 비대칭 → 녹색/자홍 틴트.
  (Reed 블로그 + 일반 통념) 본문 §3 서술 정확.
- **BC vs PNG/JPEG 관계:** PNG/JPEG는 디스크/전송용(읽으려면 통째 풀어 VRAM에 비압축 적재),
  BC는 **GPU가 읽는 중에도 압축 유지**. 본문 details 정확(경쟁 아님).

## 4. BC5 노멀맵 · BC4/BC7/BC6H/ASTC

- **BC5 = BC4 두 채널.** Microsoft Learn(위) + Reed:
  - BC4: 단일 채널, 끝점 **각 8 bit**, 텍셀당 **3-bit 인덱스**(8단계), **8 바이트/블록**.
  - BC5: BC4 두 개 → **16 바이트/블록** = 1 B/texel(**8 bpp**) = RGBA8의 1/4, BC1의 2배.
    노멀 $x,y$ 저장, $z=\sqrt{1-x^2-y^2}$ 셰이더 복원. 본문 §4·details 정확.
  - **★ 정밀화 메모(BC4 모드):** Microsoft 공식 서술은
    *"If red_0 > red_1, BC4 interpolates 6 (interpolated) color values; otherwise it interpolates 4,
    and sets two additional values 0.0 and 1.0."* 즉 **8-값 모드(끝점2 + 보간6)** 와
    **6-값 모드(끝점2 + 보간4) + {0.0, 1.0}** 이다. 본문 details는 *"보간점이 6개(+min/max)인
    모드와 8개인 모드"* 로 표현 — **사실상 같은 내용이나 표현이 헷갈릴 수 있음.** 정확히는
    "끝점 대소에 따라 *보간값* 6개(총 8값) 또는 *보간값* 4개 + 양 끝 0.0/1.0". 큰 오류는 아님
    (수정 안 함, 본 노트에 정밀 표기만 기록).
- **BC7** — https://learn.microsoft.com/en-us/windows/win32/direct3d11/bc7-format-mode-reference
  - **8 모드**, 2-region에 **64 파티션 세트**(3-region도 64). 16 바이트/블록 = **8 bpp**, 컬러 최고화질.
    본문 "8가지 모드, 64종 파티션, 8 bpp" 정확.
- **BC6H** — FP16 HDR, 16 바이트/블록(8 bpp), 14 모드. 본문 "FP16 HDR 네이티브" 정확.
  https://deepwiki.com/microsoft/DirectXTex/5.2-bc6h-and-bc7-compression
- **ASTC** — Khronos
  https://www.khronos.org/news/press/khronos-releases-atsc-next-generation-texture-compression-specification
  https://github.com/ARM-software/astc-encoder/blob/main/Docs/FormatOverview.md
  - **128-bit 고정 블록**, footprint **4×4 ~ 12×12** 가변 → 비트레이트 **8.0 ~ 0.89 bpp** 연속.
    본문 "128비트 고정, 4×4~12×12, 8.0~0.89 bpp 연속" 정확. X+Y / XY+Z 노멀 모드도 존재.

## 5. 하드웨어 디코드 · 고정 비트레이트의 이유

- VRAM→L2까지 압축 유지, 샘플 순간에만 TMU가 4×4 블록을 즉석 RGBA 디코드(고정기능 회로).
  fgiesen "GPU BCn decoding"(위) + Microsoft. 본문 §5 정확.
- **고정 비트레이트(8/16 B 고정)** 이유 = 텍셀 $(x,y)$ → 블록 주소를 **곱셈 한 번**으로
  (가변 길이면 앞 블록 훑어야 함 → 무작위 접근 깨짐). 본문 §5 핵심 논리 정확.

## 6. 채널 패킹(ORM) · 직교 절감

- 1채널 맵(AO·Roughness·Metallic)을 한 RGB 텍스처 R/G/B에 패킹 = **ORM**. 한 샘플로 3값,
  그 위에 블록 압축이 곱으로 쌓임. 본문 §6 일치(일반 PBR 실무 통념).
- details — sRGB 주의(ORM은 linear여야), BC1/BC7 채널 간섭 → BC4×2(=BC5)나 BC7 신중 패킹.
  표준 권고와 일치.

## 7. 슈퍼컴프레션 · KTX2/Basis Universal

- **Basis Universal / KTX2** — 중간표현(UASTC/ETC1S) 한 번 인코딩 → 런타임에 기기 GPU 포맷으로
  **트랜스코드**. 디스크는 LZ류로 작게, VRAM은 블록 포맷 유지. 웹은 three.js `KTX2Loader`.
  - https://github.com/BinomialLLC/basis_universal
  - https://www.khronos.org/ktx/
  - three.js KTX2Loader: https://threejs.org/docs/#examples/en/loaders/KTX2Loader
  - 본문 §7 "한 에셋, 모든 GPU" 서술 정확.

---

## 대표값/주의 (flag)
- **★ BC4 "6개/8개" 표현**(§4 details): 사실은 맞으나 정밀 표기는 위 §4 참조(수정 안 함).
- 8:1(RGBA8) vs 6:1(RGB8) 기준 차이는 본문이 이미 명시.
- DCC/Z 압축(무손실)은 "더 나아가기"에서 포인터로만 — 자매 챕터 memory-bandwidth-roofline에서 다룸.

## 결론
**큰 오류 없음.** BC1/BC4/BC5/BC7/BC6H/ASTC의 블록 크기·비트레이아웃·모드·비트레이트가 모두
Microsoft·Khronos 1차 자료와 일치. 유일한 ★는 BC4 모드 설명의 표현 정밀도(내용은 정확).
