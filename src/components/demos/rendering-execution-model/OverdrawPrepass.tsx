import { useMemo, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { hexToRgb, mixRgb, withAlpha, monoFont, blitImage } from './re2d';

// 오버드로 히트맵: 겹친 불투명 레이어들. 깊이 프리패스가 없으면 한 픽셀이
// 그 위를 덮은 레이어 수만큼 셰이딩된다(= 오버드로). 프리패스를 켜면 색 패스 전에
// 깊이만 채워, 색 패스에서 각 픽셀은 *가장 가까운* 레이어 한 번만 셰이딩 → 식는다.
//
// 모델: 겹쳐 도는 N개의 원반(disk). 각 픽셀의 셰이딩 횟수를:
//   프리패스 OFF = 그 픽셀을 덮는 원반 수 (정렬 안 했다고 가정 → 전부 셰이딩)
//   프리패스 ON  = 덮는 원반이 1개라도 있으면 1, 없으면 0
// 으로 둔다. 히트맵은 파랑(1) → 빨강(많음).

const RES = 120; // 히트맵 해상도(셀)
const N_LAYERS = 5;

interface Disk {
  cx: number;
  cy: number;
  r: number;
}

// 결정적 배치(SSR 안전). 화면 중앙 근처에 겹치도록.
function makeDisks(n: number, spread: number): Disk[] {
  const out: Disk[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + 0.5;
    const rad = spread * 0.5;
    out.push({
      cx: 0.5 + Math.cos(ang) * rad * 0.45,
      cy: 0.5 + Math.sin(ang) * rad * 0.45,
      r: 0.26,
    });
  }
  return out;
}

export default function OverdrawPrepass() {
  const [prepass, setPrepass] = useState(false);
  const [layers, setLayers] = useState(N_LAYERS);
  const [spread, setSpread] = useState(0.6);

  const disks = useMemo(() => makeDisks(layers, spread), [layers, spread]);

  // 평균 오버드로(캡션 카운터)를 위해 한 번 계산.
  const stats = useMemo(() => {
    let sumCover = 0;
    let covered = 0;
    let maxCover = 0;
    for (let y = 0; y < RES; y++) {
      for (let x = 0; x < RES; x++) {
        const u = (x + 0.5) / RES;
        const v = (y + 0.5) / RES;
        let c = 0;
        for (const dsk of disks) {
          const dx = u - dsk.cx;
          const dy = v - dsk.cy;
          if (dx * dx + dy * dy <= dsk.r * dsk.r) c++;
        }
        if (c > 0) {
          covered++;
          maxCover = Math.max(maxCover, c);
        }
        sumCover += c;
      }
    }
    const avgNoPrepass = covered > 0 ? sumCover / covered : 0; // 덮인 픽셀당 평균 셰이딩
    return { avgNoPrepass, maxCover, covered };
  }, [disks]);

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const side = Math.min(w, h);
    const ox = (w - side) / 2;
    const oy = (h - side) / 2;

    const img = ctx.createImageData(RES, RES);
    const data = img.data;
    const cool = hexToRgb('#3b82f6'); // 1회 — 파랑(찬색)
    const hot = hexToRgb('#ef4444'); // 많이 — 빨강(뜨거움)
    const bgr = hexToRgb(theme.surface);

    const maxScale = Math.max(1, prepass ? 1 : stats.maxCover);

    for (let y = 0; y < RES; y++) {
      for (let x = 0; x < RES; x++) {
        const u = (x + 0.5) / RES;
        const v = (y + 0.5) / RES;
        let c = 0;
        for (const dsk of disks) {
          const dx = u - dsk.cx;
          const dy = v - dsk.cy;
          if (dx * dx + dy * dy <= dsk.r * dsk.r) c++;
        }
        const shade = prepass ? (c > 0 ? 1 : 0) : c; // 프리패스면 픽셀당 1회
        const idx = (y * RES + x) * 4;
        let rgb: [number, number, number];
        if (shade === 0) {
          rgb = bgr;
        } else {
          // 1 → 찬색, max → 뜨거움.
          const t = maxScale > 1 ? (shade - 1) / (maxScale - 1) : 0;
          rgb = mixRgb(cool, hot, t);
        }
        data[idx] = rgb[0];
        data[idx + 1] = rgb[1];
        data[idx + 2] = rgb[2];
        data[idx + 3] = 255;
      }
    }
    // 정사각 히트맵을 화면 정사각 영역으로(blit은 캔버스 전체 기준이라 임시 캔버스 경유).
    // 여기선 side×side 영역에만 그리려고 별도 오프스크린으로 처리.
    const off = document.createElement('canvas');
    off.width = RES;
    off.height = RES;
    const octx = off.getContext('2d');
    if (octx) {
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, ox, oy, side, side);
      ctx.imageSmoothingEnabled = true;
    } else {
      blitImage(ctx, img, w, h);
    }

    // 디스크 외곽선(레이어 경계 암시)
    ctx.strokeStyle = withAlpha(theme.text, 0.25);
    ctx.lineWidth = 1;
    for (const dsk of disks) {
      ctx.beginPath();
      ctx.arc(ox + dsk.cx * side, oy + dsk.cy * side, dsk.r * side, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 짧은 카운터 라벨(좌상단)
    const avg = prepass ? (stats.covered > 0 ? 1 : 0) : stats.avgNoPrepass;
    ctx.font = monoFont(12, 'bold');
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`평균 셰이딩 ${avg.toFixed(2)}×/픽셀`, ox + 6, oy + 6);
    ctx.fillText(prepass ? '프리패스 ON' : '프리패스 OFF', ox + 6, oy + 22);
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, [disks, prepass]);

  const avg = prepass ? 1 : stats.avgNoPrepass;

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 340, display: 'block' }} />
      </div>
      <ControlPanel>
        <ToggleControl
          label="깊이 프리패스 (색 전에 깊이만)"
          checked={prepass}
          onChange={setPrepass}
        />
        <Slider label="레이어 수" value={layers} min={2} max={8} step={1} onChange={setLayers} />
        <Slider
          label="겹침 정도"
          value={spread}
          min={0.1}
          max={1}
          step={0.01}
          onChange={setSpread}
          format={(v) => v.toFixed(2)}
        />
      </ControlPanel>
      <figcaption>
        겹쳐 그려진 불투명 레이어들입니다. 히트맵은 한 픽셀이 <strong>몇 번 셰이딩되는지</strong>를
        색으로 보여줍니다 — <span style={{ color: '#3b82f6' }}>파랑=1회</span>,{' '}
        <span style={{ color: '#ef4444' }}>빨강=여러 번</span>. 정렬 없이 마구 그리면, 결국 가려져
        보이지도 않을 픽셀을 레이어마다 다시 셰이딩합니다 — 이 낭비가{' '}
        <strong>오버드로(overdraw)</strong>입니다. 지금 덮인 픽셀당 평균{' '}
        <strong>{avg.toFixed(2)}회</strong> 셰이딩됩니다. <strong>프리패스를 켜 보세요:</strong> 색을
        칠하기 전에 값싼 <em>깊이 전용 패스</em>로 각 픽셀의 가장 가까운 깊이를 먼저 확정해 두면, 이어지는
        색 패스에선 그 깊이와 맞는 픽셀(맨 앞 레이어) <em>하나만</em> 통과해 셰이딩됩니다 — 평균이{' '}
        <strong>1.00회</strong>로 식습니다. 비용은 깊이 패스 한 번을 더 그리는 것이지만, 픽셀 셰이더가
        비싼(복잡한 머티리얼) 장면에서는 그 본전을 크게 뽑습니다. 레이어 수·겹침을 키울수록 프리패스의
        이득이 커지는 걸 비교해 보세요.
      </figcaption>
    </figure>
  );
}
