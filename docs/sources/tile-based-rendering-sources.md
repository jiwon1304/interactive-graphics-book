# 출처 — tile-based-rendering ("Tile-Based Rendering과 모바일 GPU")

소급 검증일: 2026-06. ARM·Imagination 개발자 문서, Khronos Vulkan, 학술 측정(Antochi et al.) 기준.

핵심 결론: **본문 사실관계에 실질적 오류 없음.** IMR vs TBR/TBDR, GMEM, binning/parameter
buffer, HSR, load/store op, "1.96× 절감", "z-prepass가 모바일에서 역효과", DRAM pJ 비대칭이
모두 1차/권위 자료와 일치. DRAM 에너지 수치만 "대표값" 메모를 남긴다(아래 ★).

---

## 1. IMR — 모든 프래그먼트가 DRAM RMW

- **ARM, "The Mali GPU: An Abstract Machine, Part 2 — Tile-based Rendering"**
  https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/the-mali-gpu-an-abstract-machine-part-2---tile-based-rendering
  - IMR = 삼각형 받는 즉시 래스터·셰이딩·프레임버퍼(DRAM) write. depth/blend = DRAM RMW,
    overdraw $d$마다 반복. 본문 §1 식 $B_{\text{IMR}}\approx 2WHbdF$ 의 구조(read+write=2, $d$ 정비례)
    와 일치.

## 2. GMEM(on-chip tile memory) — 타일을 칩 위에서 완성

- **ARM(위)** + **Imagination, "A look at the PowerVR architecture: Tile-Based Deferred Rendering"**
  https://blog.imaginationtech.com/a-look-at-the-powervr-graphics-architecture-tile-based-rendering/
  - 화면을 작은 타일로 쪼개 color/depth를 온칩 메모리에 두고 거기서 끝낸 뒤 *타일당 1회* DRAM write.
    overdraw가 외부 트래픽에서 사라짐 → $B_{\text{TBR}}\approx WHbF + (\text{parameter buffer})$.
  - **타일 크기:** ARM Mali 16×16, 다른 IHV 32×32 등. 본문 "보통 16×16~32×32" 정확.
  - **검증 — GMEM 크기:** 32×32×(4+4)B = 8192 B ≈ 8 KB, MSAA 4×면 ~32 KB. 산술 정확.
    1080p color+depth = 1920×1080×8 ≈ 16.6 MB(전체는 SRAM에 못 올림). 산술 정확.

## 3. Binning(tiling) pass · parameter buffer

- **ARM(위)** — TBR은 (1) **binning/tiling pass**: 전체 지오메트리 vertex 처리·클립 후 타일별
  primitive 리스트를 DRAM의 **parameter buffer**(ARM 용어; PowerVR은 "parameter buffer")에 적고,
  (2) **rendering(fragment) pass**: 타일마다 리스트를 읽어 GMEM에서 셰이딩.
  - **본문 ↔ 출처:** "한 프레임 지오메트리를 전부 모은 뒤 픽셀 시작", "픽셀 트래픽(overdraw)을
    지오메트리 트래픽과 맞바꿈", 지오메트리 폭증 시 parameter buffer overflow → 부분 플러시.
    모두 ARM 문서 서술과 일치.

## 4. 대역폭 절감 — "약 1.96×"

- **Antochi, Juurlink, Vassiliadis, Liuha, "Memory Bandwidth Requirements of Tile-Based Rendering"
  (SAMOS 2004)** — https://link.springer.com/chapter/10.1007/978-3-540-27776-7_34
  - 측정: TBR이 비-타일(IMR) 대비 외부 데이터 트래픽을 **약 1.96배** 절감. 본문 §4 "흔히 인용되는
    값 약 1.96×" 의 출처(여러 후속 연구·박사논문이 재인용). **본문 표기 정확.**
- 이론 상한 $B_{\text{IMR}}/B_{\text{TBR}}\approx 2d$ (parameter buffer 무시)는 §1·§2 식에서
  직접 유도. $d=4$면 8배까지 — "이론상" 임을 본문이 명시. 측정값(1.96×)이 더 보수적인 이유
  (parameter buffer·초기 load·IMR 캐시 흡수)도 본문이 정확히 서술.
- **Khronos Vulkan — Tile-Based Rendering best practices**(보강)
  https://docs.vulkan.org/guide/latest/ (TBR 관련) / github.khronos.org Vulkan-Site.

## 5. HSR(hidden surface removal) · TBDR

- **Imagination, "Tile-Based Deferred Rendering (TBDR)"**
  https://docs.imgtec.com/starter-guides/powervr-architecture/html/topics/tile-based-deferred-rendering-index.html
  + 블로그(위) — 타일 안 모든 삼각형을 미리 알므로 **셰이딩 전에** 픽셀별 가시면을 완전히 풀고,
    안 보이는 면은 픽셀 셰이더를 아예 안 돌림 = **HSR**. 이를 하는 아키텍처가 **TBDR**
    (Imagination PowerVR, Apple GPU). 불투명은 정렬 무관 **zero overdraw**(픽셀당 셰이딩 1회).
  - **본문 ↔ 출처:** HSR 정의·TBDR 명칭·"하드웨어가 정렬 없이 공짜로 early-Z 효과" 일치.

## 6. z-prepass가 모바일에서 역효과

- **ARM, "Immortalis-G925: the Fragment Prepass"**
  https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/immortalis-g925-the-fragment-prepass
  - *"When an application inserts a Z pre-pass, it has to render all the geometry twice ... Doing it
    in hardware avoids having to submit and tile the geometry twice, keeps the intermediate data
    on-chip ..."* → 수동 z-prepass는 TBDR에서 **지오메트리를 두 번 타일링**하는 손해. HW HSR가
    이미 같은 일을 함. **본문 §5 "모바일에서 z-prepass는 오히려 역효과" 정확.**

## 7. load/store op (Vulkan/Metal)

- **Vulkan spec — Render Pass load/store operations**
  https://docs.vulkan.org/spec/latest/chapters/renderpass.html
  - loadOp: `LOAD`(DRAM read)/`CLEAR`(read 없음)/`DONT_CARE`. storeOp: `STORE`(DRAM write)/`DONT_CARE`.
  - TBR에서 이 둘 = DRAM 왕복. color `loadOp=CLEAR`, depth `storeOp=DONT_CARE`로 write 제거.
    무심코 `loadOp=LOAD`면 타일마다 DRAM read 부활. **본문 §7 정확.**
- **ARM, Vulkan usage guide / Imagination** — `DONT_CARE`/`memoryless` 권고 동일.

## 8. 대역폭 = 전력 (pJ 비대칭)

- **Mark Horowitz, "Computing's Energy Problem (and what we can do about it)", ISSCC 2014**
  https://gwern.net/doc/cs/hardware/2014-horowitz-2.pdf
  - off-chip DRAM 64-bit access ≈ **1300~2600 pJ**(= 약 160~320 pJ/byte), 캐시/연산 ≈ 10 pJ대,
    FP op ≈ **0.4~3.7 pJ**(정밀도/종류별). 온칩 접근은 DRAM의 수십~수백분의 1.
  - **★ 본문 §8 수치 메모:** 본문은 "DRAM 1바이트 ≈ **60~150 pJ**, 온칩은 ~1/100, 연산
    ~0.05 pJ로 DRAM의 ~1/2000" 이라 적었다. Horowitz 기준 DRAM/byte는 ~160~320 pJ(LPDDR
    모바일은 더 낮게 ~100 pJ/byte 인용도 흔함)이고 FP op는 ~0.4 pJ대다. **본문 값은 차수는
    맞지만(DRAM ≫ 연산) 절대값이 다소 낮은 "대표값"** 이다. 정성적 결론(DRAM 왕복 제거가 핵심)
    은 정확. → 본 노트에 "도식용 대표·차수" 로 명시(본문 수정은 선택; 아래 결론 참고).

## 9. 더 나아가기

- **subpass on-tile deferred** (Vulkan input attachment로 G-buffer를 타일 안에서 생성·소비, DRAM 왕복 0):
  https://docs.vulkan.org/samples/latest/samples/performance/subpasses/README.html
- **PLS / framebuffer fetch** (pixel local storage): EXT_shader_pixel_local_storage,
  https://registry.khronos.org/OpenGL/extensions/EXT/EXT_shader_pixel_local_storage.txt
- **Adreno FlexRender/LRZ**(binned↔direct 동적 전환, low-res Z) — Qualcomm Adreno OpenGL ES/Vulkan
  개발자 가이드. **Apple/Metal TBDR**(imageblock·tile shader·`memoryless`) — Apple Metal 문서.

---

## 대표값/주의 (flag)
- **★ §8 pJ 수치**: 차수는 옳으나 절대값은 도식용 대표(특히 "0.05 pJ/op", "60~150 pJ/byte").
  Horowitz 원전은 DRAM ~160~320 pJ/byte, FP op ~0.4 pJ대. 정성 결론 불변.
- §1 첫 식 3.8 GB/s, §4 1.96×, GMEM 8KB/32KB·16.6MB 는 모두 검증됨(산술/측정).
- 타일 크기·GMEM 용량은 벤더별 — 본문이 "보통/예" 로 명시.

## 결론
**큰 오류 없음.** TBR/TBDR·GMEM·binning·HSR·load/store op·1.96×·z-prepass 역효과가 ARM·
Imagination·Khronos·학술 자료와 일치. 유일한 ★는 §8 에너지 *절대값*이 대표·차수라는 점(정성
결론은 정확) — 검토 필요라기보다 "대표값 명시" 사안.
