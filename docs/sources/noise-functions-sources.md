# 출처 — noise-functions ("노이즈 함수")

이 챕터의 공식·완화함수·고유명사·역사를 1차 논문(Perlin 1985/2002)과 표준 자료에 대조해 검증했다.
조사일: 2026-06.

> 검증 메모: Perlin 원논문 메타데이터는 ACM DL/SIGGRAPH 역사 페이지로, fBm·smin 등 보조 사실은
> 다수 표준 자료(scratchapixel, The Book of Shaders, NVIDIA GPU Gems)로 교차확인.

---

## 1. value noise: 격자 난수 + 보간

- 표준 절차적 노이즈(scratchapixel — Value Noise / The Book of Shaders ch.11).
  https://www.scratchapixel.com/lessons/procedural-generation-virtual-worlds/perlin-noise-part-2/perlin-noise.html
  - 정수 격자점에 난수, 사이를 완화 보간. $n(i+t)=\mathrm{lerp}(v_i,v_{i+1},u(t))$. 본문 §1 일치. ✔

## 2. 완화함수: smoothstep vs quintic (★ Perlin 1985 → 2002)

- **K. Perlin, "An Image Synthesizer", SIGGRAPH '85, Computer Graphics 19(3), pp. 287–296 (1985).**
  https://dl.acm.org/doi/10.1145/325334.325247
  - 원래 Perlin noise. 초기 완화는 **smoothstep** $3t^2-2t^3$ (1차 도함수 끝점에서 0).
- **K. Perlin, "Improving Noise", SIGGRAPH 2002, ACM TOG 21(3), pp. 681–682.**
  https://dl.acm.org/doi/10.1145/566570.566636
  - 2002년 개선판에서 **quintic** $6t^5-15t^4+10t^3$로 교체 — 끝점에서 1차·2차 도함수 **모두 0**이라
    격자 자국(2차 불연속)이 사라짐. 본문 §1 두 식 + "Perlin이 smoothstep→quintic으로 바꾼 이유" 일치. ✔
    (검색 스니펫 확인: quintic의 2계 도함수 $120t^3-180t^2+60t$가 끝점에서 0.)

## 3. 2D value noise: 해시 + bilinear 보간

- The Book of Shaders / scratchapixel.
  - 코너 4개 난수를 해시로 결정(저장 없이 재현), 셀 내부는 bilinear:
    $n=\mathrm{lerp}(\mathrm{lerp}(v_{00},v_{10},u_x),\mathrm{lerp}(v_{01},v_{11},u_x),u_y)$. 본문 §2 일치. ✔

## 4. Perlin = 그래디언트 노이즈 (★ Perlin 1985)

- Perlin 1985 / Wikipedia — Perlin noise. https://en.wikipedia.org/wiki/Perlin_noise
  - 코너에 *값*이 아니라 무작위 **그래디언트 벡터** $g_i$를 두고, 기여는 $g_i\cdot(p-c_i)$ 내적의 완화 보간.
    본문 §"value의 한계, Perlin" 식 $n(p)=\sum_i w_i(g_i\cdot(p-c_i))$ 일치. ✔
  - **격자점에서 값이 정확히 0**: 오프셋 $(p-c_i)=0$이면 내적 0. 본문 일치. ✔
  - value보다 격자 정렬 자국이 약하고 더 등방적. 본문 일치. ✔
  - (역사: Perlin은 1982년 영화 *Tron* 작업 중 고안, 1985 논문으로 정식 발표, 1997 기술 아카데미상.
    본문엔 인물/연대 직접 서술 없음 — 참고자료로만 노출.)

## 5. simplex noise (★ Perlin 2002)

- Perlin 2002 "Improving Noise" + Wikipedia — Simplex noise. https://en.wikipedia.org/wiki/Simplex_noise
  - 정사각 격자를 **skew**해 $d$차원을 최소 꼭짓점의 **simplex**로 채움(2D=삼각형).
    보간 코너가 $2^d \to d+1$로 감소(2D: 4→3), 방향 편향↓. 본문 §"simplex" 일치. ✔
  - 꼭짓점 기여 falloff: $\max(0,\ 0.5-r^2)^4\cdot(g\cdot d)$. 본문 식과 일치 — 표준 2D simplex 커널
    ($r^2$ = 점→꼭짓점 거리 제곱; 지수 4, 반경² 0.5는 표준 구현값). ✔
    (참고: 일부 구현은 $0.6-r^2$, $0.5-r^2$ 등 상수가 다르나 0.5가 흔한 대표값. 데모 일관성만 맞으면 OK.)

## 6. fBm: 옥타브 합 · lacunarity / gain

- **scratchapixel — Fractal noise / NVIDIA GPU Gems ch.5** (Perlin 계열 표준).
  https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-5-implementing-improved-perlin-noise
  - $\text{fBm}(p)=\sum_{i=0}^{n-1} g^i\,\text{noise}(l^i p)$, 보통 lacunarity $l=2$, gain $g=0.5$.
    본문 §"fBm" 식·기본값 일치. ✔
  - ("fractal Brownian motion"은 정확히는 $g=2^{-H}$ 형태의 특수 경우지만, 그래픽스에선 본문처럼
    옥타브 합을 통칭 fBm으로 부름 — 업계 관행. OK.)

## 7. 도메인 워핑(domain warping) — IQ

- **Inigo Quilez — "domain warping"** https://iquilezles.org/articles/warp/
  - 노이즈를 자기 좌표에 먹여 결을 뒤틀어 대리석·연기·물결 패턴 생성. 본문 §"놀이터" 식 형태와 일치.
    (오프셋 상수 5.2, 1.3 등은 IQ 예제의 임의 디커플링 상수 — 도식용 대표값.) ✔

## 8. 더 나아가기 — Worley / ridged / 타일링

- Worley(cellular) noise: Steven Worley, SIGGRAPH 1996, "A Cellular Texture Basis Function".
  ridged/turbulence($|\cdot|$ 적용), 타일링(주기 해시/4D 토러스) — 표준 확장. 본문 §"더 나아가기" 일치(개요). ✔

---

### 플래그(불확실/대표값)
- simplex falloff 상수($0.5-r^2$, 지수 4)와 도메인 워핑 오프셋(5.2, 1.3)은 **구현별 대표값**. 본문 일관 OK.
- 모든 핵심 공식·완화함수·역사 명칭이 1차/표준 자료와 일치. **수정 없음.**
