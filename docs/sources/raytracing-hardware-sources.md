# 출처 — raytracing-hardware ("레이트레이싱 하드웨어 — RT 코어와 BVH")

리서치 에이전트가 웹 검색으로 수집·교차검증(다툼 하드웨어 수치는 ≥2 출처). RT 코어 내부는 벤더
비공개이므로 "공개된 수준"만 단정, 마케팅 수치는 상대값으로 표기. (세션 중 WebFetch 403 → canonical
URL + 검색 스니펫 교차확인.)

## 핵심 사실 ↔ 출처
- 전수검사 O(n) vs BVH 평균 O(log n), 값싼 box 검사로 컬링: https://en.wikipedia.org/wiki/Bounding_volume_hierarchy
- BVH 구조(AABB·leaf/internal), SAH 비용 SA(L)·N_L+SA(R)·N_R, 이진 vs wide BVH:
  https://www.pbr-book.org/3ed-2018/Primitives_and_Intersection_Acceleration/Bounding_Volume_Hierarchies ·
  https://www.embree.org/papers/2019-HPG-ShortStack.pdf
- 스택 순회·정렬(front-to-back) 가지치기: https://en.wikipedia.org/wiki/Bounding_volume_hierarchy
- ray-AABB 슬랩(tmin=max, tmax=min, tmin≤tmax, branchless, OptiX/Embree):
  https://medium.com/@bromanz/another-view-on-the-classic-ray-aabb-intersection-algorithm-for-bvh-traversal-41125138b525
- ray-triangle Möller–Trumbore(t,u,v 한번에, u≥0·v≥0·u+v≤1·t>0):
  https://en.wikipedia.org/wiki/M%C3%B6ller%E2%80%93Trumbore_intersection_algorithm
- TLAS/BLAS 2단계·인스턴싱(DXR/Vulkan): https://microsoft.github.io/DirectX-Specs/d3d/Raytracing.html ·
  https://www.khronos.org/blog/ray-tracing-in-vulkan
- NVIDIA RT 코어: 순회+ray-triangle 오프로드, Turing 1세대, Ada 2× tri + OMM/DMM + SER:
  https://developer.nvidia.com/blog/nvidia-turing-architecture-in-depth/ ·
  https://images.nvidia.com/aem-dam/Solutions/geforce/ada/nvidia-ada-gpu-architecture.pdf
- AMD 레이 가속기: box/triangle 교차 가속, 순회는 셰이더(전용 순회 HW 없음): https://en.wikipedia.org/wiki/RDNA_2
- Intel RTU: 순회+box+triangle+인스턴스 변환, TSU: https://www.intel.com/content/www/us/en/developer/articles/guide/real-time-ray-tracing-in-games.html
- 셰이더 스테이지(raygen/intersection/any-hit/closest-hit/miss), FORCE_OPAQUE: https://microsoft.github.io/DirectX-Specs/d3d/Raytracing.html

## 낮은 신뢰도/주의 (본문 반영)
- RT 코어 내부 마이크로아키텍처(파이프라인·노드 포맷·정확한 BVH 분기 계수)는 벤더 비공개 → 단정 회피.
- "10 Giga-Rays/s", "Ada 2×", OMM/DMM "2×/10×/20×", RDNA3 1.8×, SER 40~47%는 벤더/워크로드 의존
  마케팅 수치 → 상대·조건부로만.
- AMD "순회를 전혀 가속 안 함"은 과한 단정 → "전용 순회 HW 없음, 순회 루프는 셰이더, 교차 산술은 가속"으로 표현.
- O(log n)은 평균 경향(최악 보장 아님) → 본문 명시.

## 데모 ↔ 사실
- `BVHTraversal`: 2D 삼각형 장면 BVH 빌드(SAH/median 토글)·정렬 순회 토글·드래그 광선 → box/삼각형
  테스트 카운터(전수검사 대비). (§1–3)
- `RayAABBSlab`: 드래그 광선의 축별 슬랩 [t1,t2] → tmin/tmax·tmin≤tmax 판정. (슬랩 검사)
