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
- 빌드 미리보기: `npm run preview`

## 새 챕터 추가하는 법

1. `src/pages/chapters/<slug>.mdx` 생성. frontmatter에 `layout`, `title`, `description` 지정.
2. 데모가 필요하면 `src/components/demos/<Name>.tsx`에 컴포넌트 작성.
3. mdx에서 `import` 후 `<Name client:visible />`로 삽입.
   (`client:visible` = 화면에 보일 때만 로드 → 모바일 성능·배터리에 유리)
4. `src/pages/index.astro`의 `chapters` 배열에 목차 항목 추가.

## 데모 작성 규칙 (모바일 우선)

- 3D 캔버스는 항상 `src/components/DemoCanvas.tsx` 래퍼를 통해 렌더한다.
  (dpr 상한, frameloop, touch-action 처리가 이미 들어있음)
- 카메라 조작은 drei `OrbitControls` 사용 (터치·핀치 줌 기본 지원).
- 정적인 장면은 `<DemoCanvas animate={false}>`로 두어 GPU/배터리를 아낀다.
- 사용자 조작은 React state + `<input type="range">` / `type="color"` 등으로.
- 호환성 기준선은 **WebGL2**. (WebGPU는 모바일 호환성이 아직 들쭉날쭉)

## 참고 예시 (복사해서 시작하면 됨)

- 데모 컴포넌트: `src/components/demos/RotatingBox.tsx`
- 챕터(mdx): `src/pages/chapters/transformations.mdx`
- 공통 래퍼: `src/components/DemoCanvas.tsx`

## 배포 (추후)

- 지금은 로컬 확인만. 배포는 추후 **GitHub Pages**.
- 그때 `astro.config.mjs`의 `site`/`base` 주석을 풀어 저장소에 맞게 설정하고,
  GitHub 저장소 Settings > Pages > Source 를 "GitHub Actions"로 변경.
  (`.github/workflows/deploy.yml` 이미 준비됨)
