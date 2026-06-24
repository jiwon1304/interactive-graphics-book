import { useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { useCanvas2D, type Canvas2DContext } from './shared';

// 광원이 위에서 아래로 보는 2D 단면.
// 광원에서 여러 광선을 쏴 가장 먼저 닿는 표면 깊이(=depth map)를 기록.
// 그 다음 바닥의 한 테스트 점이 "광원에서 자신까지 거리"와 그 방향의 depth map 값을
// 비교해 그림자인지 판정하는 과정을 그린다.
interface DrawParams {
  occluderX: number; // 가림 물체(막대)의 x 위치 (0..1)
  testX: number; // 테스트 점 x (0..1)
}

const N_RAYS = 18;

function drawScene(c: Canvas2DContext, p: DrawParams) {
  const { ctx, width, height, colors } = c;
  const M = { l: 16, r: 16, t: 30, b: 26 };
  const W = width - M.l - M.r;
  const H = height - M.t - M.b;
  const lx = M.l + W * 0.5; // 광원 x(중앙 위)
  const ly = M.t;
  const floorY = M.t + H; // 바닥 깊이

  // 가림 막대(occluder): 광원과 바닥 사이 어딘가에 떠 있는 수평 막대
  const occY = M.t + H * 0.5;
  const occCx = M.l + W * p.occluderX;
  const occHalf = W * 0.11;
  const occL = occCx - occHalf;
  const occR = occCx + occHalf;

  // 한 광선(광원 → 각도)에 대해 처음 닿는 깊이(y) 반환
  function firstHitY(targetX: number): number {
    // 광선은 광원(lx,ly)에서 바닥의 targetX로 향한다. 막대와 교차하면 막대에서 멈춤.
    // 막대는 y=occY의 수평선분 [occL,occR].
    const dx = targetX - lx;
    const dy = floorY - ly;
    const t = (occY - ly) / dy; // 막대 높이에 도달하는 매개변수
    const xAtOcc = lx + dx * t;
    if (t > 0 && t < 1 && xAtOcc >= occL && xAtOcc <= occR) return occY;
    return floorY;
  }

  // 바닥
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M.l, floorY);
  ctx.lineTo(M.l + W, floorY);
  ctx.stroke();

  // depth map: 여러 광선을 쏴 처음 닿는 점을 그린다
  for (let i = 0; i < N_RAYS; i++) {
    const fx = (i + 0.5) / N_RAYS;
    const targetX = M.l + W * fx;
    const hitY = firstHitY(targetX);
    const dx = targetX - lx;
    const dy = floorY - ly;
    const t = (hitY - ly) / dy;
    const hitX = lx + dx * t;
    ctx.strokeStyle = colors.muted;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(hitX, hitY);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 기록된 깊이 점
    ctx.fillStyle = hitY < floorY ? '#e08a3c' : colors.accent;
    ctx.beginPath();
    ctx.arc(hitX, hitY, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 가림 막대
  ctx.fillStyle = '#e08a3c';
  ctx.fillRect(occL, occY - 5, occR - occL, 10);

  // 광원
  ctx.fillStyle = colors.text;
  ctx.beginPath();
  ctx.arc(lx, ly, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('광원', lx + 10, ly + 4);

  // 테스트 점과 판정
  const testX = M.l + W * p.testX;
  const recordedY = firstHitY(testX); // depth map에 기록된, 그 방향 최단 표면
  const inShadow = recordedY < floorY - 0.5; // 막대가 가려 바닥보다 앞에서 멈췄으면 그림자

  // 광원 → 테스트 점 광선(현재 깊이)
  ctx.strokeStyle = inShadow ? '#d8443b' : '#3aa86b';
  ctx.lineWidth = 2;
  ctx.setLineDash(inShadow ? [4, 3] : []);
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(testX, floorY);
  ctx.stroke();
  ctx.setLineDash([]);

  // 테스트 점
  ctx.fillStyle = inShadow ? '#d8443b' : '#3aa86b';
  ctx.beginPath();
  ctx.arc(testX, floorY, 5, 0, Math.PI * 2);
  ctx.fill();

  // 판정 라벨
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = inShadow ? '#d8443b' : '#3aa86b';
  const label = inShadow ? '그림자 (가려짐)' : '빛 받음';
  ctx.fillText(label, M.l, M.t - 12);
}

export default function DepthMapView() {
  const [occluderX, setOccluderX] = useState(0.5);
  const [testX, setTestX] = useState(0.5);

  const ref = useCanvas2D(280, (c) => drawScene(c, { occluderX, testX }), [occluderX, testX]);

  return (
    <figure className="demo">
      <div style={{ maxWidth: 380, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
      </div>
      <ControlPanel>
        <Slider label="가림 물체 위치" value={occluderX} min={0.1} max={0.9} step={0.01} onChange={setOccluderX} />
        <Slider label="테스트 점 위치" value={testX} min={0.05} max={0.95} step={0.01} onChange={setTestX} />
      </ControlPanel>
      <figcaption>
        광원 시점 단면. 1패스에서 광원이 여러 방향으로 쏜 광선이 처음 닿는 표면의 깊이를 기록한다(점들 =
        depth map). 주황 막대가 어떤 방향을 가리면, 그 방향의 기록된 깊이는 바닥이 아니라 막대(더 가까움)다.
        2패스에서 바닥의 테스트 점은 자신의 광원-거리를, 그 방향에 기록된 최단 깊이와 비교한다 —
        자신이 더 멀면(=사이에 막대가 있으면) 그림자(빨강), 아니면 빛 받음(초록). 막대와 테스트 점을
        움직여 판정이 뒤집히는 지점을 찾아보세요.
      </figcaption>
    </figure>
  );
}
