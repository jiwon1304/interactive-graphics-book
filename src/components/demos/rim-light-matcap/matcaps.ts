// 절차적 matcap 텍스처 생성기 — 외부 에셋 없이 코드로 굽는다.
// 캔버스의 각 픽셀을 단위 구의 법선 (x, y, z=√(1-x²-y²)) 으로 보고, 간단한 라이팅을 칠한다.
// 그래서 결과 이미지가 곧 "정면을 향한 구를 그 재질로 찍은 사진" = matcap.
import * as THREE from 'three';

export type MatcapKind = 'matte' | 'glossy' | 'metal' | 'toon2' | 'clay';

export const MATCAP_LABELS: Record<MatcapKind, string> = {
  matte: '무광 (matte)',
  glossy: '광택 (glossy)',
  metal: '금속 (metal)',
  toon2: '2밴드 toon',
  clay: '점토 (clay)',
};

function shade(kind: MatcapKind, ndl: number, fres: number): [number, number, number] {
  // ndl: 디퓨즈(0..1), fres: 가장자리 프레넬(0..1)
  switch (kind) {
    case 'matte': {
      const v = 0.18 + 0.72 * ndl;
      return [v * 0.95, v * 0.92, v]; // 살짝 차가운 회색
    }
    case 'glossy': {
      const base = 0.16 + 0.66 * ndl;
      const spec = Math.pow(Math.max(0, ndl), 32) * 0.9; // 좁은 하이라이트
      return [base * 0.6 + spec, base * 0.7 + spec, base + spec];
    }
    case 'metal': {
      const base = 0.05 + 0.5 * ndl;
      const spec = Math.pow(Math.max(0, ndl), 8) * 0.8;
      const rim = Math.pow(fres, 2) * 0.6;
      return [base + spec + rim * 0.9, base + spec + rim * 0.95, base + spec + rim];
    }
    case 'toon2': {
      const band = ndl > 0.55 ? 1.0 : ndl > 0.28 ? 0.62 : 0.34; // 2~3 계단
      return [band * 0.95, band * 0.85 * 0.95 + 0.05, band * 0.7 + 0.06];
    }
    case 'clay': {
      const v = 0.32 + 0.6 * ndl;
      const sss = Math.pow(fres, 3) * 0.25; // 가장자리 살짝 붉게(서브서피스 흉내)
      return [v + sss, v * 0.86, v * 0.78];
    }
  }
}

/** matcap을 256² 캔버스에 구워 CanvasTexture로 반환. */
export function makeMatcap(kind: MatcapKind, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  // 키 라이트: 좌상단에서.
  const L: [number, number, number] = [-0.5, 0.6, 0.62];
  const ll = Math.hypot(...L);
  L[0] /= ll; L[1] /= ll; L[2] /= ll;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      // 픽셀 → [-1,1], y는 위가 +가 되도록 뒤집기
      const x = (px / (size - 1)) * 2 - 1;
      const y = -((py / (size - 1)) * 2 - 1);
      const r2 = x * x + y * y;
      if (r2 > 1.0) {
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = 0; // 원 밖은 투명
        continue;
      }
      const z = Math.sqrt(1 - r2);
      const ndl = Math.max(0, x * L[0] + y * L[1] + z * L[2]);
      const fres = Math.pow(1 - z, 1.5); // z가 작을수록(가장자리) 큼
      const [r, g, b] = shade(kind, ndl, fres);
      data[i] = Math.min(255, Math.max(0, r * 255));
      data[i + 1] = Math.min(255, Math.max(0, g * 255));
      data[i + 2] = Math.min(255, Math.max(0, b * 255));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 컨트롤 옆 미리보기용 dataURL. */
export function matcapDataURL(kind: MatcapKind, size = 96): string {
  const tex = makeMatcap(kind, size);
  return (tex.image as HTMLCanvasElement).toDataURL();
}
