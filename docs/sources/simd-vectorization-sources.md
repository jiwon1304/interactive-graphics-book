# 출처 — simd-vectorization ("SIMD와 벡터화")

WebSearch/WebFetch로 수집·교차검증. 폭(width)·레인 수 등 정의성 수치는 ≥2 출처로 확인하고,
성능 배수·다운클럭처럼 환경 의존적인 값은 "대표/도식용"으로만 서술했다.

## 핵심 사실 ↔ 출처

- **SSE 128-bit / AVX·AVX2 256-bit / AVX-512 512-bit, 레지스터 별칭(XMM⊂YMM⊂ZMM), 개수 16→32:**
  https://en.wikipedia.org/wiki/AVX-512 ·
  https://www.intel.com/content/www/us/en/developer/articles/technical/intel-avx-512-instructions.html ·
  https://en.wikichip.org/wiki/x86/avx-512
  (128b=4×float/2×double, 256b=8×float/4×double, 512b=16×float/8×double로 교차확인.)
- **ARM NEON 128-bit 고정폭 32개(V0–V31), SVE는 128–2048b vector-length-agnostic:**
  https://developer.arm.com/Architectures/Scalable%20Vector%20Extensions ·
  https://learn.arm.com/learning-paths/servers-and-cloud-computing/sve/sve_basics/ ·
  https://alastairreid.github.io/papers/sve-ieee-micro-2017.pdf
- **AoS vs SoA — SoA가 연속 벡터 load/store에 유리, AoS는 gather/scatter 유발, AoSoA 하이브리드:**
  https://en.wikipedia.org/wiki/AoS_and_SoA ·
  https://www.intel.com/content/www/us/en/developer/articles/technical/memory-layout-transformations.html
- **AVX-512 mask register k0–k7(16b, BW로 64b), k0=unmasked 예약; gather/scatter(AVX2는 gather만, AVX-512는 둘 다):**
  https://en.wikipedia.org/wiki/AVX-512 ·
  https://travisdowns.github.io/blog/2019/12/05/kreg-facts.html ·
  https://dynamorio.org/page_scatter_gather_emulation.html
- **AVX-512 다운클럭(license-based, L0/L1/L2; 512b heavy 명령이 트리거; 128/256b는 영향 작음):**
  https://travisdowns.github.io/blog/2020/01/17/avxfreq1.html ·
  https://travisdowns.github.io/blog/2020/08/19/icl-avx512-freq.html ·
  https://lemire.me/blog/2018/08/15/the-dangers-of-avx-512-throttling-a-3-impact/
- **셰이더 SIMT vs CPU SIMD 비교(크로스링크 ./gpu-execution-model):** 본 책 내부 챕터.

## 낮은 신뢰도 / 주의 (본문에 반영함)

- **AoS↔SoA "10–100×" 성능 차이**는 워크로드·하드웨어에 따라 천차만별인 대표 인용치 → 본문에서
  "경우에 따라 매우 크다"로만 서술하고 구체 배수는 도식용으로만.
- **AVX-512 다운클럭은 세대 의존**: Skylake-X에서 두드러졌고 Ice Lake 이후 페널티가 크게 줄었다 →
  본문은 "한 줄"로 다루고 "Skylake-X 기준, 최신 세대는 완화"로 귀속.
- **자동 벡터화 성공/실패**는 컴파일러·플래그·코드에 의존 → 일반 경향(별칭·정렬·제어흐름)만 서술.
  낮은 신뢰도/주의.
