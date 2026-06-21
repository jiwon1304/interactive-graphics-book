# 핸드오프 — cel-shading-ramp ("셀 셰이딩과 램프 라이팅")

> 섹션: **카툰 · NPR 렌더링**(신규). slug `cel-shading-ramp`. 출처: `docs/sources/cel-shading-ramp-sources.md`.

## 목적 / 범위
- toon/cel shading의 라이팅(diffuse 음영) 쪽을 **과정 순서로** 빌드업: 연속 diffuse → step →
  quantize → 편집 가능한 1D ramp(핵심) → half-Lambert remap → warm–cool 색조 → fwidth 경계 AA.
- **다루지 않음**(다음 챕터): 외곽선/라인아트(inverted-hull, 깊이·노멀 엣지), 하드 셀 스펙큘러,
  matcap, 텍스처 채널 아트 컨트롤. "더 나아가기"에서 포인터만.
- 독자: 기본 라이팅(NdotL/diffuse)을 아는 그래픽스 엔지니어. 용어 영어/발음 그대로, 비유 금지.

## 핵심 framing(본문 일관성 유지용)
- **ramp = 1D LUT**: $n\cdot l$(또는 remap된 입력)으로 인덱싱하는 입력→색 함수. step·quantize는
  이 ramp의 특수 경우. half-Lambert·Gooch t·ramp 입력축이 모두 "$[-1,1]\to[0,1]$ 펴기"로 동일.
- 마지막 "조립" 식: 입력 remap → LUT → fwidth 품질, 세 손잡이로 toon 표현공간 요약.

## 위젯 목록 (`src/components/demos/cel-shading-ramp/`)
모두 3D 셰이더 데모(DemoCanvas + GLSL3 ShaderMaterial, `lights={false}`, OrbitControls
`enablePan={false}`). 셰이더는 `useMemo([])`로 1회 생성, uniform만 `useFrame`에서 갱신.
도형 풀(구/토러스/매듭)은 `ToonShape.tsx` 공유. 공통 헬퍼는 `shared.ts`(VERTEX_SHADER,
FRAG_HEADER=varying/uniform+lambertNdotL/rawNdotL, lightDirFromAngles, hex 변환).

1. **HardStepToon** (과정) — `step(t, N·L)` 명/암 두 면. 임계 슬라이더로 terminator 이동.
   `N·L 마스크 보기` 토글 = 양자화 전 연속 N·L(흑백). 주 파라미터: threshold, azimuth, shape.
2. **BandingToon** (과정) — `floor(N·L·N)/(N-1)` 양자화. 옆 2D 막대(useCanvas2D)에 연속→계단
   동시 표시. N=2..8. 주 파라미터: bands, azimuth, shape.
3. **RampEditor** (★ 핵심, 과정) — 편집 가능한 1D ramp. stop 드래그/추가/삭제/색, 계단↔보간 토글.
   stop 리스트를 CPU에서 RAMP_W=256폭으로 구워 `DataTexture`(RGBA)로 업로드, 셰이더는
   `texture(uRamp, vec2(ndl,0.5))`. **2D 바 드래그는 usePointerDrag(raymarching-sdf) + useRef
   상태(dragIdx)**, 바 캔버스 자체에 `touchAction:none`. 바는 직접 그림(useCanvas2D 미사용 —
   드래그/핸들 필요). 계단=evalRamp(smooth=false)는 hold(왼쪽 stop 색), 텍스처 minFilter=Nearest.
4. **HalfLambertCompare** (과정) — Lambert vs Half-Lambert. `(N·L*0.5+0.5)` + 제곱 토글. remap
   곡선 미니그래프(x=raw N·L −1..1, y=diffuse). 밴드 0=연속. 광원을 뒤로(azimuth~150°) 두고 비교.
5. **WarmCoolToon** (과정) — Gooch 두-극 lerp, t=(1+N·L)/2. warm/cool 색픽커 + "색조 시프트"
   토글(끄면 두 색의 휘도만 보간=회색조). 밴드 0=연속.
6. **FwidthAA** (과정) — hard / 고정폭 smoothstep / fwidth smoothstep 3-way. 줌(휠/핀치)에서
   경계 품질 비교. `fwidth(x)`를 smoothstep 반폭으로.

## 기술 노트 / 단순화
- **색공간**: 셀 셰이딩은 밴드 경계 가독성이 더 중요해 sRGB 표시색을 그대로 다룸(`hexToSRGB`),
  gamma 변환 생략. (microfacet 데모와 달리 선형화 안 함 — 의도적.) 물리 정확도가 목적이 아님.
- **Half-Lambert 제곱·"no physical basis"**는 VDC/Source Course 노트 기반 **대표 표기**(원 PDF
  직접 fetch 403 → 검색 스니펫+VDC 교차확인). sources.md 플래그 참고.
- **Gooch t=(1+N·L)/2 + 두-극 lerp**도 대표 표기(원논문은 albedo 혼합 k_cool/k_warm 항 포함).
- **fwidth**: 2×2 quad 미분. `abs(dFdx)+abs(dFdy)`. WebGL2 기본 제공(별도 확장 불필요).
- **RampEditor 알려진 한계**: smooth=true(보간) + minFilter=Nearest라 256 텍셀 계단이 미세하게
  남을 수 있음(육안 거의 안 보임). 더 부드럽게 하려면 LinearFilter로 바꾸거나 폭↑. 계단 모드가
  주 용도라 Nearest 유지. stop 최대 6개·최소 2개.

## 검증 펜딩(브라우저 클린 프로필 — 빌드/타입 통과 ≠ 올바른 렌더)
- **RampEditor 모바일 드래그**: iOS Safari에서 stop 핸들이 손가락을 따라오는지(usePointerDrag 규칙).
- 라이트/다크 양쪽: 2D 막대(BandingToon)·remap 그래프(HalfLambert)·램프 바 색/라벨 가독성.
- 좁은 폭(~360px): 그래프 축 라벨·바 양끝 라벨 겹침 여부. 컨트롤 버튼(stop 추가/삭제) 레이아웃.
- FwidthAA: 줌인/아웃 시 경계 두께 일정 여부 육안 확인(핵심 주장).
- HalfLambertCompare: 광원 뒤로 돌렸을 때 뒷면이 실제로 살아나는지 + 제곱이 대비 되살리는지.

## chapters.ts 등록 제안 (오케스트레이터가 중앙 등록)
```ts
{ slug: 'cel-shading-ramp', title: '셀 셰이딩과 램프 라이팅',
  description: '연속 diffuse를 step·quantize·편집 가능한 1D ramp로 끊고 half-Lambert·warm–cool·fwidth로 다듬기',
  section: '카툰 · NPR 렌더링' }
```
새 섹션이므로 사이드바 그룹 순서상 적절한 위치(렌더링 계열 뒤 등)에 배치 권장.
```
