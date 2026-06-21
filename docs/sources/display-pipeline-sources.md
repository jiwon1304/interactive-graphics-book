# 출처 — display-pipeline ("디스플레이 출력 — 스캔아웃부터 VRR까지")

리서치 에이전트가 웹 검색으로 수집·교차검증(≥2 독립 출처). 핵심 수치(60Hz=16.67ms, 픽셀클럭 공식,
LFC 2× 규칙, present 모드 정의)는 복수 출처 일치. (세션 중 다수 1차 사이트가 WebFetch 403 → GitHub
미러 + 검색 스니펫으로 교차확인.)

## 핵심 사실 ↔ 출처
- 스캔아웃·VBlank·픽셀클럭(HTOTAL×VTOTAL×refresh), 빔 멘탈 모델:
  https://glenwing.github.io/docs/VESA-CVT-1.2.pdf ·
  https://blurbusters.com/understanding-display-scanout-lag-with-high-speed-video/
- 테어링(스캔아웃 중 교체)·싱글버퍼: https://forums.blurbusters.com/viewtopic.php?t=6867
- 진짜 트리플 버퍼링(최신 표시·중간 버림) vs 렌더-어헤드 큐(줄세움·지연↑), 더블버퍼 fps 반토막:
  https://anandtech.com/Show/Index/2794 · https://www.4rknova.com/blog/2025/09/12/triple-buffering
- DXGI flip 모델·ALLOW_TEARING(sync interval 0)·waitable swapchain:
  https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/dxgi-flip-model ·
  https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/variable-refresh-rate-displays
- Vulkan present 모드 FIFO/FIFO_RELAXED/MAILBOX/IMMEDIATE:
  https://registry.khronos.org/vulkan/specs/latest/man/html/VkPresentModeKHR.html
- VRR 원리(VBlank 가변), VESA Adaptive-Sync(2014 DP):
  https://www.vesa.org/wp-content/uploads/2014/07/VESA-Adaptive-Sync-Whitepaper-140620.pdf
- FreeSync(LFC, 티어): https://www.amd.com/en/technologies/free-sync-faq
- G-SYNC(모듈/가변 오버드라이브 vs Compatible), VRR 하한: https://en.wikipedia.org/wiki/Nvidia_G-Sync ·
  https://tftcentral.co.uk/articles/variable_refresh
- LFC: 하한 미만 시 프레임 정수배 반복, 상한 ≥ 2×하한 필요:
  https://www.tomshardware.com/reviews/amd-freesync-monitor-glossary-definition-explained,6009.html
- 프레임 페이싱(간격 균일성), 24p 3:2 풀다운 저더:
  https://inputlag.app/guides/what-causes-frame-pacing-issues · https://www.projectorcentral.com/judder_24p.htm

## 낮은 신뢰도/주의 (본문에 반영함)
- G-SYNC "1Hz 하한"은 프레임 더블링 실효 하한(패널이 1Hz 스캔 아님) → 본문 명시.
- Adaptive-Sync/G-SYNC Compatible 하한 "40/48Hz"는 패널별 경향치 → 단정 회피.
- MAILBOX ≈ 트리플 버퍼링은 개념적 등치(정확히 3장은 아님) → 본문 "≈"로 표기.
- waitable swapchain 기본 지연 1 vs SetMaximumFrameLatency 기본 3은 별개 메커니즘 → 혼동 주의.
- G-SYNC 모듈 FPGA 세부 사양은 초기 모듈 기준이라 본문 미기재.

## 데모 ↔ 사실
- `ScanoutTearing`: 스캔아웃 빔 + VSync on/off → 테어 라인(프레임 경계) 시각화.
- `FrameDeliveryTimeline`: VSync off/더블/트리플/VRR의 표시·반복(저더)·드롭·테어·LFC 비교.
