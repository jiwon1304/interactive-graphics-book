import { useEffect, useRef } from 'react';

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
 * weight-stationary systolic MAC array의 데이터 흐름을 보여주는 정적 도식.
 * 입력이 왼쪽에서 들어와 한 클럭에 한 칸씩 전진하고, 부분합이 위에서 아래로 누적된다.
 * 대표 시점(clock 3 / 6, 파동이 그리드 한가운데를 지나는 순간)을 정지 화면으로 그려
 * 대각 wavefront가 잘 보이게 한다.
 * (NVIDIA 텐서 코어 내부 구조는 비공개 — 개념적 analogy로 TPU식 MAC array를 그림.)
 */
const N = 3; // 3x3 PE 그리드
const MAX_STEP = 2 * N; // 6
const STEP = 3; // 대표 시점: 파동이 한가운데
const W = 360;
const H = 300;

export default function MACArray() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const cell = 56;
      const gap = 14;
      const gridX = 96;
      const gridY = 64;
      const pe = (i: number, j: number) => ({
        x: gridX + j * (cell + gap),
        y: gridY + i * (cell + gap),
      });

      // PE 그리드. 각 PE는 정지된 weight w_ij + MAC. 활성(=입력 파동이 닿은) PE 강조.
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const { x, y } = pe(i, j);
          // 대각 파동: i + j == STEP 근방이 활성.
          const active = i + j === STEP;
          ctx.fillStyle = active ? col.accent : col.surface;
          ctx.strokeStyle = active ? col.accent : col.border;
          ctx.lineWidth = active ? 2.5 : 1;
          ctx.fillRect(x, y, cell, cell);
          ctx.strokeRect(x, y, cell, cell);
          // weight 라벨(정지).
          ctx.fillStyle = active ? col.surface : col.muted;
          ctx.font = '13px ui-monospace, monospace';
          ctx.fillText(`w${i}${j}`, x + 7, y + 18);
          // MAC 기호.
          ctx.fillStyle = active ? col.surface : col.text;
          ctx.font = 'bold 15px system-ui, sans-serif';
          ctx.fillText('×+', x + cell / 2 - 9, y + cell / 2 + 9);
        }
      }

      // 왼쪽: 입력 행 벡터(가로로 흘러 들어옴).
      for (let i = 0; i < N; i++) {
        const { y } = pe(i, 0);
        ctx.fillStyle = col.muted;
        ctx.font = '13px ui-monospace, monospace';
        ctx.fillText(`a${i}→`, gridX - 42, y + cell / 2 + 5);
      }
      // 위쪽: "weights stationary" 라벨.
      ctx.fillStyle = col.muted;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('weights 정지', gridX, gridY - 18);

      // 화살표 헬퍼.
      const drawFlow = (x1: number, y1: number, x2: number, y2: number) => {
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
      };

      // 아래: 부분합이 열 밑에서 빠져나옴(출력 c_j).
      const bottomY = gridY + N * (cell + gap) - gap;
      for (let j = 0; j < N; j++) {
        const { x } = pe(0, j);
        drawFlow(x + cell / 2, bottomY + 6, x + cell / 2, bottomY + 28);
        // STEP 3에서는 아직 출력이 나오지 않음 → muted.
        ctx.fillStyle = col.muted;
        ctx.font = '13px ui-monospace, monospace';
        ctx.fillText(`c${j}`, x + cell / 2 - 7, bottomY + 46);
      }

      // 상태 라벨(대표 시점).
      ctx.fillStyle = col.text;
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(`clock ${STEP} / ${MAX_STEP}`, W - 116, 24);
    };

    draw();
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{
            width: '100%',
            maxWidth: W,
            height: 'auto',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'block',
          }}
        />
      </div>
      <figcaption>
        텐서 코어가 행렬 한 블록을 한 번에 곱하는 방식의 개념도입니다(weight-stationary MAC
        array — NVIDIA 내부 구조는 비공개라 TPU식 데이터 흐름으로 그렸습니다). 격자의 각 칸(PE)에
        <strong>weight가 정지</strong>해 있고, 입력 <code>a</code>가 왼쪽에서 들어와 한 클럭에
        한 칸씩 전진합니다. 칸을 지날 때마다 곱하고(<code>×</code>) 더해(<code>+</code>) 부분합이
        <strong>아래로 누적</strong>되며, 열 밑에서 결과 <code>c</code>가 나옵니다. 그림은
        <strong>clock 3</strong>의 한 순간 — 활성 칸(파란색)이 좌상–우하 <strong>대각선</strong>으로
        늘어선 게 systolic 파동(wavefront)입니다. 이렇게 <strong>한 번 읽은 입력이 여러 MAC을
        먹여</strong>, 스칼라 FMA를 레인마다 따로 도는 것보다 훨씬 적은 읽기/명령으로 dense matmul을
        끝냅니다.
      </figcaption>
    </figure>
  );
}
