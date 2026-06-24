import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { readColors, setupCanvas } from './canvas2d';

// 톤매핑 곡선들(스칼라 휘도 입력 → [0,1] 출력).
function clipCurve(L: number): number {
  return Math.min(L, 1);
}
function reinhard(L: number): number {
  return L / (1 + L);
}
function reinhardWhite(L: number, white: number): number {
  return (L * (1 + L / (white * white))) / (1 + L);
}
// Narkowicz ACES fit(스칼라; x*=0.6은 데모에서 입력에 이미 곱하지 않고 곡선 형태만 보여줌).
function acesFit(L: number): number {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return Math.min(1, Math.max(0, (L * (a * L + b)) / (L * (c * L + d) + e)));
}

/**
 * 정적 보조 차트(노출만 인터랙티브) — 입력 휘도 → 출력 매핑 곡선 비교.
 * 과정 강조: 톤매핑 "연산자"가 곧 하나의 곡선임을 보이고, 노출은 입력축을 늘이는 배율임을 보인다.
 */
export default function ToneCurveChart() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [exposure, setExposure] = useState(1.0);
  const [showWhite, setShowWhite] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const s = setupCanvas(canvas, 300);
      if (!s) return;
      const { ctx, w, h } = s;
      const col = readColors(canvas);
      ctx.clearRect(0, 0, w, h);

      const padL = 40, padR = 14, padT = 14, padB = 34;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const Lmax = 8; // 입력 휘도 축 최대(HDR 영역까지)
      const x = (L: number) => padL + (L / Lmax) * plotW;
      const y = (o: number) => padT + (1 - o) * plotH;

      // 축
      ctx.strokeStyle = col.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, padT + plotH);
      ctx.lineTo(padL + plotW, padT + plotH);
      ctx.stroke();

      // 출력=1 가이드선
      ctx.strokeStyle = col.muted;
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(padL, y(1));
      ctx.lineTo(padL + plotW, y(1));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // 입력=1(노출 적용 전 기준) 세로선
      ctx.strokeStyle = col.muted;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x(1), padT);
      ctx.lineTo(x(1), padT + plotH);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const plot = (fn: (L: number) => number, color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let i = 0; i <= 240; i++) {
          const L = (i / 240) * Lmax;
          const o = fn(L * exposure); // 노출 = 입력 배율
          const px = x(L);
          const py = y(Math.min(1, Math.max(0, o)));
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      };

      // 색: clip=muted, reinhard=accent, aces=대비색(텍스트), white=점선 accent
      plot(clipCurve, col.muted, 2);
      plot(reinhard, col.accent, 2.4);
      plot(acesFit, col.text, 2.4);
      if (showWhite) {
        ctx.setLineDash([5, 4]);
        plot((L) => reinhardWhite(L, 4), col.accent, 1.8);
        ctx.setLineDash([]);
      }

      // 라벨
      ctx.fillStyle = col.text;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('입력 휘도 L (노출 적용)', padL + plotW / 2, h - 10);
      ctx.save();
      ctx.translate(13, padT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('출력 [0,1]', 0, 0);
      ctx.restore();

      // x축 눈금
      ctx.fillStyle = col.muted;
      ctx.font = '12px system-ui, sans-serif';
      for (const L of [0, 1, 2, 4, 8]) {
        ctx.fillText(String(L), x(L), padT + plotH + 16);
      }
      ctx.textAlign = 'left';

      // 범례
      ctx.font = '12px system-ui, sans-serif';
      let ly = padT + 6;
      const legend = (color: string, label: string, dash: boolean) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.4;
        ctx.setLineDash(dash ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(padL + 8, ly);
        ctx.lineTo(padL + 30, ly);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col.text;
        ctx.fillText(label, padL + 36, ly + 4);
        ly += 18;
      };
      legend(col.muted, 'None (clip)', false);
      legend(col.accent, 'Reinhard', false);
      legend(col.text, 'ACES', false);
      if (showWhite) legend(col.accent, 'Reinhard (white=4)', true);
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
  }, [exposure, showWhite]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        style={{ width: '100%', height: 'auto', maxWidth: 380, borderRadius: 8, border: '1px solid var(--border)' }}
      />
      <ControlPanel>
        <Slider
          label="노출 (입력 배율)"
          value={exposure}
          min={0.1}
          max={4}
          step={0.05}
          onChange={setExposure}
          format={(v) => `${v.toFixed(2)}×`}
        />
        <ToggleControl label="Reinhard white-point 곡선" checked={showWhite} onChange={setShowWhite} />
      </ControlPanel>
      <figcaption>
        톤매핑 연산자는 결국 하나의 곡선입니다. <strong>None</strong>은 입력 1까지 직선으로 따라가다
        1에서 수평으로 잘립니다(그 위 모든 휘도가 똑같은 흰색). <strong>Reinhard</strong>는 어떤 큰 값도
        1 아래로 눌러 절대 흰색에 도달하지 못합니다. <strong>ACES</strong>는 toe로 어두운 곳을 살짝
        들어 올리고 shoulder로 밝은 곳을 천천히 접는 S자입니다. 노출 슬라이더는 입력축에 곱하는 배율이라,
        키우면 같은 장면이 곡선의 더 오른쪽(더 쉽게 포화되는 구간)에 놓입니다. white-point Reinhard는
        지정한 휘도(여기선 4)에서 정확히 1에 닿게 만든 변형입니다.
      </figcaption>
    </figure>
  );
}
