import * as THREE from 'three';

/**
 * 부호 보정을 하지 않는 "있는 그대로의" SLERP.
 *
 * THREE.Quaternion.prototype.slerp 은 dot < 0 이면 한쪽 쿼터니언의 부호를
 * 뒤집어 항상 짧은 경로(≤180°)로 보간한다. 그래서 q 와 −q 를 넣어도 결과가
 * 같아져 이중 덮개를 "보여줄" 수 없다.
 *
 * 이 헬퍼는 그 부호 뒤집기를 의도적으로 생략한다. 따라서:
 *   - dot ≥ 0 (q)  → 짧은 호
 *   - dot < 0 (−q) → 먼 호(>180°)
 * 두 입력이 같은 회전을 나타내더라도 보간 "경로"가 달라진다.
 */
export function slerpNoFlip(
  qa: THREE.Quaternion,
  qb: THREE.Quaternion,
  t: number,
): THREE.Quaternion {
  let dot = qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w;
  dot = Math.max(-1, Math.min(1, dot));

  // 거의 평행하면 수치 안정성을 위해 선형 보간 후 정규화.
  if (dot > 0.9995) {
    return new THREE.Quaternion(
      qa.x + (qb.x - qa.x) * t,
      qa.y + (qb.y - qa.y) * t,
      qa.z + (qb.z - qa.z) * t,
      qa.w + (qb.w - qa.w) * t,
    ).normalize();
  }

  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);
  const s0 = Math.sin((1 - t) * omega) / sinOmega;
  const s1 = Math.sin(t * omega) / sinOmega;

  return new THREE.Quaternion(
    s0 * qa.x + s1 * qb.x,
    s0 * qa.y + s1 * qb.y,
    s0 * qa.z + s1 * qb.z,
    s0 * qa.w + s1 * qb.w,
  );
}

/**
 * 성분별 선형 보간(LERP) — 정규화하지 않은 "순진한" 버전.
 * 두 끝점 사이에서 크기가 1보다 작아져(단위 구 안쪽으로 들어가) 회전이 일그러진다.
 * 그 결함을 시각화하기 위해 일부러 정규화하지 않고 반환한다.
 */
export function lerpRaw(
  qa: THREE.Quaternion,
  qb: THREE.Quaternion,
  t: number,
): THREE.Quaternion {
  return new THREE.Quaternion(
    qa.x + (qb.x - qa.x) * t,
    qa.y + (qb.y - qa.y) * t,
    qa.z + (qb.z - qa.z) * t,
    qa.w + (qb.w - qa.w) * t,
  );
}

/** r3f의 quaternion 프로퍼티에 넘길 [x, y, z, w] 튜플로 변환. */
export function toTuple(q: THREE.Quaternion): [number, number, number, number] {
  return [q.x, q.y, q.z, q.w];
}
