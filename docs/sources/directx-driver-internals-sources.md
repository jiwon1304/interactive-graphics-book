# (출처 노트) DirectX 드라이버 내부 — DX9·DX11·DX12 Under the Hood

> `directx-driver-internals` 챕터의 1차 출처. 집필·검수 에이전트는 이 내용을 기준으로 작성·검증한다.
> 모든 핵심 주장은 아래 공식 문서(Microsoft Learn / DirectX-Specs) 또는 분석 자료로 뒷받침된다.
> 조사일: 2026-06. (WebFetch가 learn.microsoft.com을 403으로 막는 경우가 있어 일부는 검색 스니펫으로 교차확인.)

## 1차 출처 (공식)

- **WDDM Architecture** — Microsoft Learn
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/windows-vista-and-later-display-driver-model-architecture
- **Video Memory Management and GPU Scheduling** (VidMm/VidSch)
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/video-memory-management-and-gpu-scheduling
- **GPU Virtual Memory in WDDM 2.0**
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/gpu-virtual-memory-in-wddm-2-0
- **Driver residency in WDDM 2.0**
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/driver-residency-in-wddm-2-0
- **Introduction to Deferred Contexts** / **Supporting command lists**
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/introduction-to-deferred-contexts
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/supporting-command-lists
- **Vertex buffer renaming** (Map DISCARD)
  https://learn.microsoft.com/en-us/windows-hardware/drivers/display/vertex-buffer-renaming
- **Introduction to Buffers in Direct3D 11** / **D3D11_MAP enumeration**
  https://learn.microsoft.com/en-us/windows/win32/direct3d11/overviews-direct3d-11-resources-buffers-intro
- **DirectX-Specs**: ResourceBinding(root signature/descriptor heaps), D3D12 Performance/Runtime Bypass
  https://microsoft.github.io/DirectX-Specs/d3d/ResourceBinding.html
- **Direct3D 11 on 12 Updates** (DriverCommandLists 플래그 의미) — DirectX Developer Blog
  https://devblogs.microsoft.com/directx/direct3d-11-on-12-updates/

## 분석/전문가 자료 (보조)

- Riccardo Loggini — *The D3D12 Pipeline State Object* / *The D3D12 Root Signature Object*
  https://logins.github.io/graphics/2020/04/12/DX12PipelineStateObject.html
- *Unleash the power of Direct3D 12* — A Graphics Guy's Note
  https://agraphicsguynotes.com/posts/unleash_the_power_of_direct3d_12/
- Diligent Graphics — *D3D12 Performance*
  https://diligentgraphics.com/diligent-engine/architecture/d3d12/d3d12-performance/
- DirectXTK12 Wiki — *PSOs, Shaders, and Signatures*
  https://github.com/microsoft/DirectXTK12/wiki/PSOs,-Shaders,-and-Signatures

## 검증된 핵심 사실 (챕터 주장 ↔ 출처)

1. **WDDM 레이어**: Dxgkrnl이 OS·UMD·KMD(display miniport driver) 사이를 중재. 하위 구성요소로
   display port driver, **VidMm**(memory manager), **VidSch**(scheduler). DDI 예: UMD `CreateResource`
   → runtime `pfnAllocateCb` → Dxgkrnl → KMD `DxgkDdiCreateAllocation`. (WDDM Architecture)

2. **주소 처리 — 세대 차이(중요, 초안 오류 수정함)**:
   - WDDM 1.x: GPU가 **segment 물리주소** 참조. segment 공유·과할당으로 리소스 재배치 시 주소가
     바뀌어, command buffer마다 **allocation list + patch location list**를 만들어 제출 전 patch.
   - **WDDM 2.0(Win10)**: 프로세스별 **GPU virtual address(GPUVA)** 공간. "UMD uses virtual
     addresses and no longer relies on dynamic patching"; "GPU virtual address support in WDDM v2
     removes the need for patching. The UMD doesn't generate allocation or patch location lists,
     although it's still responsible for managing the residency of allocations." residency는 per-device
     list로 이동, VidMm이 스케줄 전 보장. (GPU Virtual Memory in WDDM 2.0 / Driver residency)
   - ⚠️ 초안은 "VidMM이 GPU VA를 패치"라고 두 시대를 혼동 → **수정 완료**(patch는 pre-2.0).

3. **DX11 deferred context**: immediate context만 드라이버에 직접 제출 가능; deferred context는
   command list를 만들어 둠. 드라이버가 `D3D11DDICAPS_COMMANDLISTS_BUILD_2`(DDI의
   `D3D11DDI_THREADING_CAPS`)로 네이티브 지원을 알리지 않으면 runtime이 **에뮬레이트**. 앱은
   `D3D11_FEATURE_DATA_THREADING.DriverCommandLists`로 확인. (Introduction to Deferred Contexts /
   Supporting command lists / D3D11on12 blog)

4. **Map(WRITE_DISCARD) renaming**: DYNAMIC 버퍼를 DISCARD로 Map하면 드라이버가 **renaming**
   (double/multi-buffering)으로 GPU 대기 없이 새 메모리 반환. 프레임당 수백~수천 rename 가능.
   D3D11.1(Win8+)부터 constant buffer에도 `WRITE_NO_OVERWRITE` 허용. (Vertex buffer renaming /
   D3D11 buffers 문서)

5. **DX12가 CPU 오버헤드를 줄이는 법**: PSO가 거의 모든 상태+셰이더를 묶어 생성 시 컴파일(드라이버
   가 draw마다 state group을 합치던 일 제거); descriptor heap+root signature로 per-draw 디스크립터
   패치 제거(Root Signature 1.1은 static 선언으로 드라이버 최적화 허용); hazard/전이는 앱이
   `ResourceBarrier`로 명시(드라이버 자동 추적 제거); CPU-GPU 동기화가 앱 책임. (DirectX-Specs
   ResourceBinding / Loggini / agraphicsguynotes)

6. **동기(motivation)**: AMD **Mantle**이 먼저 command list/buffer로 인한 CPU 오버헤드를 크게 줄였고
   이것이 D3D12를 추동. D3D12는 "CPU 오버헤드 감소"가 1순위 목표. (3DMark API Overhead / DirectX-Specs
   performance) — ⚠️ **draw당 ns 절대수치는 출처로 확정되지 않음**. 챕터의 DrawCallCost 숫자는
   "도식용 대표 차수"로 명시(특정 드라이버 측정 아님).

7. **셰이더 IR**: HLSL→DXBC(`fxc`, DX9~11) / DXIL(`dxc`, DX12). UMD JIT가 ISA로 변환(DX11 셰이더
   생성/첫 사용, DX12 PSO 생성). (DirectXTK12 wiki / 일반)

## 미해결 / 주의
- learn.microsoft.com이 WebFetch 403 → 본문 직접 인용은 검색 스니펫 기반. 후속 검수자는 가능하면
  원문 페이지를 직접 확인.
- DrawCallCost의 ns 수치는 예시값. 실제 프로파일 인용으로 교체할 수 있으면 더 좋음.
- WDDM 2.7 GPU hardware scheduling(HAGS)은 "더 나아가기" 포인터로만 언급 — 깊게 다루려면 별도 조사.
