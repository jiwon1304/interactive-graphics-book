# 핸드오프 — Windows 그래픽스 스택 (WDDM: runtime·UMD·KMD)

> slug `wddm-graphics-stack` · section `그래픽스 드라이버`. "그래픽스 드라이버" 5부작 2편.
> 1편 = `directx-driver-internals`(DX9/11/12 책임 분담), 3편(예정) = "드로우 콜의 일생"(시간선).

## 목적과 범위
WDDM 스택을 한 겹씩 분해한다(=정적 구조 설명). 다루는 것:
- 5겹 레이어: 애플리케이션 → D3D runtime → UMD →[user/kernel]→ Dxgkrnl(VidMm/VidSch) → KMD → GPU.
- DDI가 무엇이며 호출이 어떻게 내려가나(`pfn*` / `pfn*Cb` / `D3DKMT*` / `DxgkDdi*`).
- 메모리: VRAM vs system memory, residency, paging(thrash), per-device residency list.
- 주소 세대 차이: **WDDM 1.x**(segment 물리주소 + allocation/patch location list) vs
  **WDDM 2.0**(per-process GPUVA, patch 없음). 제출 API도 `D3DKMTRender` vs `D3DKMTSubmitCommand`.
- Vulkan 나란히: loader(`vulkan-1.dll`)+ICD(=UMD 상당)가 같은 Dxgkrnl 위. 메모리는 앱이 직접
  (`VkDeviceMemory`).

**어디서 멈췄나**: 한 Draw의 *시간선*(언제 무엇이 일어나는가)은 다루지 않음 → 3편으로 포인터.
HAGS(WDDM 2.7 GPU hardware scheduling)는 "더 나아가기"에서 한 줄 언급만.

이 챕터는 **전부 정적 도식**(AUTHORING §1.5: 드라이버/시스템 주제는 정적이 적합)이되, residency만
"과정이 진짜로 드러나는" 지점이라 **인터랙티브 1개**(ResidencyPaging)를 뒀다.

## 위젯 목록 (폴더 `src/components/demos/wddm-graphics-stack/`)
헬퍼: `wgs2d.ts`(= directx의 `dxd2d.ts` 복사 + **wrapText/wrapCentered 추가**, COLORS는 이 챕터용
으로 vram/sysmem/era1/era2 추가), `useCanvas2d.ts`(directx 것과 동일, import만 wgs2d로).

1. **WddmStack.tsx** (정적) — 5겹 스택, 각 레이어 역할 1줄 + user/kernel 점선 + VidMm/VidSch
   서브칩. 역할 텍스트는 wrapText로 줄바꿈. 모바일(<460)에서 서브칩 세로배치. **과정 아님(구조).**
2. **DdiCallFlow.tsx** (정적) — `CreateResource` 한 번이 runtime→UMD→Dxgkrnl/VidMm→KMD로 내려가는
   한 예. who/call(굵게)/note 3줄 카드 세로 스택. **과정(호출이 내려가는 경로).**
3. **ResidencyPaging.tsx** (★인터랙티브) — allocation을 VRAM/sys 두 컬럼에 배치. 컨트롤: 각
   allocation "참조" 토글(6개) + VRAM 예산 슬라이더(1~6) + "프레임 제출" 버튼. 제출 시 VidMm 패스가
   참조된 것을 예산까지 VRAM에 page-in(주황 화살표), 비참조 VRAM 것은 evict(회색 화살표). 참조>예산
   이면 thrash 경고(분홍). **과정(VidMm이 제출 전 residency를 보장하는 절차).** state는 useState,
   드래그 없음(컨트롤만)이라 usePointerDrag 불필요. 버튼 스타일 `.wgs-btn`(mc-btn 패턴 복제).
4. **GpuVaEras.tsx** (정적) — WDDM 1.x vs 2.0 2단 비교(데스크톱 좌우, <560 상하). command buffer
   칩(주소 표현) → patch 유무 → bullet 4개 → 제출 API. **과정/대조(주소 해석 방식 차이).**
5. **IcdVsUmd.tsx** (정적) — D3D(runtime+UMD) vs Vulkan(loader+ICD) 두 컬럼이 user/kernel 점선
   아래 **공유 커널**(Dxgkrnl/VidMm/VidSch→KMD→GPU)로 합류. **구조(같은 커널, 다른 user 상단).**

## 기술 노트 / 근사·단순화
- DDI 호출 시퀀스(§2)는 대표 흐름으로 단순화. 실제 `pfnAllocateCb`/`D3DKMTCreateAllocation`/
  `DxgkDdiCreateAllocation` 정확 시그니처는 d3dkmthk.h/d3dkmddi.h 참조. 이름 자체는 출처로 검증됨.
- ResidencyPaging의 VidMm 패스는 "참조된 것 우선 채움" 단순 정책. 실제 VidMm은 우선순위·LRU·budget
  feedback 등 복잡. 도식 목적상 thrash 발생 조건(참조>예산)만 정확히 보이게 함.
- 주소값 `0x7F2A_0000`·allocation 이름·슬롯 수는 도식용 예시(챕터 말미 주의문에 명시).

## 세대 구분 주의 (★ 반복된 함정)
1편 초안이 "VidMm이 GPU VA를 patch"로 1.x↔2.0을 혼동했었음. **patch는 1.x(물리주소)만**, GPUVA(2.0)
에는 patch 없음. 본 챕터 §4 + 인용 박스 + `docs/sources/wddm-graphics-stack-sources.md` C절에
verbatim으로 못 박음. 수정 시 이 구분 깨지 않게.

## 출처
`docs/sources/wddm-graphics-stack-sources.md` — Microsoft Learn(WDDM Architecture / Video Memory
Management / GPU Virtual Memory in WDDM 2.0 / Driver residency / D3DKMTSubmitCommand·D3DKMTRender),
Khronos Vulkan-Loader(LoaderInterfaceArchitecture), Vulkan 사양(memory/vkAllocateMemory). learn은
WebFetch 403이라 공식 GitHub 미러(MicrosoftDocs/windows-driver-docs)에서 verbatim 확보.

## chapters.ts 등록 (오케스트레이터가 중앙에서)
```ts
{
  slug: 'wddm-graphics-stack',
  title: 'Windows 그래픽스 스택 — WDDM: runtime·UMD·KMD',
  description: 'WDDM 5겹 스택·DDI 호출 흐름·VRAM↔system residency/paging·WDDM 1.x patch vs 2.0 GPUVA·Vulkan loader+ICD',
  section: '그래픽스 드라이버',
}
```
5부작이므로 `directx-driver-internals`를 section `GPU 명령 제출`에서 `그래픽스 드라이버`로 옮기고
1편으로 둘지(시리즈 순서: 1편 directx-driver-internals → 2편 wddm-graphics-stack → 3~5편)는
오케스트레이터 판단. 최소한 이 2편은 새 section `그래픽스 드라이버`로 등록.

## TODO / 검증
- **브라우저 시각 검증 펜딩**(Chrome for Claude 클린 프로필): 라이트/다크 + 모바일(~360px)에서 각
  위젯 글자 겹침·잘림 확인. 특히 WddmStack(서브칩 세로배치), GpuVaEras(상하 2단 전환), IcdVsUmd
  (합류 화살표·공유 커널 2줄), DdiCallFlow(긴 note wrap).
- `npm run check`(TS strict) + `npm run build`는 중앙에서.
- 캔버스 y-down 주의: 모든 화살표는 위→아래(y 증가)로 그림. ResidencyPaging의 page-in 화살표는
  sys(우)→vram(좌) 수평이므로 부호 무관.
