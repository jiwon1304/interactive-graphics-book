# 챕터 핸드오프: 쿼터니언과 회전

## 목적

오일러 각의 짐벌 락에서 출발해 쿼터니언의 정의(축-각), 절반 각의 이유, 이중 덮개,
SLERP vs LERP, 해밀턴 곱의 비가환성까지를 **인터랙티브 위젯 중심**으로 전달한다.
이 챕터는 `transformations` 챕터(회전 행렬·스피닝 큐브)를 **보완**하며, 같은 회전을
행렬이 아닌 4차원 단위 쿼터니언으로 다룬다. 모든 위젯은 결과(RESULT)보다 **과정(PROCESS)**,
즉 메커니즘과 단계를 드러내도록 설계했다.

- 페이지: `src/pages/chapters/quaternions.mdx`
- 데모: `src/components/demos/quaternions/`
- 공용 수학 헬퍼: `src/components/demos/quaternions/quatMath.ts`
- `src/chapters.ts`는 **건드리지 않았다**(상위 에이전트가 등록 필요). slug 제안: `quaternions`.

## 위젯 6종

각 위젯은 PROCESS를 강조한다(완성된 결과가 아니라 작동 원리/단계를 보여줌).

### 1) GimbalLockDemo — 동기 부여 (오일러 각의 약점)
- 개념: 짐벌 락. 중첩된 세 짐벌 링(요 Y=바깥, 피치 X=가운데, 롤 Z=안쪽)을 `<group>`
  중첩으로 만들어 자식이 부모 회전을 상속. 피치 ±90°에서 바깥/안쪽 축이 정렬되어 자유도 1 손실.
- PROCESS: 락 상태를 감지해(피치가 90°에서 6° 이내) 두 링을 빨갛게 + `Html` 라벨
  "짐벌 락! 자유도 1 손실" 표시. 요·롤을 움직여도 화살표가 한 축으로만 도는 걸 체감.
- 파일: `GimbalLockDemo.tsx`
- 주요 파라미터: `yaw/pitch/roll` (도, −180~180), `highlight`(정렬 강조 토글), 프리셋
  SelectControl(`free` / `locked`=피치 90°로 점프). 카메라 `[4,3,5]`, `animate={false}`.

### 2) AxisAngleToQuaternion — 구성 (축-각 → 쿼터니언)
- 개념: `q = (cos(θ/2), sin(θ/2)·n̂)`. 방위각/고도각으로 단위 축 n̂, 슬라이더로 θ.
- PROCESS: 캔버스 밖 readout 패널에서 n̂, θ/2, cos(θ/2)=w, sin(θ/2)·n̂=(x,y,z), |q|=1을
  실시간 숫자로 분해 표시. 같은 쿼터니언을 `setFromAxisAngle`로 만들어 기즈모에 그대로 적용 →
  "숫자 = 회전" 증명. 축은 보라색 선으로 원점 관통 표시.
- 파일: `AxisAngleToQuaternion.tsx`
- 주요 파라미터: `azimuth`(−180~180), `elevation`(−90~90), `theta`(0~360). `animate={false}`.

### 3) HalfAngleExplorer — 직관 (왜 θ/2인가)
- 개념: 쿼터니언이 φ 돌면 벡터는 2φ 돈다(양면 작용 q v q⁻¹). 순수 2D, **r3f Canvas 미사용**.
- PROCESS: 단위원 위에 파란 바늘(θ/2)과 빨간 점(θ). 빨간 부채꼴이 항상 파란 부채꼴의 정확히
  2배로 벌어지는 걸 면적으로 보여줌. 슬라이더로 즉시 확인.
- 파일: `HalfAngleExplorer.tsx`
- 주요 파라미터: `theta`(0~360). 2D `<canvas>` 2D 컨텍스트, 테마 변수 직접 읽음.

### 4) DoubleCoverDemo — 직관 (q vs −q)
- 개념: R(q)=R(−q). 같은 목표 자세를 가리키는 q, −q 중 하나로 SLERP. +q=짧은 호, −q=먼 호.
- PROCESS: **부호 미보정 SLERP**(`slerpNoFlip`)로 q/−q가 다른 경로를 그리게 함. 와이어 구 +
  마커 궤적선(80 샘플)으로 짧은/먼 호 가시화. 내적 부호·실제 회전량·경로 라벨을 패널에 표시.
- 파일: `DoubleCoverDemo.tsx`
- 주요 파라미터: `t`(0~1), `useNeg`(−q 토글). 목표=축 (0.4,1,0.3) 정규화, 150°. 카메라 `[3,2,4]`,
  `animate={false}`.

### 5) SlerpVsLerp — 보상 (SLERP vs naïve LERP)
- 개념: SLERP 등속 대원호 vs LERP 현(속도 변동 + 단위 구 이탈).
- PROCESS: (a) 균일 t 점 16개를 구 위에 찍어 SLERP=등간격, LERP=가운데 벌어짐(속도) 가시화.
  (b) 아래 2D 그래프 `|q(t)|`: SLERP=1.0 유지, **정규화 안 한** LERP는 가운데서 1 미만으로 꺼짐.
  자세 차이 각을 키우면 골이 깊어짐. 자동 재생(useFrame 삼각파 구동기)으로 t 왕복.
- 파일: `SlerpVsLerp.tsx`
- 주요 파라미터: `show`(both/slerp/lerp), `t`(0~1, 수동 시 자동재생 정지), `sepDeg`(20~175),
  `playing`(자동 재생 토글 → `DemoCanvas animate={playing}`). 카메라 `[3,2,4]`.
- 주의: 자세 적용엔 **정규화한** nlerp를 쓰지만(메시가 깨지지 않게), 그래프에는 정규화 전
  `lerpRaw` 크기를 그려 결함을 드러낸다. 이 분리가 의도된 것임.

### 6) HamiltonProductSandbox — 합성 & 비가환성
- 개념: q_A q_B ≠ q_B q_A. 두 회전(축 X/Y/Z + 각)을 정의하고 A∘B vs B∘A 비교.
- PROCESS: 적용 순서를 바꾸면 기즈모 최종 자세가 달라짐 + 패널의 q_A·q_B와 q_B·q_A (x,y,z,w)
  숫자가 실제로 다름. 두 결과 사이 각도 차를 계산해 "가환/비가환" 판정 표시(같은 축이면 가환).
- 파일: `HamiltonProductSandbox.tsx`
- 주요 파라미터: `axisA/axisB`(x/y/z), `angleA/angleB`(−180~180), `order`(AB/BA). 카메라 `[4,3,5]`,
  Axes on, `animate={false}`.

## 수학 노트

- 축-각: q.x,q.y,q.z = sin(θ/2)·n̂,  q.w = cos(θ/2). 사용자 축은 항상 정규화 후 `setFromAxisAngle`.
- **성분 순서 주의(중요):** `THREE.Quaternion`은 `.x .y .z .w` 필드를 가지며 생성자도
  `new THREE.Quaternion(x, y, z, w)`. r3f의 `quaternion={[...]}` 튜플도 **[x, y, z, w]** 순서다
  (수학 표기 흔한 [w,x,y,z]가 **아님**). 모든 데모에서 `toTuple(q) = [q.x,q.y,q.z,q.w]`로 통일.
- SLERP: `slerp(q0,q1,t) = sin((1-t)Ω)/sinΩ · q0 + sin(tΩ)/sinΩ · q1`, `cosΩ = q0·q1`.
- `THREE.Quaternion.prototype.slerp`는 receiver를 **변형**하므로 항상 `qa.clone().slerp(qb,t)`
  또는 `new THREE.Quaternion().slerpQuaternions(qa,qb,t)`. SlerpVsLerp는 `clone().slerp` 사용.
- THREE의 기본 slerp는 dot<0이면 부호를 뒤집어 **항상 짧은 호**를 택한다. 이중 덮개의 먼 호를
  보이려면 **부호를 뒤집지 않는** SLERP가 필요 → `quatMath.ts`의 `slerpNoFlip` 직접 구현.
  q와 −q를 넣으면 dot 부호가 반대라 짧은/먼 호가 갈린다(dot>0.9995면 lerp+정규화 폴백으로 수치 안정).
- naïve LERP `(1-t)q0 + t q1`은 각이 클수록 두 끝점 사이에서 |q|<1로 꺼진다. 이 크기를
  그래프로 그려 단위 구 이탈을 보인다(`lerpRaw`, 정규화 전).
- 해밀턴 곱: `multiplyQuaternions(qA,qB)` = qA·qB. 규약상 qA·qB는 "점에 먼저 B, 그다음 A 적용"
  =A∘B. 데모의 SelectControl 라벨이 이 규약을 따른다.

## 공용 헬퍼 `quatMath.ts`
- `slerpNoFlip(qa,qb,t)`: 부호 미보정 SLERP(이중 덮개 시연용).
- `lerpRaw(qa,qb,t)`: 정규화 안 한 성분별 LERP(크기 결함 시연용).
- `toTuple(q)`: `[x,y,z,w]` 변환(r3f용).
- DoubleCoverDemo와 SlerpVsLerp가 공유. SlerpVsLerp는 추가로 자체 `slerp`(정석, clone) /
  `lerpNormalized`를 둔다.

## 엔게이지먼트 의도
- 위젯이 많고(6개) 배치가 의도적이다: 문제 제기(짐벌 락) → 구성 → 직관(절반각/이중 덮개) →
  보상(SLERP) → 심화(해밀턴 곱). 각 위젯 앞 문장이 "무엇을 해보고 어떤 과정을 볼지" 지시.
- 짐벌 락은 슬라이더가 "먹통"이 되는 순간을 빨강+라벨로 극적으로 만든다.
- SLERP 위젯의 균일-간격 점 트릭은 속도 차이를 한눈에 보게 하는 핵심 장치.

## 알려진 한계 / TODO
- 쿼터니언 곱셈 규칙(i,j,k)을 시각적으로 보여주는 위젯은 없음(텍스트/수식으로만). 필요하면
  곱셈표 인터랙션을 추가 가능.
- HamiltonProductSandbox는 축을 X/Y/Z 정축으로만 제한(가독성 우선). 임의 축 입력은 미지원.
- DoubleCoverDemo의 "실제 회전량"은 시작/끝 내적 기반 근사치(짧은 호 = 2·acos|dot|, 먼 호 =
  360° − 짧은 호). 시작 자세가 단위가 아니라 살짝 비틀려 있어(Y 10°) dot 부호 효과가 잘 보인다.
- 2D 캔버스(HalfAngleExplorer, SlerpVsLerp 그래프)는 리사이즈 시 다음 상태 변경에서만 다시
  그려짐(전용 ResizeObserver 없음). 모바일 회전 등 즉시 재그리기가 필요하면 추가 권장.
- KaTeX는 .tsx에서 못 쓰므로 readout 패널은 유니코드(θ/2, n̂)와 모노스페이스 숫자로 표현.

## 확장 방법
- 새 보간/경로를 추가하려면 `quatMath.ts`에 헬퍼를 더하고 SlerpVsLerp의 show 모드를 확장.
- 임의 축 해밀턴 곱: AxisAngleToQuaternion의 방위/고도 축 선택 UI를 재사용해 A·B 양쪽에 적용.
- 모든 3D 데모는 `DemoCanvas`(=Canvas) 래퍼 + `OrbitControls enablePan={false} makeDefault`
  규약을 따른다. 컨트롤/패널/2D 캔버스는 전부 `<DemoCanvas>` **밖**(DOM)에 둔다.
- 색 규약: accent #4f9dde / red #e5484d / green #46a758, 보조 주황 #e5a23b. 2D는 테마 변수
  (`--text --muted --border --surface --accent`)를 `getComputedStyle`로 읽어 라이트/다크 적응.
