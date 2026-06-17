# 인터랙티브 컴퓨터 그래픽스 책

다양한 컴퓨터 그래픽스 기법을 글·수식·실시간 3D 데모로 직접 만져보며 이해하는 책.
데스크톱과 모바일 모두에서 동작합니다.

## 스택

- [Astro](https://astro.build/) — 정적 사이트 생성 (islands 아키텍처)
- [React](https://react.dev/) islands — 인터랙티브 데모만 클라이언트에서 로드
- [three.js](https://threejs.org/) + [@react-three/fiber](https://r3f.docs.pmnd.rs/) + [@react-three/drei](https://drei.docs.pmnd.rs/) — 3D
- [KaTeX](https://katex.org/) — 수식

## 빠른 시작

```bash
npm install      # 의존성 설치 (프로젝트-로컬 node_modules에만, 전역 설치 안 함)
npm run dev      # 개발 서버 → http://localhost:4321
```

빌드 / 미리보기:

```bash
npm run build    # dist/ 에 정적 사이트 생성
npm run preview  # 빌드 결과를 로컬에서 확인
```

## 구조

```
src/
├─ pages/
│  ├─ index.astro                  # 홈 / 목차
│  └─ chapters/<slug>.mdx          # 각 챕터 (글 + 수식 + 데모)
├─ components/
│  ├─ DemoCanvas.tsx               # 모든 3D 데모가 공유하는 래퍼 (모바일 대응)
│  └─ demos/<Name>.tsx             # 챕터별 인터랙티브 데모
├─ layouts/ChapterLayout.astro     # 공통 레이아웃 (KaTeX CSS 포함)
└─ styles/global.css               # 전역 스타일
```

새 챕터·데모를 추가하는 자세한 규칙은 [`CLAUDE.md`](./CLAUDE.md) 참고.

## 배포 (추후)

지금은 로컬 확인용. 추후 GitHub Pages로 배포합니다.

1. `astro.config.mjs`의 `site` / `base` 주석을 풀어 저장소에 맞게 설정
2. GitHub 저장소 **Settings → Pages → Source** 를 **GitHub Actions** 로 변경
3. `main`에 push하면 `.github/workflows/deploy.yml`이 자동 빌드·배포
