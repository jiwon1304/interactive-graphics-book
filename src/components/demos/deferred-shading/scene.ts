// deferred-shading 데모들이 공유하는 작은 장면 정의.
// 여러 위젯이 "같은 장면"을 다른 방식(G-buffer 채널 / 라이팅)으로 보여주므로
// 오브젝트 배치를 한 곳에 모아 둔다.

export interface SceneObject {
  /** 종류 — 지오메트리 선택용 */
  kind: 'box' | 'sphere' | 'torus';
  position: [number, number, number];
  /** 기본색(albedo). sRGB 16진수 */
  albedo: string;
  /** 회전(라디안) */
  rotation?: [number, number, number];
  scale?: number;
}

// 살짝 겹치고 깊이가 다양해 G-buffer 채널 차이가 잘 보이도록 배치.
export const SCENE_OBJECTS: SceneObject[] = [
  { kind: 'sphere', position: [-1.6, 0, 0.4], albedo: '#d94f4f', scale: 0.95 },
  { kind: 'box', position: [0.2, -0.2, -0.6], albedo: '#4f9dde', rotation: [0.3, 0.6, 0], scale: 1.0 },
  { kind: 'torus', position: [1.7, 0.3, 0.2], albedo: '#5fbf6f', rotation: [1.1, 0.2, 0], scale: 0.9 },
  { kind: 'box', position: [-0.4, 1.0, -1.4], albedo: '#e0b341', rotation: [0.2, 0.8, 0.4], scale: 0.6 },
];

// 바닥 평면(깊이 그라데이션이 잘 보이도록).
export const FLOOR = {
  albedo: '#8a8f98',
  y: -1.1,
};
