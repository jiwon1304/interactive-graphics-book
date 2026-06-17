// 위젯 4 — 번스타인 가중치.
// 차수 n에 대한 번스타인 기저 B_{i,n}(t)를 t축 위에 쌓은(누적) 영역 그래프로 그린다.
// 세로 t-마커가 그 순간의 각 가중치를 보여 주며, 가중치의 합은 항상 1(단위 분할)이다.
// 대수(가중치)와 기하(곡선 위 점)를 잇는 위젯.

import { useCallback, useState } from 'react';
import { bernstein, type Pt } from './geometry';
import { readPalette, type CanvasMetrics } from './canvasKit';
import { useBezierCanvas, type DrawContext } from './useBezierCanvas';
import { ControlPanel, Slider, SelectControl, type SelectOption } from '../../controls';
import { fillBackground } from './draw';

type Degree = '2' | '3' | '4';
const DEGREE_OPTIONS: ReadonlyArray<SelectOption<Degree>> = [
  { value: '2', label: '2차 (3 제어점)' },
  { value: '3', label: '3차 (4 제어점)' },
  { value: '4', label: '4차 (5 제어점)' },
];

// 누적 영역 색을 차수에 따라 자동 보간하기 위한 강조색 두 종류를 섞는다.
function mix(a: string, b: string, k: number): string {
  return `color-mix(in srgb, ${a} ${Math.round((1 - k) * 100)}%, ${b})`;
}

export default function BernsteinWeights() {
  const [degree, setDegree] = useState<Degree>('3');
  const [t, setT] = useState(0.4);
  const n = Number(degree);

  // 이 위젯은 드래그 제어점이 없다. 빈 배열을 넘겨 훅의 드로우/리사이즈만 활용.
  const noPoints: Pt[] = [];

  const draw = useCallback(
    ({ ctx, metrics }: DrawContext) => {
      const pal = readPalette(ctx.canvas);
      fillBackground(ctx, metrics, pal.surface);

      const m: CanvasMetrics = metrics;
      const padL = 34;
      const padR = 12;
      const padT = 14;
      const padB = 26;
      const plotW = m.width - padL - padR;
      const plotH = m.height - padT - padB;

      // 플롯 좌표 헬퍼: t∈[0,1], 누적값 y∈[0,1].
      const X = (tt: number) => padL + tt * plotW;
      const Y = (yy: number) => padT + (1 - yy) * plotH;

      // 가로 격자(0, 0.5, 1)와 세로 격자.
      ctx.save();
      ctx.strokeStyle = pal.border;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.8;
      for (const g of [0, 0.5, 1]) {
        ctx.beginPath();
        ctx.moveTo(X(0), Y(g));
        ctx.lineTo(X(1), Y(g));
        ctx.stroke();
      }
      ctx.restore();

      // 누적 영역: 각 i의 기저를 아래에서부터 쌓는다. 샘플 수.
      const SAMPLES = 120;
      const accentColors: string[] = [];
      for (let i = 0; i <= n; i++) {
        accentColors.push(mix(pal.accentBrand, pal.surface, i / Math.max(1, n)));
      }

      // 각 t 샘플의 누적합을 미리 계산.
      const cumulative: number[][] = []; // cumulative[s] = [running totals after adding basis 0..i]
      for (let s = 0; s <= SAMPLES; s++) {
        const tt = s / SAMPLES;
        const row: number[] = [];
        let acc = 0;
        for (let i = 0; i <= n; i++) {
          acc += bernstein(n, i, tt);
          row.push(acc);
        }
        cumulative.push(row);
      }

      // i = n..0 역순으로 위에서부터 채우면 겹쳐도 경계가 깔끔하다.
      for (let i = n; i >= 0; i--) {
        ctx.save();
        ctx.beginPath();
        // 위 경계(=이 밴드까지의 누적) 따라가기
        for (let s = 0; s <= SAMPLES; s++) {
          const tt = s / SAMPLES;
          const top = cumulative[s][i];
          const x = X(tt);
          const y = Y(top);
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        // 아래 경계(=이전 밴드까지의 누적, i=0이면 0)
        for (let s = SAMPLES; s >= 0; s--) {
          const tt = s / SAMPLES;
          const bottom = i === 0 ? 0 : cumulative[s][i - 1];
          ctx.lineTo(X(tt), Y(bottom));
        }
        ctx.closePath();
        ctx.fillStyle = accentColors[i];
        ctx.fill();
        ctx.restore();
      }

      // 각 기저 곡선의 윗선을 강조선으로.
      for (let i = 0; i <= n; i++) {
        ctx.save();
        ctx.strokeStyle = pal.accent;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let s = 0; s <= SAMPLES; s++) {
          const tt = s / SAMPLES;
          const x = X(tt);
          const y = Y(bernstein(n, i, tt));
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 세로 t-마커.
      ctx.save();
      ctx.strokeStyle = pal.text;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(t), Y(0));
      ctx.lineTo(X(t), Y(1));
      ctx.stroke();
      ctx.restore();

      // 마커 위 각 가중치 점(높이 = 해당 B_{i,n}(t)).
      for (let i = 0; i <= n; i++) {
        const w = bernstein(n, i, t);
        ctx.save();
        ctx.beginPath();
        ctx.arc(X(t), Y(w), 4, 0, Math.PI * 2);
        ctx.fillStyle = pal.accent;
        ctx.strokeStyle = pal.bg;
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // 축 라벨.
      ctx.save();
      ctx.fillStyle = pal.muted;
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('1', X(0) - 6, Y(1));
      ctx.fillText('0', X(0) - 6, Y(0));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('t=0', X(0), Y(0) + 6);
      ctx.fillText('t=1', X(1), Y(0) + 6);
      ctx.fillText(`t=${t.toFixed(2)}`, X(t), padT - 12 < 0 ? Y(0) + 6 : 2);
      ctx.restore();
    },
    [n, t],
  );

  const { canvasRef, wrapRef, redraw } = useBezierCanvas(noPoints, null, draw, { aspect: 1.8 });

  const handleT = (v: number) => {
    setT(v);
    redraw();
  };
  const handleDegree = (d: Degree) => {
    setDegree(d);
    redraw();
  };

  return (
    <figure className="demo">
      <div ref={wrapRef} className="demo-canvas">
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', touchAction: 'none' }} />
      </div>
      <ControlPanel>
        <SelectControl label="차수" value={degree} options={DEGREE_OPTIONS} onChange={handleDegree} />
        <Slider label="t" value={t} min={0} max={1} step={0.001} onChange={handleT} format={(v) => v.toFixed(3)} />
      </ControlPanel>
      <figcaption>
        쌓아 올린 띠 하나하나가 번스타인 기저 <code>B(i,n)(t)</code>입니다. 세로 마커를 <code>t</code>로
        옮기면 각 제어점의 <em>가중치</em>를 읽을 수 있고, 어느 <code>t</code>에서든 띠들의 높이 합은
        항상 1입니다(단위 분할). 곡선 위 점은 이 가중치로 제어점을 평균한 결과입니다.
      </figcaption>
    </figure>
  );
}
