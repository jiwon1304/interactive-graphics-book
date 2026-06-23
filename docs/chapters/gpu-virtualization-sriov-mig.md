# 핸드오프 노트 — `gpu-virtualization-sriov-mig` (GPU 가상화 — SR-IOV와 MIG)

## 목적과 범위
한 GPU를 여러 VM/사용자에게 **격리해 나눠 주는** 두 축을 가르친다: PCIe **SR-IOV**(PF/VF로 버스
가상화)와 NVIDIA **MIG**(GPU 내부 공간 분할). 그리고 **time-slicing(시간 분할) vs MIG(공간 분할)** 의
격리·QoS 차이. 클라우드/데이터센터 맥락(가동률·성능/보안 격리). gpu-scheduling-preemption(시분할
공유)에서 한 발 나아간 VM 경계 격리.

**멈춘 곳:** 하이퍼바이저 구현(VFIO/mdev 세부), GPUDirect/네트워크 가상화, MPS(Multi-Process
Service), 컨테이너(K8s GPU operator)는 포인터만.

## 그림 목록 (전부 STATIC 2D 캔버스 · MutationObserver 테마 redraw · CSS 변수 색)
1. **PfVfTree.tsx** — SR-IOV 트리: GPU(PF)→VF0/1/2→VM A/B/C. PF=전체 기능·관리, VF=경량 PCIe 기능.
2. **MigSlices.tsx** — A100(compute 7 / memory 8 슬라이스)을 세 구성으로 분할 비교(7×1g.5gb /
   3g+3g+1g / 1×7g.40gb). 슬라이스 폭에 비례한 박스.
3. **TimeSliceVsMig.tsx** — 위: time-slice 타임라인(전체 GPU를 A/B/C 교대), 아래: MIG(각자 자기
   레인 전 시간 점유). 격리 차이를 시각화(과정형 — 시간 vs 공간 분할).

## 기술 노트 / 정확도
- **A100 최대 7 인스턴스** = NVIDIA 제품 페이지 + DGX User Guide + Ampere 백서 교차확인(확정).
- compute 7 / memory 8 비대칭 강조. 프로파일 1g.5gb/2g.10gb/3g.20gb/7g.40gb는 Supported MIG
  Profiles 확정.
- "vGPU=항상 SR-IOV"는 단정 회피 — 세대·하이퍼바이저에 따라 mediated passthrough도. 본문 hedge.
- 인스턴스별 NVDEC/NVJPG 개수는 SKU(A100/H100)마다 다름 — "GPU마다 다름" 명시.
- 격리 근거: crossbar/L2 뱅크/메모리 컨트롤러/DRAM 버스까지 HW 분리(NVIDIA vGPU features, Colfax).

## 확장 방법 / 관련 토픽
- gpu-scheduling-preemption(시분할), cpu-gpu-transfer(PCIe), gpu-memory-hierarchy(L2/메모리 경로).
- chapters.ts RELATED 후보: `gpu-virtualization-sriov-mig: ['gpu-scheduling-preemption', 'cpu-gpu-transfer']`.
