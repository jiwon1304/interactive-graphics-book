# 인터랙티브 컴퓨터 그래픽스 책 — 작업 가이드

AI 에이전트가 챕터 글과 데모를 작성하는 프로젝트입니다. 아래 규칙을 따르세요.

## 목표

다양한 컴퓨터 그래픽스 기법을, 글 + 수식 + **직접 조작 가능한 실시간 3D 데모**로
이해할 수 있게 만든다. 데스크톱과 **모바일 모두에서 잘 동작**해야 한다.

## 스택

- **Astro** (정적 사이트 생성) + **React islands**
- 3D: **three.js** + **@react-three/fiber** + **@react-three/drei**
- 수식: **KaTeX** — 인라인 `$...$`, 블록 `$$...$$`
- **TypeScript**

## 패키지 설치 (중요)

- 반드시 **프로젝트-로컬**로 설치한다: `npm install <pkg>`
- **전역 설치 금지**: `npm install -g` 를 쓰지 말 것. (로컬 `node_modules`가 venv 역할)

## 로컬 실행 / 빌드

- 개발 서버: `npm run dev`
- 정적 빌드: `npm run build` → `dist/`
- 타입체크: `npm run check` (`astro check` — 빌드는 타입을 검사하지 않으므로 변경 후 꼭 돌릴 것)
- 빌드 미리보기: `npm run preview`

## 새 챕터 추가하는 법

1. `src/chapters.ts`의 `chapters` 배열에 `{ slug, title, description?, section? }`를 **순서대로** 추가.
   → 사이드바·이전/다음·홈 목차에 자동 반영됨.
2. `src/pages/chapters/<slug>.mdx` 생성. frontmatter에 `layout`, `title`, `description` 지정.
3. 데모가 필요하면 `src/components/demos/<Name>.tsx`에 컴포넌트 작성(아래 *데모 작성*).
4. mdx에서 `import` 후 `<Name client:visible />`로 삽입.
   (`client:visible` = 화면에 보일 때만 로드 → 모바일 성능·배터리에 유리)

- 아직 글을 안 쓴 챕터는 `chapters.ts`에서 `draft: true`로 두면 사이드바에 회색·비활성("예정")으로만
  보이고 링크가 생기지 않음(이전/다음 계산에서도 제외). `.mdx`는 나중에 만들면 됨.
- 챕터/홈 링크는 항상 `chapterHref(slug)` / `homeHref()`로 만들어 `import.meta.env.BASE_URL`
  (GitHub Pages 하위 경로)을 존중할 것. 절대경로 `/chapters/...`를 직접 쓰지 말 것.

## 네비게이션 / 테마

- 레이아웃은 `src/layouts/ChapterLayout.astro`(사이드바 셸): 데스크톱(≥860px)은 좌측 고정 사이드바
  2-컬럼, 모바일은 상단 바 햄버거 → 오프캔버스 드로어(오버레이/Esc/링크 탭 시 닫힘).
- 사이드바 목록은 `src/components/Sidebar.astro`가 `chapters.ts`를 `section`별로 묶어 렌더하고
  현재 페이지를 하이라이트함. 이전/다음은 레이아웃 하단에서 `getAdjacent()`로 자동 생성.
- 테마는 **라이트가 기본** + 다크/라이트 토글(`ThemeToggle.astro`). `<head>`의 무플래시 인라인
  스크립트가 페인트 전에 `localStorage['theme']`(없으면 OS 선호도 1회 폴백)로 `html[data-theme]` 설정.
- 색 토큰은 `src/styles/global.css`의 `:root`(라이트)·`html[data-theme="dark"]`(다크)에서 관리.
  `--bg/--surface/--border/--text/--muted/--accent` 이름은 컴포넌트가 참조하므로 **변경 금지**.

## 데모 작성 규칙 (모바일 우선)

- 3D 캔버스는 항상 `src/components/DemoCanvas.tsx` 래퍼로 렌더한다.
  (dpr 상한, frameloop, touch-action 처리가 이미 들어있음)
- `DemoCanvas`의 `lights`(기본 on)·`axes`·`grid` prop으로 조명/좌표축/격자를 켠다.
  직접 light/축/격자를 작성하지 말 것. 토글과 연동하려면 state를 prop으로 전달.
- **UI 컨트롤은 `src/components/controls/`의 프리미티브로 조립**한다(직접 `<input>` 쓰지 말 것):
  `ControlPanel`(컨테이너) 안에 `Slider` / `ColorControl` / `ToggleControl` / `SelectControl`.
  컨트롤은 반드시 `<Canvas>` **밖**(DOM)에서 렌더. 색은 전역 변수를 따르므로 테마에 자동 적응.
- **3D 헬퍼는 `src/components/three/`** 사용: `StandardLights` / `Axes` / `GroundGrid`.
  모두 `<Canvas>` **안**에서만 사용.
- 카메라 조작은 drei `OrbitControls` 사용 (`enablePan={false}`, 터치·핀치 줌 기본 지원).
- 정적인 장면은 `<DemoCanvas animate={false}>`로 두어 GPU/배터리를 아낀다.
- 호환성 기준선은 **WebGL2**. (WebGPU는 모바일 호환성이 아직 들쭉날쭉)

## 참고 예시 (복사해서 시작하면 됨)

- 데모 컴포넌트(전체 툴킷 사용 예): `src/components/demos/RotatingBox.tsx` ← 표준 템플릿
- 챕터(mdx): `src/pages/chapters/transformations.mdx`
- 공통 래퍼: `src/components/DemoCanvas.tsx`
- 컨트롤 프리미티브: `src/components/controls/`  ·  3D 헬퍼: `src/components/three/`
- 챕터 레지스트리: `src/chapters.ts`

## 배포 (추후)

- 지금은 로컬 확인만. 배포는 추후 **GitHub Pages**.
- 그때 `astro.config.mjs`의 `site`/`base` 주석을 풀어 저장소에 맞게 설정하고,
  GitHub 저장소 Settings > Pages > Source 를 "GitHub Actions"로 변경.
  (`.github/workflows/deploy.yml` 이미 준비됨)
