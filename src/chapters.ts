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
  // ── 그래픽스 드라이버 ──
  {
    slug: 'gpu-cpu-conversation',
    title: 'CPU와 GPU의 대화 — 명령 버퍼와 비동기',
    description: 'GPU는 별도의 비동기 프로세서다 — command buffer에 기록하면 GPU가 나중에 소비한다. ring buffer·frames in flight·fence·user/kernel 드라이버',
    section: '그래픽스 드라이버',
  },
  {
    slug: 'wddm-graphics-stack',
    title: 'Windows 그래픽스 스택 — WDDM: runtime·UMD·KMD',
    description: 'WDDM 5겹 스택·DDI 호출 흐름·VRAM↔system residency/paging·WDDM 1.x patch vs 2.0 GPUVA·Vulkan loader+ICD',
    section: '그래픽스 드라이버',
  },
  {
    slug: 'draw-call-journey',
    title: '드로우 콜의 일생 — Draw 한 번이 GPU에 닿기까지',
    description: 'Draw() 한 번이 runtime 검증·UMD 변환·command buffer·커널 제출을 거쳐 GPU에 닿기까지. per-draw vs 제출 단위 비용, D3D11 immediate vs D3D12/Vulkan 기록',
    section: '그래픽스 드라이버',
  },
  {
    slug: 'pipeline-state-shaders',
    title: '상태·셰이더·PSO — 드라이버가 하는 변환',
    description: '파이프라인 상태 변환 시점(DX9→DX11→DX12/Vulkan)·셰이더 2단 컴파일(DXBC/DXIL/SPIR-V→ISA)·바인딩 모델 대응',
    section: '그래픽스 드라이버',
  },
  {
    slug: 'dx-evolution-vulkan',
    title: 'DX9 → DX11 → DX12, 그리고 Vulkan',
    description: '세대별로 무엇이·왜 바뀌었나 — hazard·residency·스레딩·draw call 오버헤드와 D3D12↔Vulkan 1:1 대응',
    section: '그래픽스 드라이버',
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
    title: '워프 divergence와 occupancy',
    description: 'divergence·재수렴·predication·스케줄러/스코어보딩·지연 은닉·occupancy',
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
  {
    slug: 'tile-based-rendering',
    title: 'Tile-Based Rendering과 모바일 GPU',
    description: '모바일 GPU가 화면을 타일로 그리는 이유 — DRAM 대역폭과 전력. IMR vs TBR/TBDR·GMEM·binning·HSR·overdraw·load/store op',
    section: 'GPU ↔ 렌더링',
  },
  {
    slug: 'memory-bandwidth-roofline',
    title: '메모리 대역폭과 Roofline',
    description: '현대 GPU의 진짜 병목 — roofline·arithmetic intensity·ridge point·대역폭 예산·DCC·Morton swizzle',
    section: 'GPU ↔ 렌더링',
  },
  // ── Unreal RHI ──
  {
    slug: 'ue-gpu-crash-debugging',
    title: '언리얼 GPU 프로파일링 & 크래시 디버깅',
    description: 'RHI breadcrumbs·새 제출 파이프라인·Stat GPU·Unreal Insights·TDR/page fault·크래시 리포트 자동화',
    section: 'Unreal RHI',
  },
  // ── 카툰 · NPR 렌더링 ──
  {
    slug: 'cel-shading-ramp',
    title: '셀 셰이딩과 램프 라이팅',
    description:
      '연속 diffuse를 step·quantize·편집 가능한 1D ramp로 끊고 half-Lambert·warm–cool·fwidth로 다듬기',
    section: '카툰 · NPR 렌더링',
  },
  {
    slug: 'toon-outline',
    title: '윤곽선과 외곽선 — inverted-hull과 에지 검출',
    description:
      '실루엣을 그리는 두 방법 — 부푼 백페이스(inverted-hull)와 깊이·노멀 불연속 후처리. 화면공간 일정 두께 보정까지',
    section: '카툰 · NPR 렌더링',
  },
  {
    slug: 'rim-light-matcap',
    title: '림 라이트와 매트캡',
    description:
      '프레넬 림으로 윤곽을 빛으로 분리하고, 조명 계산 없는 matcap으로 재질을 한 번에 — NPR의 base와 accent 레이어링',
    section: '카툰 · NPR 렌더링',
  },
  {
    slug: 'anime-toon-face',
    title: '아니메 툰 셰이딩과 얼굴',
    description:
      '평면적 램프·머티리얼 존·아웃라인으로 만드는 아니메 룩과, 얼굴 SDF 그림자 맵·구면 법선·머리카락 하이라이트 등 얼굴 전용 트릭',
    section: '카툰 · NPR 렌더링',
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

/**
 * 챕터 간 "관련 문서" 링크(지식 그래프의 간선).
 * 한쪽에만 적어도 **양방향(undirected)**으로 취급됩니다(getRelated가 역방향도 모음).
 * 같은 section의 순서(이전/다음)는 자동이므로, 여기엔 주로 **개념적으로 이어지는 교차 링크**를 둡니다.
 */
const RELATED: Record<string, string[]> = {
  transformations: ['quaternions', 'bezier-de-casteljau'],
  quaternions: ['transformations'],
  'bezier-de-casteljau': ['transformations'],
  'microfacet-brdf': ['monte-carlo-integration', 'texture-filtering-mipmapping', 'cel-shading-ramp'],
  'monte-carlo-integration': ['microfacet-brdf'],
  'cel-shading-ramp': ['toon-outline', 'microfacet-brdf', 'rim-light-matcap'],
  'toon-outline': ['cel-shading-ramp', 'rendering-execution-model', 'graphics-pipeline-journey', 'anime-toon-face'],
  'rim-light-matcap': ['cel-shading-ramp', 'microfacet-brdf', 'anime-toon-face'],
  'anime-toon-face': ['cel-shading-ramp', 'toon-outline', 'rim-light-matcap'],
  'raymarching-sdf': ['noise-functions'],
  'noise-functions': ['raymarching-sdf'],
  'command-queues': ['gpu-cpu-conversation', 'dx-evolution-vulkan'],
  'gpu-cpu-conversation': ['command-queues', 'wddm-graphics-stack', 'draw-call-journey'],
  'wddm-graphics-stack': ['gpu-cpu-conversation', 'draw-call-journey'],
  'draw-call-journey': [
    'wddm-graphics-stack',
    'pipeline-state-shaders',
    'dx-evolution-vulkan',
    'graphics-pipeline-journey',
  ],
  'pipeline-state-shaders': ['draw-call-journey', 'dx-evolution-vulkan'],
  'dx-evolution-vulkan': [
    'pipeline-state-shaders',
    'draw-call-journey',
    'command-queues',
    'ue-gpu-crash-debugging',
  ],
  'gpu-execution-model': ['warp-divergence-occupancy', 'rendering-execution-model', 'memory-bandwidth-roofline'],
  'warp-divergence-occupancy': ['gpu-execution-model', 'rendering-execution-model'],
  'graphics-pipeline-journey': ['rendering-execution-model', 'tile-based-rendering', 'draw-call-journey'],
  'rendering-execution-model': [
    'gpu-execution-model',
    'graphics-pipeline-journey',
    'texture-filtering-mipmapping',
    'warp-divergence-occupancy',
  ],
  'texture-filtering-mipmapping': [
    'rendering-execution-model',
    'texture-compression',
    'memory-bandwidth-roofline',
    'microfacet-brdf',
  ],
  'texture-compression': ['texture-filtering-mipmapping', 'memory-bandwidth-roofline'],
  'tile-based-rendering': ['graphics-pipeline-journey', 'memory-bandwidth-roofline', 'rendering-execution-model'],
  'memory-bandwidth-roofline': ['tile-based-rendering', 'texture-compression', 'gpu-execution-model'],
  'ue-gpu-crash-debugging': ['dx-evolution-vulkan', 'command-queues', 'draw-call-journey'],
};

/** slug → Chapter 빠른 조회(라이브 챕터만). */
function liveBySlug(): Map<string, Chapter> {
  const m = new Map<string, Chapter>();
  for (const c of chapters) if (!c.draft) m.set(c.slug, c);
  return m;
}

/**
 * 주어진 챕터의 관련 문서를 반환합니다(양방향 union, draft·자기자신 제외, 중복 제거).
 * 순서: RELATED에 적은 순 → 역방향에서 발견된 순.
 */
export function getRelated(slug: string): Chapter[] {
  const live = liveBySlug();
  const seen = new Set<string>([slug]);
  const out: Chapter[] = [];
  const push = (s: string) => {
    if (seen.has(s)) return;
    seen.add(s);
    const c = live.get(s);
    if (c) out.push(c);
  };
  (RELATED[slug] ?? []).forEach(push);
  for (const [from, tos] of Object.entries(RELATED)) {
    if (tos.includes(slug)) push(from);
  }
  return out;
}

/**
 * 추천 읽기 경로(reading track). 지도 페이지에서 버튼으로 선택하면 순서대로 강조됩니다.
 * slugs는 읽는 순서이며, draft·미존재 슬러그는 지도에서 자동으로 걸러집니다.
 */
export interface ReadingPath {
  id: string;
  title: string;
  description: string;
  slugs: string[];
}

export const READING_PATHS: ReadingPath[] = [
  {
    id: 'math',
    title: '기초 수학',
    description: '회전·곡선 — 그래픽스의 토대가 되는 변환과 보간.',
    slugs: ['transformations', 'quaternions', 'bezier-de-casteljau'],
  },
  {
    id: 'shading',
    title: '셰이딩 → NPR',
    description: '물리 기반 BRDF에서 출발해 셀 셰이딩·윤곽선·림/매트캡, 아니메 얼굴 셰이딩까지.',
    slugs: [
      'microfacet-brdf',
      'monte-carlo-integration',
      'cel-shading-ramp',
      'toon-outline',
      'rim-light-matcap',
      'anime-toon-face',
    ],
  },
  {
    id: 'driver',
    title: '드라이버 깊이 읽기',
    description: 'CPU가 GPU에게 일을 시키는 전 과정 — 명령 버퍼·드라이버 스택·드로우 콜·PSO·세대 진화.',
    slugs: [
      'gpu-cpu-conversation',
      'wddm-graphics-stack',
      'draw-call-journey',
      'pipeline-state-shaders',
      'dx-evolution-vulkan',
    ],
  },
  {
    id: 'gpu-pipeline',
    title: 'GPU 파이프라인 종주',
    description: '워프 실행 모델에서 삼각형 래스터화·픽셀 셰이딩·텍스처 샘플링까지.',
    slugs: [
      'gpu-execution-model',
      'warp-divergence-occupancy',
      'graphics-pipeline-journey',
      'rendering-execution-model',
      'texture-filtering-mipmapping',
    ],
  },
  {
    id: 'perf',
    title: '성능과 대역폭',
    description: '현대 GPU의 진짜 병목 — 픽셀 쿼드·타일 렌더링·텍스처 압축·roofline.',
    slugs: [
      'rendering-execution-model',
      'tile-based-rendering',
      'texture-compression',
      'memory-bandwidth-roofline',
    ],
  },
];

/** 지도(map) 페이지용: 라이브 챕터 사이의 무방향 간선 목록(중복 제거). */
export function getRelationEdges(): { a: string; b: string }[] {
  const live = liveBySlug();
  const pairs = new Set<string>();
  const edges: { a: string; b: string }[] = [];
  for (const [from, tos] of Object.entries(RELATED)) {
    if (!live.has(from)) continue;
    for (const to of tos) {
      if (!live.has(to) || from === to) continue;
      const key = from < to ? `${from}|${to}` : `${to}|${from}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      edges.push({ a: from, b: to });
    }
  }
  return edges;
}
