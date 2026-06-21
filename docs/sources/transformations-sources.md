# 출처 — transformations ("3D 변환: 회전")

이 챕터는 회전 행렬을 소개하는 짧은 입문/템플릿 챕터다(데모 한 개: `RotatingBox`).
아래 1차/표준 자료를 기준으로 사실관계를 검증했다. 조사일: 2026-06.

> 검증 메모: 이 챕터의 핵심 수학은 "$y$축 회전 행렬"의 형태와 부호뿐이라 검증 범위가 좁다.
> 표준 교재·문서로 행렬 성분과 부호 규약을 교차확인했다.

---

## 1. $y$축 회전 행렬의 성분과 부호

본문 식:
$$
R_y(\theta)=\begin{bmatrix}\cos\theta&0&\sin\theta\\0&1&0\\-\sin\theta&0&\cos\theta\end{bmatrix}
$$

- **Wikipedia — Rotation matrix (Basic 3D rotations)**
  https://en.wikipedia.org/wiki/Rotation_matrix#Basic_3D_rotations
  - 표준 우수(right-handed) 좌표계에서 $y$축 둘레의 active 회전(반시계, 위에서 $+y$를 향해 볼 때)은
    $R_y=\begin{bmatrix}\cos\theta&0&\sin\theta\\0&1&0\\-\sin\theta&0&\cos\theta\end{bmatrix}$.
    $x,z$축 행렬과 달리 $R_y$만 $\sin$ 부호 배치가 "거울"인데(우상단 $+\sin$, 좌하단 $-\sin$),
    이는 축 순환 $x\to y\to z\to x$에서 $y$가 가운데 축이기 때문이다.
  - **검증 결과:** 본문 행렬은 표준 우수 좌표계의 active 회전 규약과 **일치**. ✔ (수정 없음)

- **Scratchapixel — Transforming Points and Vectors / Rotation matrices** (보조, 같은 규약 확인)
  https://www.scratchapixel.com/lessons/mathematics-physics-for-computer-graphics/geometry/rotation-matrix.html

## 2. 행렬·점 곱으로 좌표 변환

- 본문 "이 행렬을 점 $\mathbf p=(x,y,z)$에 곱하면 회전한 새 좌표를 얻는다"는 선형대수의 표준 서술.
  열벡터 규약 $\mathbf p'=R\mathbf p$ 기준. (Wikipedia Rotation matrix 동일.)

---

### 플래그(불확실/대표값)
- 없음. 챕터가 짧고 주장이 표준 정의 수준이라 미확정 수치 없음.
- 다음 챕터(`quaternions`)가 이 회전 표현을 이어받으므로, 부호·규약 일관성은 거기서도 동일 기준으로 검증.
