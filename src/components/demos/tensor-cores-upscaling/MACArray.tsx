import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return {
    text: cs.getPropertyValue('--text').trim() || '#222',
    muted: cs.getPropertyValue('--muted').trim() || '#888',
    border: cs.getPropertyValue('--border').trim() || '#ccc',
    accent: cs.getPropertyValue('--accent').trim() || '#4f9dde',
    surface: cs.getPropertyValue('--surface').trim() || '#fff',
  };
}

/**
 * weight-stationary systolic MAC array의 데이터 흐름을 단계(step)별로 보여준다.
 * 과정: 입력이 왼쪽에서 들어와 한 클럭에 한 칸씩 전진하고, 부분합이 위에서 아래로
 * 누적되며 내려간다. step 슬라이더로 "한 클럭씩" 진행하는 systolic 파동을 본다.
 * (NVIDIA 텐서 코어 내부 구조는 비공개 — 개념적 analogy로 TPU식 MAC array를 그림.)
 */
const N = 3; // 3x3 PE 그리드

export default function MACArray() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState(0);
  const maxStep = 2 * N; // 입력이 그리드를 통과하는 데 걸리는 클럭 수 대략

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 460;
      const cssH = 300;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const cell = 56;
      const gap = 14;
      const gridX = 120;
      const gridY = 56;
      const pe = (i: number, j: number) => ({
        x: gridX + j * (cell + gap),
        y: gridY + i * (cell + gap),
      });

      // PE 그리드. 각 PE는 정지된 weight w_ij + MAC. 활성(=입력 파동이 닿은) PE 강조.
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const { x, y } = pe(i, j);
          // 입력은 j번째 열에 (step - j) 시점에 도착, 부분합은 i행을 따라 내려옴.
          // 활성 조건: 대각 파동 (i + j == step 근방)
          const active = i + j === step;
          const passed = i + j < step;
          ctx.fillStyle = active ? col.accent : passed ? col.surface : col.surface;
          ctx.strokeStyle = active ? col.accent : col.border;
          ctx.lineWidth = active ? 2.5 : 1;
          ctx.fillRect(x, y, cell, cell);
          ctx.strokeRect(x, y, cell, cell);
          // weight 라벨(정지).
          ctx.fillStyle = active ? col.surface : col.muted;
          ctx.font = '11px ui-monospace, monospace';
          ctx.fillText(`w${i}${j}`, x + 6, y + 16);
          // MAC 기호.
          ctx.fillStyle = active ? col.surface : col.text;
          ctx.font = 'bold 13px system-ui, sans-serif';
          ctx.fillText('×+', x + cell / 2 - 8, y + cell / 2 + 8);
        }
      }

      // 왼쪽: 입력 행 벡터(가로로 흘러 들어옴).
      ctx.fillStyle = col.text;
      ctx.font = '11px system-ui, sans-serif';
      for (let i = 0; i < N; i++) {
        const { y } = pe(i, 0);
        ctx.fillStyle = col.muted;
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText(`a${i}→`, gridX - 36, y + cell / 2 + 4);
      }
      // 위쪽: "weights stationary" 라벨.
      ctx.fillStyle = col.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('weights 정지', gridX, gridY - 16);

      // 화살표: 입력은 →(가로), 부분합은 ↓(세로) 흐름. 한 쌍만 대표로.
      const drawFlow = (x1: number, y1: number, x2: number, y2: number, label: string) => {
        ctx.strokeStyle = col.accent;
        ctx.fillStyle = col.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const a = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 7 * Math.cos(a - 0.4), y2 - 7 * Math.sin(a - 0.4));
        ctx.lineTo(x2 - 7 * Math.cos(a + 0.4), y2 - 7 * Math.sin(a + 0.4));
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = col.muted;
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(label, (x1 + x2) / 2 - 10, (y1 + y2) / 2 - 4);
      };

      // 아래: 부분합이 열 밑에서 빠져나옴(출력 c_j).
      const bottomY = gridY + N * (cell + gap) - gap;
      for (let j = 0; j < N; j++) {
        const { x } = pe(0, j);
        drawFlow(x + cell / 2, bottomY + 6, x + cell / 2, bottomY + 30, '');
        const done = step > N - 1 + j;
        ctx.fillStyle = done ? col.accent : col.muted;
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText(`c${j}`, x + cell / 2 - 6, bottomY + 46);
      }

      // 단계 설명(캔버스 밖 캡션이 본문, 여기선 짧은 상태만).
      ctx.fillStyle = col.text;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(`clock ${step} / ${maxStep}`, cssW - 110, 22);
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
  }, [step, maxStep]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        style={{
          width: '100%',
          borderRadius: 10,
          border: '1px solid var(--border)',
          touchAction: 'none',
          display: 'block',
        }}
      />
      <ControlPanel>
        <Slider label="clock" value={step} min={0} max={maxStep} step={1} onChange={setStep} />
      </ControlPanel>
      <figcaption>
        텐서 코어가 행렬 한 블록을 한 번에 곱하는 방식의 개념도입니다(weight-stationary MAC
        array — NVIDIA 내부 구조는 비공개라 TPU식 데이터 흐름으로 그렸습니다). 격자의 각 칸(PE)에
        <strong>weight가 정지</strong>해 있고, 입력 <code>a</code>가 왼쪽에서 들어와 한 클럭에
        한 칸씩 전진합니다. 칸을 지날 때마다 곱하고(<code>×</code>) 더해(<code>+</code>) 부분합이
        <strong>아래로 누적</strong>되며, 열 밑에서 결과 <code>c</code>가 나옵니다. clock을 밀어
        대각 파동이 그리드를 휩쓰는 걸 보세요 — <strong>한 번 읽은 입력이 여러 MAC을 먹여</strong>,
        스칼라 FMA를 레인마다 따로 도는 것보다 훨씬 적은 읽기/명령으로 dense matmul을 끝냅니다.
      </figcaption>
    </figure>
  );
}
