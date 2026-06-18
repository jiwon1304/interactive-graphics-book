# GPU 하드웨어 · 저수준 토픽 카탈로그 (집필 백로그)

GPU 하드웨어 / 모던 파이프라인 / 드라이버 / 저수준 컴퓨트·그래픽스 API(CUDA·DX12·Vulkan·Metal),
그리고 Unreal Engine RHI까지. 그래픽스 렌더링 알고리즘([topic-catalog.md](./topic-catalog.md))과는 별개 영역.

이 분야의 인터랙티브는 대부분 **결과가 아니라 과정/메커니즘 시뮬레이터**(큐 타임라인, 워프 스케줄러
스텝, 메모리 병합 시각화, 의존성 그래프 빌더 등)다 — [AUTHORING-GUIDE.md](./AUTHORING-GUIDE.md)의 "과정 > 결과" 원칙에 잘 맞음.
병렬 리서치(2026-06)로 수집·중복 제거. 표기: `[난이도] 한글명 (English) — 데모 힌트`.

---

## A. GPU 하드웨어 아키텍처 (칩의 구성 요소)

1. `[입문]` SM/CU/Xe-core 해부도 (Anatomy of an SM/CU/Xe-core) — 벤더 토글 시 블록(ALU·스케줄러·레지스터·L1) 라벨/개수가 변형되는 줌 가능 다이어그램
2. `[입문]` SIMD 레인과 ALU: "CUDA 코어"의 정체 (SIMD lanes & ALUs) — FMA가 레인 파이프라인을 흐르고, lanes×SIMD×SM이 카드의 코어 수를 재현하는 빌더
3. `[중급]` 워프 스케줄러와 듀얼 디스패치 (Warp scheduler & dual issue) — 4개 스케줄러가 매 사이클 ready warp을 골라 ALU/SFU/LSU 포트를 채우는 타임라인
4. `[중급]` 레지스터 파일 (On-chip register file) — 거대한 RF가 스레드들에 분할되는 모습; 스레드당 레지스터가 상주 warp 수를 정하는 시각화
5. `[심화]` 텐서 코어: 행렬곱 가속 하드웨어 (Tensor cores) — 16×16 시스톨릭 배열이 피연산자를 흘려 MMA 누적; 정밀도(FP16→FP8→FP4) 토글로 처리량 대비
6. `[심화]` RT 코어: BVH 순회·교차 하드웨어 (RT cores) — 2D 광선에 BVH 스택 push/pop을 스텝 진행, 컬링된 서브트리 vs 테스트된 삼각형 강조
7. `[중급]` 래스터라이저 하드웨어 파이프라인 (Rasterizer HW) — 삼각형 정점 드래그 시 edge function 부호로 픽셀 채우기 + 2×2 quad·early-Z
8. `[중급]` ROP & TMU: 출력·텍스처 고정함수 유닛 (ROPs & TMUs) — TMU 바이리니어/밉 가중치 패널 + ROP 블렌딩·깊이테스트 패널
9. `[중급]` GPC/TPC/셰이더 엔진: 칩 계층 구조 (GPU hierarchy) — GPU→GPC→TPC→SM 트리를 펼치는 플로어플랜; 클러스터 비활성화로 "binned" SKU 재현
10. `[중급]` 클럭·전력·열: DVFS 부스트 (Clock/power/thermal) — 부하·팬·주변온도 슬라이더로 온도·전력예산·클럭이 TDP/스로틀에 맞춰 오르내리는 피드백 루프
11. `[최신]` 칩렛 & MCM 패키징 (Chiplets & MCM) — 칩렛으로 패키지 조립; 결함 산포 웨이퍼에서 작은 다이가 수율을 올리는 모델
12. `[중급]` 공정 노드 & 다이·수율 (Process node & die yield) — 다이 크기·결함 밀도(푸아송)로 good/bad 다이와 dies-per-wafer·수율% 갱신
13. `[최신]` 벤더 아키텍처 비교: Ada/Blackwell·RDNA3/4·Xe2·Apple — 두 아키텍처를 골라 매칭 행(lane 폭·스케줄러·매트릭스·RT·노드)이 정렬되며 diff 강조
14. `[최신]` 유니파이드 메모리 vs 디스크리트 VRAM (Unified vs discrete) — discrete(CPU→PCIe 복사→VRAM) vs unified(zero-copy) 데이터 흐름판을 같은 워크로드로 경주

## B. 실행 모델 & 스케줄링 (온칩에서 일이 어떻게 실행/스케줄되나)

15. `[입문]` SIMT vs SIMD 실행 모델 — 같은 명령 스트림을 SIMD(분기 불가) vs SIMT(레인별 마스크)로 흘려 분기에서의 차이를 재생
16. `[입문]` 스레드/블록/그리드 vs 워크그룹 인덱싱 — grid/block 차원 슬라이더로 타일 분할, 셀 클릭 시 `blockIdx·threadIdx`→global id 계산식 펼침
17. `[입문]` 워프/웨이브프런트 락스텝 실행 — 32 lane 격자에 한 명령이 동시 적용; lane 폭 32↔64 토글로 블록당 warp 수 변화
18. `[중급]` 워프 다이버전스 & 재수렴 — if/else를 한 warp이 통과: then일 때 else lane 마스킹, IPDOM에서 재수렴; lane 조건 토글로 직렬화 비용%
19. `[중급]` 프레디케이션 vs 분기 — 같은 코드를 분기+마스킹 vs predicated로 스텝 비교; 분기 길이 슬라이더로 손익분기점
20. `[심화]` 독립 스레드 스케줄링 (ITS, Volta+) — pre-Volta 스택 재수렴 vs Volta lane별 PC 인터리빙; 옛 spin-lock 가정이 깨지는 대비
21. `[중급]` 점유율 & 지연 은닉 (Occupancy & latency hiding) — 상주 warp 수 슬라이더; load stall 시 스케줄러가 eligible warp로 전환, 적으면 SM이 idle 거품
22. `[중급]` 점유율 한계 요인: 레지스터·공유메모리 — 레지스터/스레드·SMEM/블록·블록크기로 SM 자원 막대가 차며 어느 자원이 먼저 바닥나는지
23. `[심화]` 워프 스케줄러: 발행 & 스코어보딩 — 4개 스케줄러 파티션, 사이클별 warp 상태(eligible/stalled-SB/selected) 색 갱신
24. `[중급]` 배리어 & 메모리 펜스 (`__syncthreads`) — warp들이 배리어 선에서 멈춰 기다렸다 함께 풀림; 분기 안 배리어의 데드락 케이스 토글
25. `[심화]` 협력 그룹 & 그리드 전역 동기화 — 묶음 입자도(warp→block→grid) 선택, `grid.sync()` 단일 커널 vs 커널 재시작 비교
26. `[심화]` 동적 병렬성 (Dynamic parallelism, CDP2) — 부모 커널이 quadtree 세분화로 자식 그리드를 재귀 launch하는 트리 애니메이션
27. `[중급]` 그리드-스트라이드 루프 & 테일 이펙트 — 블록을 SM에 wave 단위 배치; 마지막 불완전 wave의 tail 손실, grid-stride로 감소
28. `[심화]` 웨이브/서브그룹 intrinsics (shuffle·ballot·scan) — 32 lane에서 ballot 마스크·shuffle 화살표·prefix-sum 트리 단계 애니메이션
29. `[최신]` 스레드 블록 클러스터 & 분산 공유메모리 (Hopper/Blackwell) — GPC 내 클러스터 블록들이 DSMEM으로 데이터 교환; 같은 GPC 동시 상주 제약

## C. 메모리 계층 & 메모리 모델 (데이터가 어디 살고 어떻게 움직이나)

30. `[입문]` GPU 메모리 계층 한눈에 (register→shared→L1→L2→VRAM) — 피라미드 클릭 시 데이터 패킷 이동, 누적 지연·대역폭 막대
31. `[중급]` 메모리 결합 (Coalescing) — 32 스레드 접근 패턴(연속/stride/랜덤)에 따라 필요한 32B 세그먼트와 트랜잭션 수·버스효율% 갱신
32. `[중급]` 공유 메모리 뱅크 충돌 (Bank conflicts) — 행/열/대각 접근에 32뱅크 매핑, 충돌 그룹 직렬화 사이클; 패딩 토글로 해소
33. `[중급]` L1/L2 캐시·캐시라인·섹터 — 접근 스트림에 set-associative 캐시가 채워지고 hit(초록)/miss/LRU eviction + 섹터 활용률
34. `[심화]` VRAM 기술: GDDR6X/7 vs HBM3/3e — 버스폭×핀속도×시그널링(NRZ/PAM3/PAM4)으로 총 GB/s; 카드 프리셋 비교
35. `[심화]` 메모리 컨트롤러 & 채널 인터리빙 — 주소→채널 매핑 비트 토글로 접근이 N채널에 분산/집중, 파티션 캠핑
36. `[심화]` 텍스처 캐시 & 스위즐링 (Morton order) — row-major vs Z-order 토글, 바이리니어 풋프린트의 캐시 적중 대비
37. `[심화]` 원자적 연산 & 메모리 스코프 (Atomics & scopes) — 여러 warp의 atomicAdd 경쟁이 스코프(공유/L2)에 따라 직렬화되는 위치·throughput
38. `[최신]` GPU 메모리 일관성 모델 (Weak consistency) — store/load 타임라인 + acquire/release·fence 토글로 허용 재배열 litmus 결과 열거
39. `[심화]` 통합/관리 메모리 & UVM 페이지 폴팅 — 커널이 페이지 접근 시 fault→warp stall→PCIe 마이그레이션; oversubscription thrashing
40. `[최신]` PCIe vs NVLink vs IF vs UALink (인터커넥트) — 2~72 GPU 토폴로지에 링크 종류 변경, all-reduce 트래픽·이등분 대역폭 계산
41. `[중급]` Resizable BAR / Smart Access Memory — BAR 창 256MB↔전체 VRAM 토글로 전송 횟수·오버헤드 대비
42. `[최신]` 레지던시·페이징 / 오버서브스크립션 — 고정 VRAM에 워킹셋을 키워 LRU evict/fetch; prefetch/advise가 폴트율에 주는 효과

## D. GPU 컴퓨트 / CUDA & GPGPU (커널 작성과 병렬 패턴)

43. `[입문]` CUDA 프로그래밍 모델 & 커널 (kernel, thread/block/grid) — 2D 데이터에 `idx=blockIdx*blockDim+threadIdx`가 셀별로 라이브 계산, OOB 가드
44. `[중급]` 병렬 리덕션 (Parallel reduction) — 리덕션 트리가 매 스텝 stride 절반; divergent vs sequential-addressing 토글로 idle lane 변화
45. `[중급]` 접두사 합 / 스캔 (Blelloch scan) — up-sweep→down-sweep 단계별 결합 인덱스; O(n) work vs naive 카운터
46. `[중급]` 공유 메모리 타일링 행렬곱 (Tiled GEMM) — 타일 load→`__syncthreads`→MMA 루프; 전역 vs 공유 접근이 타일 크기에 따라 감소
47. `[중급]` 스트림·이벤트 & 비동기 동시성 (Streams/events) — H2D/커널/D2H를 스트림에 배치, 이벤트 의존성으로 간트 오버랩/직렬화 + wall-time
48. `[심화]` CUDA 그래프 (CUDA Graphs) — 커널/복사 DAG를 캡처해 재생; 스트림 launch 간격(CPU gap) vs 그래프 launch 비교
49. `[심화]` 텐서 코어 프로그래밍 (WMMA/MMA, 혼합정밀도) — 16×16×16 WMMA fragment를 warp lane에 분산 load→FMA, FP16/BF16/FP8 토글(누적은 FP32)
50. `[심화]` PTX·SASS & NVCC/JIT — 작은 커널이 PTX→SASS(sm_80/90/100)로 낮춰지는 컴파일 스테퍼; 같은 PTX가 아키텍처별 SASS로
51. `[최신]` TMA: 비동기 대량 텐서 복사 (Hopper) — 한 스레드가 디스크립터로 2D 타일 bulk copy를 발행하고 나머지는 계속 연산
52. `[최신]` 워프 특화 & 비동기 파이프라인 (mbarrier) — producer(load) warp과 consumer(MMA) warp이 다단 버퍼를 async barrier로 넘기며 지연 은닉
53. `[최신]` 타일 기반 프로그래밍: cuTile & Triton — SIMT view vs tile view 대비; tile 모드에서 컴파일러가 타일 op을 warp/thread로 자동 lowering
54. `[심화]` 이종 이식성: HIP·SYCL·컴퓨트 셰이더 — "같은 커널, 네 방언"(CUDA/HIP/SYCL/compute) 인덱싱·launch를 공용 스레드 그리드에 매핑

## E. 모던 그래픽스 API & 명령 제출 (CPU가 GPU에 일을 먹이고 동기화하는 법)

55. `[입문]` 명령 큐 & 큐 패밀리 (graphics/compute/copy) — 작업 카드를 3개 큐 레인에 드래그, 큐별 실행 가능성·처리량 시뮬
56. `[입문]` 왜 명시적 API인가: 드라이버 오버헤드 — 암묵(드라이버 추적) vs 명시(앱이 N코어 분산) 모드로 CPU 프레임타임 막대 비교
57. `[중급]` 커맨드 리스트/버퍼 & 할당자 (기록/제출/실행) — record→submit→GPU 실행 3단 상태머신; 할당자 reset 오타이밍 시 in-flight 충돌 경고
58. `[중급]` 펜스: CPU↔GPU 동기화 & frames-in-flight — GPU가 펜스 카운터를 올리고 CPU가 N프레임 뒤 wait; in-flight 수의 스톨 vs 메모리 트레이드오프
59. `[심화]` 세마포어 & 타임라인 세마포어 — 큐 작업 노드를 의존성 선으로 잇고 타임라인 카운터가 값 도달 시 대기 노드가 풀림
60. `[심화]` 파이프라인 배리어 & 리소스 상태 전이 — 리소스 상태(RTV→SRV) 변경 시 올바른 배리어 자동/수동 삽입, 누락 시 위험 경고
61. `[중급]` 스왑체인 & 플립/프레젠트 모델 — 백버퍼 2~3개 링 + present 모드(FIFO/MAILBOX/IMMEDIATE)로 지연·티어링·드롭 애니메이션
62. `[중급]` PSO & 셰이더 오브젝트 — 렌더 상태 토글로 PSO "베이킹" 비용 막대 vs 셰이더 오브젝트 즉시 교체 비교
63. `[심화]` 디스크립터 힙/셋 & 루트 시그니처 — 리소스를 힙 슬롯에 드래그, 루트 시그니처가 셰이더 레지스터로 연결되는 와이어; 오매핑 시 엉뚱한 읽기
64. `[최신]` 바인드리스 리소스 (SM6.6 / descriptor indexing) — 전통 바인딩(드로우마다 bind) vs 바인드리스(인덱스만) — 드로우콜↑ 시 bind 호출 폭증 대비
65. `[최신]` 디스크립터 버퍼 (VK_EXT_descriptor_buffer) — "디스크립터는 결국 바이트" — 핸들을 버퍼 오프셋에 memcpy하고 셰이더가 읽는 흐름
66. `[심화]` 멀티큐 & 비동기 컴퓨트 오버랩 — 그래픽스+컴퓨트를 두 레인에, 세마포어 의존; 겹치는 만큼 프레임 단축, 과의존 시 오버랩 소멸
67. `[심화]` CPU 멀티스레드 명령 기록 — 워커 스레드 수↑ 시 드로우가 스레드별 리스트로 분배되어 기록 시간↓, 마지막 단일 큐 submit
68. `[심화]` ExecuteIndirect & 간접 명령 — 컴퓨트가 indirect arg 버퍼(count/offset)를 채우고 가변 개수 드로우 발행; CPU 드로우콜 0
69. `[최신]` 레지던시 & 메모리 힙 (DEVICE_LOCAL/UPLOAD) — 레지던시 셋으로 리소스를 VRAM에 상주시키면 다른 셋이 evict; 비상주 참조 시 페이지폴트 경고

## F. 드라이버 & 시스템 소프트웨어 스택 (앱과 실리콘 사이의 SW)

70. `[입문]` 드라이버의 두 얼굴: UMD vs KMD — 같은 `Draw()`를 전부-커널 vs UMD/KMD 분리로; 크래시 시 데스크톱 생존·링0 경계
71. `[중급]` 드로우 콜의 여정: 제출 경로 (app→runtime→UMD→KMD→GPU) — 패킷이 각 단계를 거치는 스텝스루(호버 시 단계 설명)
72. `[중급]` 셰이더 컴파일 파이프라인 (HLSL→DXIL / GLSL→SPIR-V → ISA) — 오프라인 프론트엔드 + 드라이버 JIT 2단계, 각 표현형 코드 스니펫 변화
73. `[중급]` PSO & 셰이더 캐시 스터터링 — 게임플레이 타임라인에 PSO 최초 컴파일 spike(프레임 드롭); 사전 예열 토글로 매끄럽게
74. `[중급]` OS GPU 스케줄러 & WDDM — 여러 앱의 커맨드 버퍼가 우선순위·퀀텀으로 단일 엔진 타임라인에 인터리빙
75. `[심화]` 하드웨어 가속 GPU 스케줄링 (HAGS) — SW 스케줄링 vs HAGS 토글로 CPU 스케줄 블록이 사라지고 GPU 도어벨 직접 제출, 지연↓
76. `[심화]` 링 버퍼·도어벨·유저모드 큐 — write pointer가 패킷 기록 후 도어벨 "딩", GPU read pointer 소비; 슬롯 부족 시 MQD↔HQD 맵
77. `[심화]` 선점 & TDR (Timeout Detection & Recovery) — 작업 막대가 길어지며 2s 카운트다운; 선점 성공 vs `ResetEngine` 발동(작업 길이 슬라이더)
78. `[심화]` DXGI 플립 모델 & Independent Flip — 스왑체인→DWM→스캔아웃; 창이 전체 덮으면 DWM이 잠들고 Independent Flip으로 지연↓
79. `[심화]` 멀티플레인 오버레이 & 하드웨어 합성 — 게임/영상/커서를 평면으로 분리, 스캔아웃 시 HW가 클립→스케일→블렌딩(평면 끄면 DWM 폴백)
80. `[심화]` GPU 가상화: SR-IOV·vGPU·패스스루 & IOMMU — 3가지 모드 토글, IOMMU가 VM별 DMA를 분리 페이지 테이블로 격리
81. `[심화]` 리눅스 GPU 스택: DRM·Mesa·NIR — Windows UMD/KMD를 Linux 등가물(Mesa→NIR→ioctl→DRM→링버퍼)로 매핑 대조
82. `[최신]` DirectX의 SPIR-V 채택 (SM7, 2024) — HLSL이 현재 DXIL/미래 SPIR-V로 컴파일, 양방향 변환 툴이 다리를 놓는 전환 로드맵
83. `[최신]` Rust GPU 펌웨어 드라이버 (Tyr / CSF) — KMD가 CSG/CS 슬롯 바인드→링버퍼 append→도어벨→CSF 펌웨어 구동 스텝스루

## G. 최신 GPU 파이프라인 기능 & 성능 분석

84. `[중급]` 메시 & 증폭 셰이더 (Mesh & amplification) — 정점을 meshlet으로 색칠, 증폭 셰이더가 절두체 컬링→살아남은 것만 메시 셰이더로 디스패치
85. `[최신]` GPU 워크 그래프 (D3D12 Work Graphs) — producer 노드가 레코드를 쏘면 consumer 인보케이션이 동적 생성·디스패치되는 토큰 흐름; fan-out 조절
86. `[중급]` GPU 주도 렌더링 & 간접 실행 — CPU-driven(객체마다 왕복) vs GPU-driven(컴퓨트가 indirect arg 채워 일괄)을 객체 수↑로 대비
87. `[최신]` 셰이더 실행 재정렬 (SER, DXR 1.2) — 워프 스레드가 무작위 셰이더 히트; 재정렬 전 발산 직렬 vs 후 같은 셰이더끼리 묶임
88. `[최신]` 불투명도 마이크로맵 (OMM) — 잎사귀 삼각형을 미세격자(불투명/투명/미정)로; OMM 없으면 any-hit 폭증, 있으면 즉시 결정
89. `[최신]` 협조 벡터 & 뉴럴 셰이더 (Cooperative vectors, SM6.9) — 픽셀당 작은 MLP를 레이어별 행렬곱(텐서코어 점등)으로; 스칼라 FMA 루프 대비
90. `[중급]` 하드웨어 가변 레이트 셰이딩 (VRS Tier 2) — 8×8 타일에 레이트를 칠하면(중앙 1×1, 주변 2×2/4×4) 픽셀셰이더 호출 수 감소
91. `[중급]` 샘플러 피드백 & 텍스처 스트리밍 — 카메라 이동 시 보이는 부분의 mip 타일만 피드백 맵에 점등→그 타일만 로드
92. `[최신]` DirectStorage & GPU 압축 해제 (GDeflate) — 구식(디스크→CPU 디코드→복사) vs DirectStorage(디스크→GPU 디코드) 병렬 패킷 대비
93. `[중급]` 모바일 타일 기반 지연 렌더링 (TBDR) — 삼각형을 타일 비닝 리스트에 분배, 타일 선택 시 온칩 HSR→셰이딩으로 대역폭 절약(IMR 토글)
94. `[중급]` 프레임 페이싱·프레젠트 & VRR — 불균등 프레임타임을 고정60/VSync/VRR/프레임생성별 스캔아웃 타임라인에 그려 테어링·스터터·지연 비교
95. `[중급]` 루프라인 모델 (Roofline) — log-log 차트에서 커널 점을 드래그(산술강도)하면 메모리/연산 천장 사이에서 bound가 바뀜
96. `[심화]` 워프 스톨 원인 & 점유율 분석 — SM warp 슬롯에 사이클별 발행 가능 점등 + 스톨 사유 칩(메모리/배리어/의존성), 레지스터·블록크기로 점유율
97. `[중급]` GPU 하드웨어 카운터 & 프로파일러 타임라인 — 프레임 GPU 타임라인(패스별 막대)에 배리어 버블 강조; 패스 클릭 시 카운터(대역폭·SM·L2) 패널

## H. Unreal Engine RHI & 저수준 렌더 스택

98. `[입문]` RHI란? 백엔드 추상화 (Render Hardware Interface) — 한 RHI 콜(`DrawIndexed` 등)이 D3D12 vs Vulkan vs Metal 의사코드로 펼쳐지는 백엔드 스왑 뷰어
99. `[중급]` 동적 RHI 모듈 선택 (GDynamicRHI) — OS·GPU·커맨드라인(`-vulkan`)·피처레벨로 어떤 DynamicRHI가 선택되는지 결정 트리
100. `[중급]` 3스레드 렌더링 (Game→Render→RHI Thread) — 3 레인에 프레임 N/N+1 블록이 흐르고 추월·스톨·RHIThreadFence 동기화 시각화
101. `[중급]` FRHICommandList: 기록/변환/제출 — 한 draw가 RHI 커맨드 enqueue→context.Execute→네이티브 API로, 각 단계 스레드 색 구분
102. `[심화]` 병렬 명령 변환 (UE5.4/5.5) — 워커 스레드 1→N으로 커맨드리스트 청크 분배, 총 변환 시간 단축 간트
103. `[중급]` 렌더 의존성 그래프 입문 (RDG) — 패스를 추가하고 입출력 리소스를 연결하면 의존성 엣지·위상정렬 실행순서 자동 생성
104. `[심화]` RDG 자동 배리어 & 상태 전이 (ERHIAccess) — 패스 체인의 리소스 상태 변화 지점을 RDG가 자동 표시, 수동 모드 시 누락 위험
105. `[심화]` 트랜션트 리소스 앨리어싱 — 수명이 안 겹치는 리소스 막대가 같은 메모리 슬롯에 자동 배치되어 VRAM 풋프린트↓
106. `[심화]` RDG 패스 컬링 & 의존성 레벨 — 최종 출력 연결을 끊으면 죽은 패스가 사라지고, 독립 패스가 같은 레벨 밴드(병렬 후보)로 묶임
107. `[심화]` 비동기 컴퓨트 스케줄링 (RDG) — async로 표시한 컴퓨트 패스가 그래픽스와 오버랩·펜싱되어 프레임 단축
108. `[최신]` PSO 프리캐싱 (UE5.2→5.6) — 로딩 시 PSO가 백그라운드 큐에 쌓이고, 객체 등장 시 해당 PSO가 큐 앞으로 부스트
109. `[최신]` 바인드리스 전환 (UE5.6, 3 백엔드) — 슬롯 바인딩(슬롯 부족) vs 디스크립터 힙+정수 인덱스 접근 토글 대비
110. `[심화]` GPUScene & GPU 구동 렌더링 — CPU 객체별 드로우콜 vs GPUScene 버퍼에서 GPU가 컬링·indirect 디스패치
111. `[최신]` Nanite·Lumen이 모던 RHI를 쓰는 법 (워크 그래프) — 머티리얼 분기 디스패치를 워크 그래프 노드 트리로; on/off로 GPU측 분기 묶임
112. `[심화]` RHI 검증 레이어 & 상태 섀도잉 — 리소스를 잘못된 상태로 읽으면(RTV인데 SRV 샘플) 검증 레이어가 경고·올바른 전이 제안
113. `[최신]` GPU 프로파일러 2.0 & 통합 타임스탬프 (UE5.6) — 그래픽스/async 컴퓨트 큐 두 트랙 + 의존성 화살표·GPU 버블 강조

---

**총 113개** (목표 ~100 대비 여유). 난이도 분포: 입문 ~14 · 중급 ~44 · 심화 ~38 · 최신 ~33 (심화+최신이 ~70).

> 데모 가능성 참고: 이 분야는 거의 전부 **2D 캔버스/SVG 시뮬레이터·타임라인·다이어그램**으로 구현 가능(=모바일에 가볍고
> 안정적). three.js/3D가 꼭 필요한 토픽은 드물다. HiDPI·터치 규약은 [AUTHORING-GUIDE.md](./AUTHORING-GUIDE.md) §5 참고.
