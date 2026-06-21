# 출처 — memory-bandwidth-roofline ("메모리 대역폭과 Roofline")

소급 검증일: 2026-06. Roofline 원논문(Berkeley/CACM), Horowitz 에너지, GPUOpen DCC,
fgiesen swizzle 글 기준.

핵심 결론: **본문 사실관계에 실질적 오류 없음.** roofline $P=\min(P_{\text{peak}}, I\cdot B)$·
ridge point $I^*=P_{\text{peak}}/B$·arithmetic intensity·DCC anchor+delta·Morton/Z-order
비트 인터리브가 모두 1차/권위 자료와 일치. 용어 한 곳(arithmetic vs operational intensity)과
DRAM pJ 절대값만 메모를 남긴다(아래 ★).

---

## 1·2. Roofline model · arithmetic intensity · ridge point

- **S. Williams, A. Waterman, D. Patterson, "Roofline: An Insightful Visual Performance Model for
  Multicore Architectures", Communications of the ACM 52(4), April 2009, pp.65–76.**
  https://cacm.acm.org/magazines/2009/4/22959-roofline-an-insightful-visual-performance-model-for-multicore-architectures/fulltext
  https://people.eecs.berkeley.edu/~kubitron/cs252/handouts/papers/RooflineVyNoYellow.pdf (PDF)
  - 성능 = $\min(\text{peak FLOP/s},\ \text{operational intensity}\times\text{peak BW})$. log-log
    플롯(y=GFLOP/s, x=FLOP/byte), 경사 지붕(BW)·수평 천장(compute).
  - **ridge point** = 두 지붕이 만나는 점; x좌표 = peak 성능에 필요한 *최소* intensity =
    $P_{\text{peak}}/B$. "ridge가 클수록 peak 달성이 어렵다"는 통찰.
  - **본문 ↔ 출처:** $P=\min(P_{\text{peak}}, I\cdot B)$, $I^*=P_{\text{peak}}/B$, 단위
    약분(FLOP/byte × byte/s = FLOP/s), bandwidth-bound(경사)/compute-bound(수평) 진단 — 모두 일치.
  - **★ 용어 메모:** 원논문은 **"operational intensity"**(FLOP/byte), 본문·GPU 문헌 다수는
    **"arithmetic intensity"** 를 쓴다. 동의어로 통용되며 정의 동일. 오류 아님(본 노트에 명시).
- **검증 — $I^*=40$ FLOP/byte (40 TFLOP/s ÷ 1 TB/s):** 산술 정확. "byte당 40번 넘게 계산해야
  산술 유닛을 다 쓴다", "대부분 그래픽스 커널은 한참 못 미침" 정성 결론도 타당.
- **memory wall** — Wulf & McKee 1995("Hitting the Memory Wall"). FLOPS가 대역폭보다 빨리 늚
  (실리콘 면적 vs 핀 수×신호속도). 본문 §1 일치.
  https://dl.acm.org/doi/10.1145/216585.216588

## 3. 대역폭 예산 — 컬러 버퍼 셈

- $\text{BW}=W H\, b_{px}\,(\text{read}+\text{write})\,d_{\text{overdraw}}\,\text{fps}$.
  - 검증: 1080p(2.07M) × 4 × 2 × 3 × 60 ≈ **3.0 GB/s**. 산술 정확. "컬러 한 장만" 센 값(depth·
    텍스처·정점·G-buffer 제외)이라는 단서도 정확.

## 4. DCC (delta color compression) · fast clear

- **GPUOpen / AMD — Delta Color Compression(DCC)**
  https://gpuopen.com/learn/dcc-overview/ (DCC overview)
  - 블록 단위 **anchor + delta**(매끈한 블록은 작은 delta → 적은 비트). **무손실**(안 줄면 원본
    저장 → 화질 손실 0, *대역폭만* 절감). **메타데이터**로 블록별 압축상태 관리, ROP/TMU가 읽을
    때 디코드. 본문 §4 두 핵심 성질(무손실·메타데이터) 정확.
  - **검증 — 4×4 예:** 원본 16×8=128 bit. anchor 8 + 15×$b_\delta$. $b_\delta=2$면 38 bit,
    128/38 ≈ **3.4×**. 산술 정확.
  - "평균 컬러 트래픽 30~70% 감소" 는 도식용 대표 범위(벤더·콘텐츠 의존). 본문 표기 적절.
- **fast clear** — clear color 플래그를 메타데이터에 몇 byte만 적어 4K 버퍼 통째 쓰기를 회피,
  실제 byte 쓰기 수 KB로 → $100\sim1000\times$ 싸짐. GPUOpen/AMD·NVIDIA 공통. 본문 §4 정확(대표 차수).

## 5. Morton / Z-order swizzle

- **fgiesen, "Texture tiling and swizzling"**
  https://fgiesen.wordpress.com/2011/01/17/texture-tiling-and-swizzling/
  - linear(row-major) $\text{addr}=y\cdot W + x$ 의 문제: 세로 이웃이 주소 $W$만큼 떨어짐 →
    2D로 뭉친 텍스처 접근(bilinear 2×2 등)이 캐시 라인 여럿에 흩어짐 → 가져온 byte 낭비.
  - **Morton/Z-order**: $x,y$ 비트를 번갈아 끼움(bit interleave) → 2D로 가까운 텍셀이 1D 주소로도
    가까움 → 한 캐시 라인이 작은 블록 대부분을 덮음. GPU 텍스처/렌더타깃은 swizzle된 tiled
    레이아웃(정확한 비트패턴은 벤더·포맷별). 본문 §5·식 $\text{Morton}(x,y)=y_2x_2y_1x_1y_0x_0$ 정확.
- **Morton code** 일반: https://en.wikipedia.org/wiki/Z-order_curve
- 본문 "intensity를 ridge 쪽(오른쪽)으로 미는 한 방법"(헛 트래픽 제거로 유효 byte당 일↑)
  — roofline과의 연결 논리 타당.

## 6·7. 조립 · 더 나아가기

- **Z/depth 압축**: 삼각형 내부 깊이가 평면처럼 변함 → 평면 predictor + 잔차(Golomb-Rice류).
  Hi-Z min/max 도 같은 메타데이터 흐름. (AMD/NVIDIA 압축 일반; 개념 정확)
- **MSAA + FMASK**: 픽셀 내 샘플들이 대개 동색 → coverage(FMASK)와 색 분리로 대역폭 폭증 억제.
  AMD FMASK 문서/GPUOpen. 본문 서술 정확.
- **채널/뱅크 인터리빙**: DRAM 다채널·뱅크 병렬 → 주소를 채널에 고루 뿌리지 않으면 한 채널 camping
  으로 유효 BW 폭락. swizzle이 채널 분산에도 관여. 일반 통념·벤더 문서와 일치.
- **표시 가능 DCC(displayable DCC)**: 압축 컬러를 디코드 없이 스캔아웃. GPUOpen/AMD 최신 흐름. 정확.

## 8. 에너지(전력) — 자매 챕터와 공유

- **Horowitz, ISSCC 2014, "Computing's Energy Problem"** —
  https://gwern.net/doc/cs/hardware/2014-horowitz-2.pdf
  - off-chip DRAM 64-bit ≈ 1300~2600 pJ, FP op ≈ 0.4~3.7 pJ. **본문 §3 "DRAM byte 이동
    에너지가 연산보다 수백~수천 배"** 의 근거. 정성 결론 정확(절대값은 tile-based-rendering
    챕터 노트 §8 ★ 참조 — 도식용 대표·차수).

---

## 대표값/주의 (flag)
- **★ 용어**: 본문 "arithmetic intensity" = 원논문 "operational intensity"(동의어, 정의 동일).
- DCC 30~70%·fast clear 100~1000×·$I^*=40$ 등은 검증된 산술 또는 대표 범위.
- DRAM/연산 pJ 절대값은 도식용 대표(차수는 정확).

## 결론
**오류·검토 필요 항목 없음.** Roofline 식·ridge point·intensity·DCC anchor+delta·fast clear·
Morton 비트 인터리브가 1차/권위 자료와 일치. arithmetic vs operational intensity는 동의어.
