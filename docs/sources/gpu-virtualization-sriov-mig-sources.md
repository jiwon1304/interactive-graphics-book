# GPU 가상화 — SR-IOV와 MIG — 출처와 검증 노트

집필·검수 시 사용한 1차/전문가 자료와, 본문의 핵심 사실 ↔ 출처 대응. MIG 슬라이스 수·프로파일은
≥2개 출처로 교차확인. SKU별 차이는 본문에서 명시했다.

## 핵심 사실 ↔ 출처

| 본문 주장 | 출처 | 비고 |
|---|---|---|
| SR-IOV = 한 물리 PCIe 장치가 여러 가상 인스턴스(VF)를 PCIe 버스에 노출 | NVIDIA DOCA SR-IOV docs, PCI-SIG SR-IOV | 확정 |
| PF(Physical Function) = 전체 PCIe 기능 + 장치 설정·관리. VF(Virtual Function) = 경량 PCIe 기능(설정 리소스 일부 없음), PF 자원 공유 | NVIDIA Virtual Functions docs | 확정 |
| 각 VF는 자체 PCI config space를 갖고 VM에 직접 할당(passthrough) → VM 간 간섭 없이 I/O 직접 접근 | NVIDIA SR-IOV docs, CloudRift | 확정 |
| NVIDIA vGPU는 지원 데이터센터 GPU에서 내부적으로 SR-IOV VF를 만들고, MIG 인스턴스를 VF에 매핑 | CloudRift GPU virtualization, NVIDIA AI Enterprise docs | 확정 |
| MIG = **공간 분할(spatial partitioning)**: A100을 최대 **7개** 독립 GPU 인스턴스로. 각자 전용 SM·메모리·캐시 | NVIDIA MIG 페이지, DGX A100 User Guide, Ampere 백서 | 확정(A100 최대 7) |
| A100 40GB = 7 SM 슬라이스 + 8개 5GB 메모리 슬라이스(메모리는 8, compute는 7). 1g.5gb가 최소 단위 | NVIDIA Technical Blog "Getting the Most Out of A100 with MIG" | 메모리 8 vs compute 7 비대칭 |
| A100 MIG 프로파일: 1g.5gb(×7), 2g.10gb(×3), 3g.20gb(×2), 7g.40gb(×1) | NVIDIA Supported MIG Profiles | 확정 |
| MIG 인스턴스는 crossbar 포트·L2 캐시 뱅크·메모리 컨트롤러·DRAM 주소 버스까지 HW에서 분리 → QoS 보장 | NVIDIA vGPU features, Colfax Research | 격리의 핵심 근거 |
| MIG 인스턴스는 전용 NVDEC/NVJPG 엔진을 받음(예: H100은 7 NVDEC+7 NVJPG, 슬라이스당 하나) | NVIDIA MIG concepts, H100 docs | DMA/NVDEC도 분할 |
| Time-slicing(시분할) = 시간으로 GPU 교대 — 유연하나 격리 없음(공격적 워크로드가 이웃 성능 침해) | NVIDIA vGPU features, InfraCloud, Colfax | 공간 분할 대비 |
| MIG-backed time-sliced vGPU = 공간(MIG)+시간(time-slice) 하이브리드 | NVIDIA AI Enterprise MIG-backed vGPU | 하이브리드 |

## 슬라이스 수 (≥2 출처 교차확인) — 핵심 수치

- **A100 최대 7개 인스턴스**: NVIDIA MIG 제품 페이지 + DGX A100 User Guide + Ampere 백서 모두 일치. 확정.
- H100/H200/B200/GB200도 동일하게 "compute 7 + memory 8" 모델(7g가 풀 GPU). H100은 2세대 MIG로
  슬라이스당 compute ~3배·대역폭 ~2배 향상이라고 NVIDIA가 주장(상대 수치 — 마케팅 hedge).

## 주의 (낮은 신뢰도/주의)

- "vGPU가 항상 SR-IOV를 쓴다"는 단정은 위험. **세대·하이퍼바이저·드라이버에 따라** mediated passthrough
  (구형, VFIO mdev 기반)인지 SR-IOV 기반인지 다르다. 본문은 "최근 데이터센터 GPU에서 SR-IOV를 사용"
  정도로 hedge.
- 정확한 인스턴스별 NVDEC/NVJPG 개수·프로파일은 **SKU·드라이버 버전**에 따라 다르다. 본문은 A100을
  대표로 들고 "GPU마다 다름"을 명시. 정밀 매트릭스는 NVIDIA MIG User Guide 참조 안내.

## 주요 URL

- NVIDIA, Multi-Instance GPU (제품): https://www.nvidia.com/en-us/technologies/multi-instance-gpu/
- NVIDIA, MIG User Guide / Concepts / Supported Profiles: https://docs.nvidia.com/datacenter/tesla/mig-user-guide/concepts.html · https://docs.nvidia.com/datacenter/tesla/mig-user-guide/supported-mig-profiles.html
- NVIDIA, DGX A100 User Guide (MIG): https://docs.nvidia.com/dgx/dgxa100-user-guide/using-mig.html
- NVIDIA Technical Blog, Getting the Most Out of A100 with MIG: https://developer.nvidia.com/blog/getting-the-most-out-of-the-a100-gpu-with-multi-instance-gpu/
- NVIDIA, Ampere Architecture 백서: https://images.nvidia.com/aem-dam/en-zz/Solutions/data-center/nvidia-ampere-architecture-whitepaper.pdf
- NVIDIA, Virtual Functions / SR-IOV (DOCA): https://docs.nvidia.com/doca/sdk/sr-iov/index.html · https://docs.nvidia.com/doca/archive/doca-v2.2.0/virtual-functions/index.html
- NVIDIA vGPU features (time-slice vs MIG QoS): https://docs.nvidia.com/vgpu/knowledge-base/latest/vgpu-features.html
- NVIDIA AI Enterprise, MIG-backed vGPU: https://docs.nvidia.com/ai-enterprise/release-8/latest/infra-software/vgpu/features/mig-backed-vgpu.html
- CloudRift, GPU Virtualization (VFIO/vGPU/SR-IOV): https://www.cloudrift.ai/blog/gpu-virtualization-qemu-kvm-nvidia-amd
- Colfax Research, Time-Sliced and MIG-Backed vGPUs: https://research.colfax-intl.com/sharing-nvidia-gpus-at-the-system-level-time-sliced-and-mig-backed-vgpus/
- InfraCloud, vGPU/MIG/Time-Slicing 가이드: https://medium.com/infracloud-technologies/guide-to-gpu-sharing-techniques-vgpu-mig-and-time-slicing-c6d273d1ec3e

## 검수 메모

- 데모: `MigSlices.tsx`(한 GPU를 1g.5gb×7 / 3g.20gb×2 등으로 분할하는 공간 분할 도식),
  `TimeSliceVsMig.tsx`(시분할 타임라인 vs 공간 분할 — 격리 차이), `PfVfTree.tsx`(PF→VF 트리).
- A100 대표값(7 compute / 8 memory)으로 그렸고, "GPU마다 다름"은 figcaption/본문에 명시.
