# 핸드오프 — gpu-cpu-conversation ("CPU와 GPU의 대화 — 명령 버퍼와 비동기")

**slug:** `gpu-cpu-conversation` · **section:** `그래픽스 드라이버` · **상태:** 초안 완료(시각 검증 대기)

"그래픽스 드라이버" 5부작 중 **1편**. 독자는 렌더링(셰이더·드로우 콜·렌더 타깃)은 알지만
드라이버/하드웨어/OS는 처음인 그래픽스 엔지니어. 톤: 차근차근·길게, **비유 금지**(직유/은유로 설명
대체 X, 구체적 사실은 OK), 용어는 영어/발음 그대로(command buffer/queue/fence/user-mode/kernel-mode).

## 목적과 범위
GPU는 별도 프로세서(자기 VRAM, CPU와 비동기) → 직접 명령 X, **command buffer에 record → GPU가 나중에
consume**(producer/consumer, ring buffer) → CPU가 앞서고 GPU가 뒤따름(**frames in flight**) → 그래서
**fence** 동기화 → 그리고 왜 드라이버가 **user-mode(UMD) / kernel-mode(KMD)** 로 나뉘는가(다음 편 WDDM
전조). API 중립으로 설명하되 명명만 D3D/Vulkan 병기. **여기서 멈춤:** WDDM 각 레이어 상세, residency,
GPU 가상주소, 드로우 콜 일생, PSO/상태, API 세대 비교는 다음 편들로 포인터만.

## 위젯 (폴더 `src/components/demos/gpu-cpu-conversation/`)
정적 위주 + 1개 인터랙티브(드라이버/시스템 토픽 = 정적이 기본, AUTHORING §1.5/핸드오프 §4-2).

1. **DrawToBytes.tsx** (정적) — §1. Draw() 한 줄들이 command buffer의 opcode+payload로 record되는 모습.
   왼쪽 API 호출 / 오른쪽 기록된 바이트, D3D12/Vulkan 명칭은 캡션에. **개념(데이터 변환)** 전달.
2. **CommandBufferRing.tsx** (정적) — §2. producer/consumer ring. write(CPU)·read(GPU) 포인터,
   pending 슬롯(파랑) = GPU lag. starve/back-pressure를 캡션으로. **메커니즘(과정)** 전달.
3. **AsyncTimeline.tsx** (★인터랙티브) — §3. 슬라이더 frames-in-flight(1~3). CPU/GPU 두 레인 타임라인.
   F=1이면 CPU에 `wait`(idle) 구간, F↑면 겹쳐서 idle 소멸. present 마커(▲). **과정(파이프라이닝)** 을
   직접 만져 보임 — 이 챕터에서 조작이 진짜로 메커니즘을 드러내는 유일한 곳이라 인터랙티브로 둠.
   - 모델: TC=1.0, TG=1.45 칸 고정. 프레임 i 기록 시작 = max(이전 기록 끝, gpuEnd[i-flight]).
     GPU 시작 = max(cpuEnd[i], 이전 gpuEnd). 도식용 대표값(절대시간 아님).
4. **UserKernelDriver.tsx** (정적) — §5. app/runtime/UMD(user) | 점선 경계(submit=syscall) |
   OS scheduler+KMD/GPU(kernel). "user에서 커널 진입 0회, 제출 때 한 번" 강조. WDDM 맛보기(캡션).

## 헬퍼
- **gcc2d.ts** — dxd2d.ts 복사·적응. **wrapText(ctx,text,x,y,maxW,lineH) 추가**(좁은 폭 라벨 줄바꿈).
  COLORS는 cpu/gpu/present/app/runtime/umd/kernel/cmd/fence/idle (`as const`).
- **useCanvas2d.ts** — directx-driver-internals 것과 동일(gcc2d에서 import).
- usePointerDrag는 불필요(드래그 위젯 없음). **정적 캔버스에 touch-action 설정 안 함**(전역 CSS 스크롤 허용).

## 기술 노트 / 단순화
- 수식: $T_1 = t_c + t_g$(기다림) vs $T_\infty = \max(t_c, t_g)$(파이프라인). KaTeX는 MDX 본문만, 캡션 금지.
- DrawToBytes의 opcode 이름/인코딩은 개념용 단순화(하드웨어·드라이버마다 다름) — 캡션에 명시.
- ring "write/read gap = GPU lag"는 fgiesen 인용 기반 표준 합성(verbatim 아님) — sources.md에 플래그.
- syscall 비용(수십~수백 ns), frames-in-flight(2~3), TC/TG는 전부 대표값 — MDX 말미 주의문 + sources.md.
- 출처: `docs/sources/gpu-cpu-conversation-sources.md`(Vulkan spec/guide/tutorial, MS Learn WDDM·D3D12,
  fgiesen). 챕터 말미 "참고 자료" 섹션 있음.

## 알려진 한계 / TODO
- **시각 검증 미완** — 브라우저(클린 프로필) 라이트/다크/모바일(~360px)에서 라벨 겹침·잘림 확인 필요.
  특히 CommandBufferRing(좁은 폭에서 포인터 라벨이 캔버스 밖으로 나갈 수 있음), UserKernelDriver(경계
  라벨 박스 폭), AsyncTimeline(F=1일 때 블록 폭).
- **chapters.ts 미등록**(L2는 건드리지 않음). 등록 제안: 아래.
- 5부작 나머지(WDDM 스택 / 드로우 콜 일생 / 상태·PSO / DX9~12·Vulkan 비교)와 섹션 순서 함께 등록 권장.

## chapters.ts 등록 제안
```ts
{ slug: 'gpu-cpu-conversation', title: 'CPU와 GPU의 대화 — 명령 버퍼와 비동기',
  description: 'GPU는 별도 프로세서다 — command buffer에 기록하면 GPU가 나중에 소비한다. ring buffer, frames in flight, fence, user/kernel 드라이버.',
  section: '그래픽스 드라이버' }
```
(기존 `directx-driver-internals`와 같은 "그래픽스 드라이버" 섹션. 이 편이 더 앞 — 기초 → 심화 순.)
```
