import { useEffect, useRef } from 'react';
import { readColors, setupCanvas } from './canvas2d';

// 정적 도식 — HBAO의 horizon angle.
// 깊이 버퍼를 height field로 보고, 한 방향으로 ray-march해 가장 높이 솟은 "지평선"을 찾는다.
// 그 지평선 위 입체각이 트인 하늘 = 차폐 안 됨. SSAO의 점-샘플 깊이비교와 대비된다.

function profile(x: number, w: number, h: number): number {
  const base = h * 0.66;
  // 오른쪽으로 갈수록 솟는 언덕(지평선을 만든다)
  const hill = x > w * 0.55 ? (Math.sin(((x - w * 0.55) / (w * 0.45)) * Math.PI * 0.5) * h) * 0.34 : 0;
  return base - hill;
}

export default function HorizonDiagram() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const s = setupCanvas(canvas, 280);
      if (!s) return;
      const { ctx, w, h } = s;
      const col = readColors(canvas);
      ctx.clearRect(0, 0, w, h);

      // 표면
      ctx.fillStyle = col.surface;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 2) ctx.lineTo(x, profile(x, w, h));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col.border;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const y = profile(x, w, h);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 관찰점 P(왼쪽 평지)
      const px = w * 0.28;
      const py = profile(px, w, h);

      // 오른쪽 방향으로 ray-march해 최대 앙각(horizon) 탐색
      let bestAng = 0;
      let bestX = px, bestY = py;
      for (let x = px + 4; x < w; x += 2) {
        const y = profile(x, w, h);
        const ang = Math.atan2(py - y, x - px); // 위로 솟을수록 양수
        if (ang > bestAng) {
          bestAng = ang;
          bestX = x;
          bestY = y;
        }
      }

      // 수평 기준선
      ctx.strokeStyle = col.muted;
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(w * 0.95, py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // horizon 선
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(bestX, bestY);
      ctx.stroke();

      // 가려진 입체각(수평~horizon 사이) 음영
      ctx.fillStyle = col.accent;
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.moveTo(px, py);
      const rArc = Math.min(w, h) * 0.4;
      ctx.lineTo(px + rArc, py);
      ctx.arc(px, py, rArc, 0, -bestAng, true);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // 트인 하늘 표시
      ctx.fillStyle = col.muted;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('트인 하늘 (개방)', px + rArc * 0.5, py - rArc * 0.55);
      ctx.fillStyle = col.accent;
      ctx.fillText('가려진 각', px + 30, py - 12);

      // 점/라벨
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col.text;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('P', px - 14, py + 4);
      ctx.fillText('horizon', bestX - 30, bestY - 8);
      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('한 방위 슬라이스에서 깊이를 따라가 가장 높은 각(지평선)을 찾는다', 8, h - 10);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        style={{ width: '100%', height: 'auto', maxWidth: 380, borderRadius: 8, border: '1px solid var(--border)' }}
      />
      <figcaption>
        HBAO는 점-샘플 깊이비교 대신, 깊이 버퍼를 높이 지형으로 보고 한 방위(azimuth) 방향으로 깊이를
        따라가 <strong>가장 높이 솟은 각(horizon)</strong>을 찾습니다. 수평선과 그 horizon 사이의 각이 곧
        가려진 입체각이고, 그 위로는 트인 하늘입니다. 여러 방위로 이 슬라이스를 돌려 적분하면 반구 전체
        차폐가 나옵니다. GTAO는 이 horizon 적분을 코사인 가중으로 정확히 풀고 오프라인 ray-traced AO에
        맞춰 보정한 버전입니다.
      </figcaption>
    </figure>
  );
}
