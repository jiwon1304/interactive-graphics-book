import * as THREE from 'three';

// 고정 장면(여러 구 + 바닥)에 대해 정점별 AO를 CPU에서 굽는다.
// 각 정점에서 반구 위 코사인 가중 방향으로 짧은 광선을 쏴, 다른 구/바닥에 막히면 차폐로 친다.
// 이건 SSAO가 화면공간에서 근사하는 "반구 visibility 적분"을 월드공간에서 정직하게 계산한 버전이다.

export interface Sphere {
  center: THREE.Vector3;
  radius: number;
}

// 결정적(seedable) PRNG — SSR/리렌더에서 같은 결과.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 코사인 가중 반구 방향(법선 z=up 기준 로컬), 이후 TBN으로 회전.
function cosineHemisphere(u1: number, u2: number): THREE.Vector3 {
  const r = Math.sqrt(u1);
  const phi = 2 * Math.PI * u2;
  return new THREE.Vector3(r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - u1)));
}

// 광선(o,d) vs 구 교차 여부(t<maxDist 양수면 막힘).
function raySphere(o: THREE.Vector3, d: THREE.Vector3, s: Sphere, maxDist: number): boolean {
  const oc = o.clone().sub(s.center);
  const b = oc.dot(d);
  const c = oc.dot(oc) - s.radius * s.radius;
  const disc = b * b - c;
  if (disc < 0) return false;
  const t = -b - Math.sqrt(disc);
  return t > 1e-3 && t < maxDist;
}

// 광선 vs 바닥 평면 y=planeY(위쪽으로 향하는 면).
function rayPlane(o: THREE.Vector3, d: THREE.Vector3, planeY: number, maxDist: number): boolean {
  if (Math.abs(d.y) < 1e-5) return false;
  const t = (planeY - o.y) / d.y;
  return t > 1e-3 && t < maxDist;
}

const TMP_T = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ALT = new THREE.Vector3(1, 0, 0);

/**
 * geometry의 각 정점에 AO(0=완전 차폐, 1=완전 개방)를 계산해 color 속성으로 굽는다.
 * @param samples 반구 샘플 수
 * @param radius  광선 최대 거리(이보다 먼 차폐는 무시 = SSAO radius에 대응)
 * @param strength AO 세기(1=원본, 클수록 대비↑)
 */
export function bakeVertexAO(
  geometry: THREE.BufferGeometry,
  worldMatrix: THREE.Matrix4,
  occluders: Sphere[],
  planeY: number | null,
  samples: number,
  radius: number,
  strength: number,
): void {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);
  const rand = mulberry32(1337);

  const wp = new THREE.Vector3();
  const wn = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    wp.fromBufferAttribute(pos, i).applyMatrix4(worldMatrix);
    wn.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix).normalize();

    // TBN
    const ref = Math.abs(wn.y) < 0.99 ? UP : ALT;
    TMP_T.copy(ref).cross(wn).normalize();
    TMP_B.copy(wn).cross(TMP_T).normalize();

    let occ = 0;
    const origin = wp.clone().addScaledVector(wn, radius * 0.02); // 바이어스
    for (let sIdx = 0; sIdx < samples; sIdx++) {
      const local = cosineHemisphere(rand(), rand());
      const dir = new THREE.Vector3()
        .addScaledVector(TMP_T, local.x)
        .addScaledVector(TMP_B, local.y)
        .addScaledVector(wn, local.z)
        .normalize();
      let blocked = false;
      for (let k = 0; k < occluders.length; k++) {
        if (raySphere(origin, dir, occluders[k], radius)) {
          blocked = true;
          break;
        }
      }
      if (!blocked && planeY !== null && rayPlane(origin, dir, planeY, radius)) blocked = true;
      if (blocked) occ += 1;
    }
    let ao = 1 - occ / samples;
    ao = Math.pow(Math.max(0, ao), strength);
    colors[i * 3] = ao;
    colors[i * 3 + 1] = ao;
    colors[i * 3 + 2] = ao;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
