// 챕터 목록의 단일 진실 공급원(single source of truth).
// 새 챕터를 추가하려면 아래 chapters 배열에 항목을 넣고,
// src/pages/chapters/<slug>.mdx 파일을 만들면 사이드바·이전/다음에 자동 반영됩니다.

export interface Chapter {
  /** URL 슬러그. 실제 페이지는 src/pages/chapters/<slug>.mdx */
  slug: string;
  /** 사이드바·목차에 표시되는 제목 */
  title: string;
  /** 짧은 설명(목차 카드 등에서 사용) */
  description?: string;
  /** 사이드바 그룹 이름. 같은 section끼리 묶여 표시됨 */
  section?: string;
  /** true면 아직 작성 전인 예정 챕터 → 회색·비활성(링크 없음) */
  draft?: boolean;
}

// 순서가 곧 책의 목차 순서입니다.
export const chapters: Chapter[] = [
  // ── 기초 ──
  {
    slug: 'transformations',
    title: '3D 변환: 회전',
    description: '회전 행렬과 인터랙티브 큐브',
    section: '기초',
  },
  {
    slug: 'quaternions',
    title: '쿼터니언과 회전',
    description: '짐벌 락부터 SLERP까지 — 회전을 4차원에서 다루는 법',
    section: '기초',
  },
  // ── 지오메트리 ──
  {
    slug: 'bezier-de-casteljau',
    title: '베지에 곡선과 드 카스텔조',
    description: '드 카스텔조 구성·번스타인 기저·곡선 분할',
    section: '지오메트리',
  },
  // ── 셰이딩 ──
  {
    slug: 'lighting',
    title: '조명',
    description: '광원 모델과 반사',
    section: '셰이딩',
    draft: true,
  },
  {
    slug: 'microfacet-brdf',
    title: '마이크로패싯 BRDF와 PBR',
    description: 'Cook–Torrance · GGX · 물리 기반 렌더링',
    section: '셰이딩',
  },
  // ── 레이트레이싱 ──
  {
    slug: 'monte-carlo-integration',
    title: '몬테카를로 적분',
    description: '무작위 표본으로 적분을 추정하고 수렴 과정을 직접 본다',
    section: '레이트레이싱',
  },
  // ── 절차적 생성 ──
  {
    slug: 'raymarching-sdf',
    title: '레이마칭과 거리장(SDF)',
    description: '스피어 트레이싱·거리장·스무스 민',
    section: '절차적 생성',
  },
  {
    slug: 'noise-functions',
    title: '노이즈 함수',
    description: 'value · Perlin · simplex와 fBm을 격자·보간·옥타브로 직접 만들기',
    section: '절차적 생성',
  },
  // ── 렌더링 (예정) ──
  {
    slug: 'rasterization',
    title: '래스터화',
    description: '삼각형 채우기와 깊이 버퍼',
    section: '렌더링',
    draft: true,
  },
  // ── GPU 명령 제출 ──
  {
    slug: 'command-queues',
    title: '명령 큐와 동기화',
    description: '명령 제출 생명주기·펜스·세마포어·배리어·async 오버랩',
    section: 'GPU 명령 제출',
  },
  // ── GPU 실행 모델 ──
  {
    slug: 'gpu-execution-model',
    title: 'GPU 실행 모델 — 워프와 락스텝',
    description: 'SM/CU 구조·코어 수의 정체·블록→워프 분해·SIMT와 락스텝',
    section: 'GPU 실행 모델',
  },
  {
    slug: 'warp-divergence-occupancy',
    title: '워프 다이버전스와 점유율',
    description: '다이버전스·재수렴·프레디케이션·스케줄러/스코어보딩·지연 은닉·점유율',
    section: 'GPU 실행 모델',
  },
  // ── GPU ↔ 렌더링 ──
  {
    slug: 'graphics-pipeline-journey',
    title: '삼각형의 여정 — 정점에서 픽셀까지',
    description: '삼각형 하나가 GPU 파이프라인을 통과하는 전 과정 — 클리핑·원근 분할·에지 함수 래스터화·early-Z·ROP',
    section: 'GPU ↔ 렌더링',
  },
  {
    slug: 'rendering-execution-model',
    title: '렌더링에서의 GPU 실행 — 픽셀 쿼드와 깊이 컬링',
    description: '워프 락스텝이 픽셀 셰이딩으로 — 2×2 쿼드·화면공간 미분과 밉 LOD·early-Z/Hi-Z/오버드로',
    section: 'GPU ↔ 렌더링',
  },
  {
    slug: 'texture-filtering-mipmapping',
    title: 'Texture Filtering과 Mipmap',
    description: '밉 LOD 선택 다음 — bilinear·trilinear·anisotropic 샘플링과 minification aliasing·prefilter',
    section: 'GPU ↔ 렌더링',
  },
  {
    slug: 'texture-compression',
    title: '텍스처 압축 — 블록 안에 색을 가두다',
    description: '블록 압축(BCn/ASTC)·BC1 해부·아티팩트·BC5 노멀맵·하드웨어 디코드·채널 패킹',
    section: 'GPU ↔ 렌더링',
  },
  // ── Unreal RHI ──
  {
    slug: 'ue-gpu-crash-debugging',
    title: '언리얼 GPU 프로파일링 & 크래시 디버깅',
    description: 'RHI breadcrumbs·새 제출 파이프라인·Stat GPU·Unreal Insights·TDR/page fault·크래시 리포트 자동화',
    section: 'Unreal RHI',
  },
];

/**
 * BASE_URL은 항상 '/'로 끝납니다(예: 로컬 '/', 프로젝트 페이지 '/repo/').
 * 슬래시 중복 없이 안전한 챕터 경로를 만듭니다.
 */
export function chapterHref(slug: string): string {
  return `${import.meta.env.BASE_URL}chapters/${slug}`;
}

/** 홈(인트로) 경로 = BASE_URL */
export function homeHref(): string {
  return import.meta.env.BASE_URL;
}

/**
 * 현재 슬러그의 이전/다음 챕터를 반환합니다.
 * draft 챕터는 건너뛰므로, 작성 전 챕터로 가는 죽은 링크가 생기지 않습니다.
 */
export function getAdjacent(slug: string): { prev?: Chapter; next?: Chapter } {
  const live = chapters.filter((c) => !c.draft);
  const i = live.findIndex((c) => c.slug === slug);
  if (i === -1) return {};
  return {
    prev: i > 0 ? live[i - 1] : undefined,
    next: i < live.length - 1 ? live[i + 1] : undefined,
  };
}

/**
 * section별로 묶은 챕터 그룹을 정의 순서대로 반환합니다(사이드바 렌더링용).
 * section이 없으면 '' 키로 묶입니다.
 */
export function chaptersBySection(): { section: string; items: Chapter[] }[] {
  const groups: { section: string; items: Chapter[] }[] = [];
  for (const c of chapters) {
    const key = c.section ?? '';
    let g = groups.find((x) => x.section === key);
    if (!g) {
      g = { section: key, items: [] };
      groups.push(g);
    }
    g.items.push(c);
  }
  return groups;
}

/** 경로(pathname)에서 현재 챕터 슬러그를 추출합니다. 챕터 페이지가 아니면 undefined. */
export function slugFromPathname(pathname: string): string | undefined {
  const m = pathname.match(/\/chapters\/([^/]+)\/?$/);
  return m ? m[1] : undefined;
}
