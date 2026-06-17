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
  {
    slug: 'transformations',
    title: '3D 변환: 회전',
    description: '회전 행렬과 인터랙티브 큐브',
    section: '기초',
  },
  // 아래는 예정(draft) 챕터 — 사이드바에 회색으로만 노출되고 링크는 없습니다.
  {
    slug: 'lighting',
    title: '조명',
    description: '광원 모델과 반사',
    section: '셰이딩',
    draft: true,
  },
  {
    slug: 'shading',
    title: '셰이딩',
    description: '퐁·블린-퐁 셰이딩',
    section: '셰이딩',
    draft: true,
  },
  {
    slug: 'rasterization',
    title: '래스터화',
    description: '삼각형 채우기와 깊이 버퍼',
    section: '렌더링',
    draft: true,
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
