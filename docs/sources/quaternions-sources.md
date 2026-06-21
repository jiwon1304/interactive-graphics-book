# 출처 — quaternions ("쿼터니언과 회전")

이 챕터의 수식·고유명사·역사적 출처를 1차/표준 자료에 대조해 검증했다. 조사일: 2026-06.

> 검증 메모: `iquilezles.org`·일부 학술 PDF는 WebFetch 403이 잦아, 검색 스니펫과 다수 표준 출처
> (Wikipedia 수학 문서, Shoemake 원논문 메타데이터, Hamilton 곱 규칙)로 교차확인했다.

---

## 1. 짐벌 락 (gimbal lock) · 오일러 각의 자유도 손실

- **Wikipedia — Gimbal lock**
  https://en.wikipedia.org/wiki/Gimbal_lock
  - *"Gimbal lock is the loss of one degree of freedom in a three-dimensional, three-gimbal mechanism
    that occurs when the axes of two of the three gimbals are driven into a parallel configuration,
    'locking' the system into rotation in a degenerate two-dimensional space."*
  - 본문 "가운데 링(피치)을 ±90°로 돌리면 바깥/안쪽 축이 정렬되어 자유도 하나를 잃는다"는 이와 일치. ✔

## 2. 쿼터니언 정의 · Hamilton 곱 규칙

- **Wikipedia — Quaternion**
  https://en.wikipedia.org/wiki/Quaternion
  - 기본 관계 $i^2=j^2=k^2=ijk=-1$ (Hamilton, 1843). 본문 식과 일치. ✔
  - 곱셈 규칙 $ij=k,\ jk=i,\ ki=j$ 이고 $ji=-k,\ kj=-i,\ ik=-j$ (비가환). 본문 $ji=-k$ 일치. ✔
- **Wikipedia — Quaternions and spatial rotation**
  https://en.wikipedia.org/wiki/Quaternions_and_spatial_rotation
  - 단위 쿼터니언 회전 작용 $v\mapsto qvq^{-1}$, 축-각 공식
    $q=\cos\tfrac\theta2+\sin\tfrac\theta2(n_xi+n_yj+n_zk)$. 본문 §2 식과 일치. ✔

## 3. 절반 각(half-angle)의 이유 — 이중 작용 $qvq^{-1}$

- 위 "Quaternions and spatial rotation" 문서.
  - $v\mapsto qvq^{-1}$는 양쪽에서 작용하므로 쿼터니언의 각 $\varphi=\theta/2$에 대해 벡터는 $2\varphi=\theta$
    회전한다. 본문 §3 ("쿼터니언이 $\varphi$ 돌면 벡터는 $2\varphi$ 돈다") 일치. ✔
  - 이 사실은 $S^3 \to SO(3)$가 **2-to-1**(double cover)인 것과 같은 뿌리.

## 4. 이중 덮개 (double cover): $R(q)=R(-q)$

- 위 문서 + **Wikipedia — Spinor / SU(2)→SO(3) double cover** 맥락.
  https://en.wikipedia.org/wiki/Quaternions_and_spatial_rotation#Quaternions_versus_other_representations_of_rotations
  - $q$와 $-q$가 같은 회전을 준다: $(-q)v(-q)^{-1}=qvq^{-1}$ (부호가 두 번 곱해 상쇄). 본문 §4 일치. ✔
  - 보간 시 내적 부호로 짧은 호/먼 호가 갈린다는 실무 규칙: 내적 음수면 한쪽 부호를 뒤집어 최단 호 선택.
    (Shoemake 1985, 표준 SLERP 구현 관행) ✔

## 5. SLERP · LERP — Shoemake 1985 (★ 1차 출처)

- **Ken Shoemake, "Animating Rotation with Quaternion Curves", SIGGRAPH '85,
  ACM Computer Graphics 19(3), pp. 245–254 (1985).**
  https://dl.acm.org/doi/10.1145/325334.325242
  (역사 페이지: https://history.siggraph.org/learning/animating-rotation-with-quaternion-curves-by-shoemake/)
  - SLERP(spherical linear interpolation)을 컴퓨터 애니메이션에 도입한 원논문. 등속 각속도로 두 자세를
    잇는다. 본문 §5 SLERP 공식
    $\mathrm{slerp}(q_0,q_1;t)=\dfrac{\sin((1-t)\Omega)}{\sin\Omega}q_0+\dfrac{\sin(t\Omega)}{\sin\Omega}q_1,\ \cos\Omega=q_0\cdot q_1$
    는 Shoemake의 표준식과 일치. ✔
- **Wikipedia — Slerp** https://en.wikipedia.org/wiki/Slerp
  - 같은 공식 + LERP의 비등속/단위구 이탈 문제 확인. LERP $(1-t)q_0+tq_1$는 크기가 1 미만으로 떨어져
    재정규화(nlerp)가 필요하고 각속도가 불균일. 본문 §5 ("LERP 골이 1 아래로 꺼진다", "nlerp") 일치. ✔

## 6. 해밀턴 곱과 회전 합성의 비가환성

- Wikipedia — Quaternion (곱셈 비가환) + Quaternions and spatial rotation (합성 = 곱).
  - 두 회전 합성은 쿼터니언 곱이며 순서 의존: 일반적으로 $q_Aq_B\ne q_Bq_A$. 본문 §6 일치. ✔
  - 두 축이 같거나 한 각이 0이면 가환 — 본문 마지막 단락의 "특수한 경우 일치" 서술과 일치. ✔

---

### 플래그(불확실/대표값)
- 없음. 모든 수식·역사적 출처가 1차/표준 자료와 일치(수정 없음).
- 표기 규약: 본문은 $q=(w,\,(x,y,z))$ 스칼라-우선 표기를 일관되게 사용 — Shoemake/Wikipedia와 동일.
