# 챕터 인계 노트 — 마이크로패싯 BRDF와 PBR

## 목적 / 범위

Cook–Torrance 마이크로패싯 BRDF를 **과정 중심**으로 가르친다. 기존의 "최종 구 하나를 조절하는"
결과 중심 데모를 폐기하고, 각 개념(미세 거울 통계 → 하프벡터 → D → G → F → 조립 → 완성)을
**작은 위젯 여러 개**로 분해해 메커니즘(중간량, 단계별 누적)을 직접 보여준다.

범위: 단일 방향 직사광 + 단일 산란. IBL / 멀티스캐터 / 면광원은 "더 나아가기"에서 언급만 함.

## 파일 구성

- `src/pages/chapters/microfacet-brdf.mdx` — 본문(한국어 + KaTeX). 7개 위젯을 개념이 등장하는
  지점에 삽입. `client:visible`로 로드(모바일 배터리).
- `src/components/demos/microfacet-brdf/` — 네임스페이스 폴더(아래 위젯들 + 공유 모듈).
  - `microfacet.glsl.ts` — 공용 GLSL3 조각: `VERTEX_SHADER`, `BRDF_COMMON`(D/G/F 함수 +
    uniform/varying 선언). 3D 위젯들이 import해 프래그먼트 본문만 덧붙임.
  - `shared.ts` — 색 변환(`hexToLinearRGB`), 2D 캔버스 훅(`useCanvas2D`), 테마 색 읽기
    (`readThemeColors`), JS판 BRDF 수식(`distributionGGX`/`directK`/`geometrySchlickGGX`/
    `fresnelSchlick`), 결정론적 노이즈(`seededNoise`).
- `docs/chapters/microfacet-brdf.md` — 이 노트.

기존의 단일 결과형 데모 `src/components/demos/MicrofacetBRDF.tsx`는 **삭제됨**. 새 mdx는 네임스페이스
폴더의 위젯들만 import한다.

## 위젯 목록

| 위젯 | 파일 | 가르치는 개념 | 유형 | 핵심 파라미터 / 유니폼 |
|---|---|---|---|---|
| A. 미세 거울 단면 | `MicrofacetMirrors.tsx` | 거칠기 = 미세 법선의 통계적 흩어짐 | **PROCESS** | roughness(시드 기반 틸트 스케일), 법선/광선 토글 |
| B. 하프 벡터 만들기 | `HalfVectorBuilder.tsx` | h=normalize(l+v)가 곧 문제의 미세면 법선 | **PROCESS** | l/v 고도·방위각 슬라이더 4개, n·h 각도 표시 |
| C. GGX 로브 | `GGXLobe.tsx` | D(θ) 봉우리 형상이 거칠기로 좁아짐/넓어짐 | **PROCESS** | roughness, 비교용 고스트 로브(0.7) 토글 |
| D. 마스킹/섀도잉 | `MaskingShadowing.tsx` | grazing+거칠기에서 가림·그늘로 에너지 손실 | **PROCESS** | roughness, 광원각, 시선각, 표시(둘다/그늘/가림), Smith G₁ 미니플롯 |
| E. 프레넬 곡선 | `FresnelCurve.tsx` | F(θ)가 grazing에서 1로 치솟음 | **PROCESS** | F0 슬라이더, 드래그 가능한 각도 마커 |
| F. D×G×F 조립 | `DFGAssembly.tsx` | 스펙큘러가 D·G·F의 곱으로 조립됨 | **PROCESS(센터피스)** | 단계 프리셋(D/DG/DGF), uUseD/uUseG/uUseF, roughness/metalness/azimuth |
| G. 완성 구 샌드박스 | `ShadedSphere.tsx` | 모든 항을 한 구에서 자유 조절 + D/G/F 흑백 뷰 | RESULT(샌드박스) | baseColor, roughness, metalness, azimuth, viewMode, 디퓨즈 토글 |

## 수식 (구현 그대로)

- `alpha = roughness^2` (셰이더에서 `roughness >= 0.02` 클램프).
- GGX D: `a2=alpha^2; denom=NdotH^2*(a2-1)+1; D=a2/(PI*denom^2)`.
- Smith G(직접광): `k=(roughness+1)^2/8; G1(x)=NdotX/(NdotX*(1-k)+k); G=G1(NdotV)*G1(NdotL)`.
- Schlick F: `F=F0+(1-F0)*pow(clamp(1-VdotH,0,1),5)`, `F0=mix(vec3(0.04),baseColor,metalness)`.
- Cook–Torrance 스펙큘러: `D*G*F / max(4*NdotL*NdotV, 1e-4)`.
- 디퓨즈: `kd=(1-F)*(1-metalness); diffuse=kd*baseColor/PI`.
- `Lo=(diffuse+specular)*NdotL + baseColor*0.03*(1-metalness)`(약한 ambient). 감마 `pow(Lo,1/2.2)`.
- 광원 방향: `set(cos(phi),0.6,sin(phi)).normalize()`, `phi=azimuth*PI/180`.

## 기술 노트

### GLSL3 규칙
- `glslVersion: THREE.GLSL3`. 정점은 `in/out`, 프래그먼트는 `out vec4 fragColor` 선언(맨 위
  `precision highp float;`), `gl_FragColor` 사용 금지.
- 공용 `BRDF_COMMON` 문자열에 varying/uniform/함수가 모두 들어있고, 각 3D 위젯은
  `${BRDF_COMMON}` 뒤에 자기 uniform과 `main()`만 덧붙인다.
- 재질은 `useMemo`로 한 번만 생성하고 `useFrame`에서 uniform만 갱신(매 프레임 카메라 위치 반영).
- 셰이더 구는 자체 조명을 계산하므로 `<DemoCanvas lights={false}>`.

### DFGAssembly의 항 게이팅
- `Dt=mix(1.0,D,uUseD)` 식으로 항을 끄면 1.0로 대체. 단, 분모 `4*NdotL*NdotV`는 **항상 유지**해
  D 단독도 화면에 담기게 bounded. 디퓨즈는 조립 과정에 집중하려고 약한 ambient(`baseColor*0.05`)로만.

### 2D 캔버스 (dpr + 테마)
- `useCanvas2D(cssHeight, draw, deps)`가 처리: `canvas.width=cssW*dpr`, `height=cssH*dpr`
  (dpr 상한 2), `ctx.setTransform(dpr,…)`, CSS px로 style 폭/높이. 폭은 부모 `clientWidth`를
  ResizeObserver로 측정해 반응형.
- **테마 인식**: 그릴 때마다 `readThemeColors(canvas)`로 `--bg/--surface/--border/--text/
  --muted/--accent`를 다시 읽음. 또 `html[data-theme]` 변경을 MutationObserver로 감지해 재드로우.
- 캔버스는 `.demo-canvas` div(전역 CSS: 보더/라운드/`touch-action:none`) 안에 둔다.

### 포인터 / 터치
- 인터랙티브 2D(위젯 E)는 Pointer Events(`onPointerDown/Move/Up/Cancel`) + `setPointerCapture`
  + canvas `style.touchAction:'none'`로 드래그 시 페이지 스크롤 방지.
- 3D 카메라는 drei `OrbitControls enablePan={false} makeDefault`(핀치 줌 기본).

### k 재매핑 (직접광 vs IBL)
- 본 챕터는 **직접광** `k=(roughness+1)^2/8` 사용. IBL은 `k=roughness^2/2`(본문에서 언급만).

## 의도(참여)
- 오프닝 훅: "왜 거친 금속은 하이라이트가 번질까?" → 위젯 A가 즉답.
- 각 위젯마다 figcaption에 "직접 해보세요" 한두 문장(무엇을 만지고 무엇을 볼지).
- 놀라움 강조: grazing에서 모든 표면이 거울(F), 하이라이트는 D×G×F의 곱(조립).

## 알려진 한계 / TODO
- **마스킹/섀도잉(D)는 양식화된 근사**다. 화면상 높이 프로파일을 따라 수평선 레이 테스트로
  가림/그늘을 판정하므로 정확한 Smith 적분이 아니다. 경향(거칠수록·grazing일수록 손실↑)만 물리와 일치.
- GGX 로브(C)는 절대값이 아니라 **봉우리=1로 정규화한 형상**.
- IBL / 멀티스캐터 / 에너지 손실 보정 / 면광원 미구현.
- HalfVectorBuilder는 슬라이더 기반(구면 드래그 픽킹은 미구현; 안정성 우선).

## 확장 방법
- **IBL 위젯**: prefiltered env + split-sum BRDF LUT 시각화(2D LUT 텍스처 + 미리적분 곡선).
- **에너지 손실 vs 거칠기 플롯**: 단일 산란 거친 금속의 알베도 감소를 곡선으로(멀티스캐터 보정 전/후).
- **D 히스토그램**: 위젯 C에 미세 법선 개수 히스토그램 오버레이.
- MaskingShadowing을 실제 Smith height-correlated G2로 교체.

## 관련 주제
- 조명(lighting) 챕터: 광원 모델·복사휘도·코사인 항의 기초. 본 챕터의 반사 방정식이 거기서 이어짐.
