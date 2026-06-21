# 에이전트 핸드오프 — 프로젝트 상태 & 작업 메모리

> 이 문서의 목적: **다른 AI 에이전트(또는 미래의 나)가 이어서 같은 방식으로 작업**할 수 있도록,
> 프로젝트 목표·사용자 선호·핵심 결정·수정 이력·집필 파이프라인·기술 규약·현재 상태·남은 일을 한곳에 정리.
> **새 작업 전 이 문서 + [`AUTHORING-GUIDE.md`](./AUTHORING-GUIDE.md) + [`WRITING-CRAFT.md`](./WRITING-CRAFT.md)를 먼저 읽을 것.**
> (작성: 2026-06-20)

---

## 1. 프로젝트 한 줄 요약
**인터랙티브 컴퓨터 그래픽스 책**(한국어, 웹). 그래픽스/GPU 기법을 **글 + 수식(KaTeX) + 직접 조작 인터랙티브/정적 도식**으로
이해시킨다. 데스크톱·**모바일 모두** 잘 동작. 스택: **Astro + React islands + react-three-fiber/three.js + KaTeX + TypeScript**,
정적 빌드 → **GitHub Pages**.

- repo: `github.com/jiwon1304/interactive-graphics-book` (public)
- live: `https://jiwon1304.github.io/interactive-graphics-book/`
- `astro.config.mjs`: `site` = github.io, `base` = `/interactive-graphics-book/`. 배포는 `.github/workflows/deploy.yml`(withastro/action, node 22).

---

## 2. 사용자가 일하는 방식 / 좋아하는 것 (★ 중요)
- **완전 자율 위임.** "taste/방향"만 묻고(보통 `AskUserQuestion`), 세부는 알아서 결정. **병렬 Opus 서브에이전트**를 적극 사용.
- **글 작성까지 AI가 전부.** 사용자는 방향·취향만.
- **gpu-execution-model 챕터 문체를 특히 좋아함** → 새 챕터의 **템플릿**으로 삼을 것:
  놀라운/구체적 숫자로 **훅** → **유도된 수학**을 본문에 엮음 → **도식 안 글자 최소(설명은 캡션)** →
  `<details>` **2-독자 레이어링** → predict-then-reveal → 따뜻한 2인칭 → **재미있게**.
- **"다양하게 주제를 잡되, 한 챕터를 기초→심화로 길고 깊게."** (짧은 개요 금지)
- 구체적으로 관심 보인 토픽: "**triangle의 여정**(그래픽스 파이프라인)", "**quad overdraw**".
- 리서치를 중요시함 — 새 분야는 **웹에서 많이 조사한 뒤** 카탈로그→집필.

## 3. 절대 규칙 (사용자 지시, 반드시 지킬 것)
- **git 로컬 only**: remote에 push/추가하지 말 것. **단 GitHub Pages 배포는 명시적 예외**(현재 `main` push로 자동 배포 중). 커밋은 착실히.
- **npm 전역 설치 금지** (`npm install -g` ❌). 로컬 `node_modules`만.
- **브라우저 자동화는 게스트/클린 프로필에서만** (사용자가 "Chrome for Claude"라는 전용 프로필 운영). 메인 프로필 금지.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## 4. 집필 철학 (핵심 원칙)
1. **과정 > 결과.** 결과를 슬라이더로 만지는 게 아니라 *메커니즘/중간량/알고리즘 진행*을 드러낸다.
2. **인터랙티브는 "이해를 더할 때만".** 정적 이미지·도형으로 똑같이 전달되면 **인터랙티브 금지**.
   - 경험칙: **그래픽스 렌더링 주제 = 인터랙티브가 좋음**, **비-렌더링(GPU 하드웨어·드라이버·시스템·프로파일링·엔진 내부) = 정적 도식이 좋음.**
   - 하드웨어↔렌더링 *교차* 토픽은 혼합: **시각적 효과(앨리어싱·필터품질·압축 아티팩트·오버드로)=인터랙티브**, **메커니즘/데이터플로(쿼드 실행·early-Z·DCC·타일 비닝·포맷 구조)=정적.**
3. **도식 안 글자는 최소 → 설명은 캔버스 밖 `<figcaption>`에.** (겹침의 근본 해법. 캔버스엔 축·핵심 수치·짧은 노드명만.)
4. **길고 수학 풍부하게.** 공식은 **나열 말고 유도**. 직관 먼저 → 수식 → (만지는) 도식.
5. **재미·호기심.** 강한 훅, "직접 해보세요", 사람 독자 기준 검수.
6. **어려운 챕터는 적대적 검수**(스켑틱 서브에이전트가 반박 시도 → 진짜 결함만 수정).
7. **위젯은 브라우저(클린 프로필)로 시각 검증.** 빌드/타입체크 통과 ≠ 올바른 렌더. (캔버스 **y-down** 주의: 화살표 부호.)

## 5. 사용자 수정 지시 이력 (같은 실수 반복 금지)
- **microfacet 화살표 반대 방향** → `MicrofacetMirrors.tsx` INCIDENT.y 부호(`-1`→`+1`). canvas는 y가 아래로 증가.
- **SDF 히트맵이 1/2 크기** → `putImageData`가 dpr 변환을 무시함. **`blitImage`**(오프스크린→`drawImage`)로 해결.
- **거시 노멀 벡터를 눈에 띄게** → 굵게·진한색·화살촉·긴 길이.
- **정적/인터랙티브 원칙** → UE GPU 프로파일링은 인터랙티브 불필요(정적). command-queues·ue 챕터를 정적으로 전환함.
- **도식 안 글자 최소** → 설명은 캡션으로.
- **command-queues 도식 겹침** → 텍스트 좌표 충돌 수정(4개 도식).
- **ue 도식 겹침**(Breadcrumb 배너/StatGpu 좁은 라벨/CrashReport 주석) 수정.
- **(2026-06) 비유 최소 + 용어 한글번역 최소** → 직유/은유로 설명 대체 금지, 용어는 영어/발음 그대로
  (`anisotropic`·`occupancy`·`divergence` 등, `이방성`·`점유율` 금지). **기존 문서에도 소급 적용.**
  자세한 정책은 AUTHORING-GUIDE §1.5. (이후 작성한 texture-filtering-mipmapping부터 이 스타일.)
- **하드웨어 문서를 사용자가 특히 재밌어함** → "읽는 사람이 궁금해할 하드웨어 주제"를 계속 확장하라.
- **(2026-06) 반드시 공식 문서/전문가 글 기반으로 집필·검수** → 기억에만 의존 금지. 각 챕터의 1차 출처를
  `docs/sources/<slug>-sources.md`에 URL·검증사실로 남기고, 챕터 말미에 "참고 자료" 섹션. 검수도 그
  출처와 교차확인. (실제로 directx-driver-internals 초안에서 WDDM 1.x↔2.0 주소-patch 혼동을 GPU
  Virtual Memory in WDDM 2.0 문서로 잡아 수정함.)

## 6. 기술 규약 (집필 시 그대로 따를 것)
**새 챕터 추가:**
1. `src/chapters.ts`의 `chapters` 배열에 `{slug, title, description?, section?}`를 **순서대로**(=목차 순서) 추가. (오케스트레이터가 중앙에서. L2 서브에이전트는 건드리지 말 것.)
2. `src/pages/chapters/<slug>.mdx` 생성(frontmatter: layout/title/description).
3. 데모는 `src/components/demos/<slug>/` **네임스페이스 폴더**.
4. `docs/chapters/<slug>.md` 핸드오프 노트.

**정적 2D 도식:** `useCanvas2d(draw, [])` + 챕터-로컬 헬퍼 `<x>2d.ts`(setupCanvas/readTheme/observeTheme + withAlpha/roundRect/drawArrow/monoFont + COLORS). 참고: `command-queues/cq2d.ts`, `ue-gpu-crash-debugging/ue2d.ts`, `gpu-execution-model/gem2d.ts`.

**인터랙티브 2D 도식:** `src/components/controls/`(ControlPanel/Slider/ToggleControl/SelectControl) + 상태는 `useState`. **캔버스 드래그는 반드시 `usePointerDrag` 훅**(raymarching-sdf 패턴). ⚠️ **iOS Safari 함정**: React 합성 onPointer* 쓰지 말 것 → 네이티브 리스너 `{passive:false}` + `preventDefault`, 드래그 상태는 `useRef`(useState 아님), `setPointerCapture`는 try/catch, `touch-action:none`은 **`<canvas>` 자신에** 직접. 픽셀 버퍼는 `putImageData` 대신 **`blitImage`**.

**3D 도식:** `DemoCanvas` 래퍼 + r3f + `src/components/three/`(StandardLights/Axes/GroundGrid). OrbitControls(`enablePan={false}`). 정적 장면은 `animate={false}`.

**컨벤션:**
- 테마: 라이트 기본 + 다크 토글. 색은 CSS 변수(`--bg/--surface/--border/--text/--muted/--accent`) — readTheme로 읽음. **변경 금지**.
- HiDPI: setupCanvas(dpr). KaTeX `$...$`/`$$...$$`(MDX 본문만, **캡션엔 금지**).
- 링크: `chapterHref(slug)`/`homeHref()` 또는 mdx에선 상대 슬러그 `(slug)`(BASE_URL 존중). 절대경로 `/chapters/...` 금지.
- **TS strict 함정**: 가변 색 변수는 `let color: string = COLORS.x` 로 선언(리터럴 타입이 좁혀져 `ts(2322)` 나는 것 방지). 빌드는 타입검사 안 하므로 **변경 후 `npm run check` 필수**.
- 빌드/검증: `npm run check`(astro check) → `npm run build`. 미리보기 `npm run preview`.

## 7. 서브에이전트 오케스트레이션 (이렇게 굴렸음)
- **L1 기획 에이전트**: 무엇/어떻게/분할/범위 + 도식 기획 → **L2 집필 에이전트**(model opus)를 생성해 직접 작성 → **호출자(나)가 검수·직접 수정**.
- 실전 운영 노트:
  - L2 writer는 **무겁다**. 프롬프트에 **"파일을 그릴 때마다 즉시 Write(증분)"** 지시 → stall 시 손실 최소.
  - **"Connection closed mid-response" / "stalled 600s"는 대부분 사용자 PC가 절전에 들어가서** 생긴 것(에이전트 결함 아님). 절전 끄면 **병렬 다수 OK**.
  - L2는 **자기 폴더만** 건드림. `chapters.ts`/build/git/npm install은 **오케스트레이터가 중앙에서**(레이스 방지 — 다른 writer가 mdx 작성 중일 때 build 돌리면 깨짐).
  - 헬퍼(`<x>2d.ts`, `useCanvas2d.ts`, `usePointerDrag.ts`) 먼저 → 도식 → mdx → 핸드오프 순.
  - 검수: TS 에러, 정적/인터랙티브 적합성, 도식 글자 최소, 수학 정확, 라벨 겹침(브라우저), 적대적(어려운 챕터).

## 8. 토픽 카탈로그 (집필 백로그, `docs/`)
- `topic-catalog.md` — 그래픽스 알고리즘 133토픽
- `topic-catalog-gpu.md` — GPU 하드웨어·저수준 113토픽 (영역 A~H)
- `topic-catalog-toon.md` — 카툰/NPR 렌더링 82토픽 (**1편 집필됨**: cel-shading-ramp = A절 셀/램프. 나머지 백로그)
- `topic-catalog-hw-rendering.md` — **하드웨어↔렌더링 73토픽** (영역 A~E, 인터랙티브/정적 태그 포함) ← **현재 집필 중인 영역**

## 9. 현재 챕터 (라이브) 섹션 순서
기초(transformations, quaternions) · 지오메트리(bezier-de-casteljau) · 셰이딩(lighting[draft], microfacet-brdf) ·
레이트레이싱(monte-carlo-integration) · 절차적 생성(raymarching-sdf, noise-functions) · 렌더링(rasterization[draft]) ·
GPU 명령 제출(command-queues) · **그래픽스 드라이버**(gpu-cpu-conversation → wddm-graphics-stack → draw-call-journey →
pipeline-state-shaders → dx-evolution-vulkan; DirectX+Vulkan 병행, 초보-드라이버 독자, 공식문서 기반 — 기존
directx-driver-internals를 흡수·대체함) · **GPU 실행 모델**(gpu-execution-model, warp-divergence-occupancy) ·
**GPU ↔ 렌더링**(graphics-pipeline-journey, rendering-execution-model, texture-filtering-mipmapping, texture-compression,
tile-based-rendering, memory-bandwidth-roofline) · Unreal RHI(ue-gpu-crash-debugging) ·
**카툰 · NPR 렌더링**(cel-shading-ramp — 신규 섹션)

**문서 연결:** `chapters.ts`의 `RELATED`(무방향 교차링크) → 각 챕터 하단 "관련 문서" 카드 + `/map` 지도
페이지(section 컬럼 + 관련 간선 SVG 그래프, hover 강조). 새 챕터는 RELATED에 한두 개 교차링크를 더할 것.

**출처 노트:** 이제 모든 라이브 챕터에 `docs/sources/<slug>-sources.md` + 본문 "참고 자료"가 있음.

## 10. 지금 진행 중 / 남은 일 (TODO)
- **모바일 도식 규약(2026-06 적용):** 정적 2D 도식 캔버스엔 touch-action 설정 금지(전역 CSS가 페이지 스크롤 허용),
  드래그 위젯만 usePointerDrag가 touch-action:none 설정. 2D figure는 min-width 440 + 가로스크롤(캡션/컨트롤 sticky),
  `:has`로 3D 제외. 새 도식은 wrapText로 좁은 폭(~360–440px) 글자 겹침 방지.
- **시각 검증 하니스(2026-06 추가):** `scripts/shoot.mjs`(페이지)·`scripts/shoot-figs.mjs`(figure 개별) +
  `playwright-core`(devDep). 로컬 dev(`npm run dev`, base `/interactive-graphics-book/`) 띄우고
  `SHOT_DIR=/tmp/x node scripts/shoot-figs.mjs <base-url> chapters/<slug> [light|dark] [width]`로 캡처 후 이미지를 직접 검수.
  크롬 경로는 `PW_CHROME`로 override(클라우드 기본 `/opt/pw-browsers/...`). **client:visible는 헤드리스에서 스크롤
  패스로 강제 발화**해야 그려짐(스크립트에 내장). 빌드/타입 통과 ≠ 올바른 렌더 — 새 도식은 이걸로 확인.
- 드라이버 5부작·cel-shading·texture-filtering/tile-based/memory-bandwidth·/map 은 이 하니스로 라이트/다크/모바일 검증 완료.
- **백로그:** 카툰/NPR 나머지(topic-catalog-toon) · 그래픽스/GPU 카탈로그 나머지.

## 11. 필독 문서
- `docs/AUTHORING-GUIDE.md` — 집필 가이드(원칙·구조·도식 규약·함정·검수)
- `docs/WRITING-CRAFT.md` — 글쓰기 작법(모범 블로그 분석: 효과먼저·유도·naive실패·직관에이름·2-독자)
- `docs/chapters/<slug>.md` — 챕터별 핸드오프 노트
- `CLAUDE.md` — 프로젝트 규칙 요약
