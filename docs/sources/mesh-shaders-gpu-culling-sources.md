# Mesh/Amplification 셰이더와 GPU-driven 컬링 — 출처와 검증 노트

집필·검수 시 사용한 1차/전문가 자료와, 본문 핵심 사실 ↔ 출처 대응. 수치는 ≥2개 출처로 교차확인.

## 핵심 사실 ↔ 출처

| 본문 주장 | 출처 | 비고 |
|---|---|---|
| mesh/amplification shader가 IA+VS/HS/DS/GS를 선택적으로 대체 | MS DirectX devblog (2019), MeshShader.md | 확정 |
| D3D12 mesh/amp shader 2019년 11월 dev preview 발표 | MS DirectX devblog "Coming to DirectX 12" / "Dev Preview" | 확정(시점) |
| meshlet 권장 64 verts / 126 tris | NVIDIA "Introduction to Turing Mesh Shaders" | 126은 128B 정렬: 3×126+4=382≤384 |
| 84 verts/40 tris 등 다른 조합도 가능 | NVIDIA Turing mesh shader blog | 보조 수치 |
| meshlet에 bounding box·normal cone 저장 → cluster backface 컬링 | NVIDIA Turing blog, NVIDIA Advanced API Performance | 확정 |
| mesh shader = compute式, 입력 사실상 thread ID + amp payload | MS DirectX devblog, MeshShader.md | 확정 |
| D3D12 mesh groupshared 28KB(compute 32KB) | MeshShader.md (검색 인용) | 명세 수치 |
| amplification payload 최대 16KB, `DispatchMesh(x,y,z)` 정확히 1회·uniform flow | MeshShader.md | 확정 |
| Vulkan `VK_EXT_mesh_shader` 2022, 사양 1.3.226, cross-vendor (NV→EXT) | Khronos proposal, Khronos blog, GamingOnLinux | 확정 |
| `maxMeshOutputVertices`/`maxMeshOutputPrimitives` 한도 질의 | VkPhysicalDeviceMeshShaderPropertiesEXT man page | 확정 |
| HW: NVIDIA Turing(2018)+, AMD RDNA2(2020)+ | NVIDIA Turing blog, Khronos/GPUOpen | 확정 |
| amp shader가 컬링/LOD 결정 후 살아남은 것만 DispatchMesh | MS devblog, NVIDIA Advanced API Performance | 확정 |
| GPU-driven: indirect draw로 GPU가 draw 인자 채움 (ExecuteIndirect / vkCmdDrawMeshTasksIndirect) | MS Learn D3D12, Khronos | 확정 |
| GS가 대부분 HW에서 느림 | 통념(전문가 분석 다수); 본문 단정 표현 완화함 | 일반론 |

## 마케팅/미확정 (본문에서 완화·플래그)

- UE5 Nanite = 클러스터(meshlet) 기반 GPU 컬링이지만 **mesh shader가 아니라 자체 SW 래스터라이저**도
  많이 씀 → 본문에 "아이디어는 같지만 구현은 다르다"로 명시. (Epic Nanite 자료 기반.)
- normal cone 컬링/occlusion(Hi-Z) 컬링의 정확한 단계 순서·통과율은 엔진마다 다름 → 데모 숫자는
  "도식용 대표값"으로 figcaption에 명시. **낮은 신뢰도/주의.**

## 주요 URL

- https://devblogs.microsoft.com/directx/coming-to-directx-12-mesh-shaders-and-amplification-shaders-reinventing-the-geometry-pipeline/
- https://microsoft.github.io/DirectX-Specs/d3d/MeshShader.html
- https://developer.nvidia.com/blog/introduction-turing-mesh-shaders/
- https://developer.nvidia.com/blog/advanced-api-performance-mesh-shaders/
- https://docs.vulkan.org/features/latest/features/proposals/VK_EXT_mesh_shader.html
- https://registry.khronos.org/vulkan/specs/1.3-extensions/man/html/VK_EXT_mesh_shader.html
- https://www.khronos.org/blog/mesh-shading-for-vulkan

## 검수 메모

- 데모 `MeshletPartition`은 정점 공유·묶음만 보여주는 개념도(실제 클러스터링 알고리즘 아님).
- `CullStages`/`PipelineCompare`의 라벨은 명세 용어(Amplification/Mesh, IA/VS/HS/DS/GS) 사용. 숫자는 대표값.
