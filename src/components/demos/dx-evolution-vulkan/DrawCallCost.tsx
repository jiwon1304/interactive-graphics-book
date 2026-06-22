import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, label, roundRect, withAlpha, monoFont } from './dev2d';

// 드로우 콜 CPU 비용(정적). 대표 draw 수에서 DX11 vs DX12/Vulkan 프레임 CPU 시간을
// 범주별(검증/상태·hazard/디스크립터/제출)로 누적 막대. 16.6ms(60fps) 예산선.
//
// directx-driver-internals의 DrawCallCost 재사용 — 둘째 막대를 "DX12 / Vulkan"으로 묶었다(둘은
// 같은 explicit 모델이라 per-draw 비용 구조가 사실상 같다). 대표 차수의 도식용 모델(특정 드라이버
// 측정 아님): 핵심은 절대값이 아니라 per-draw 합과 기울기. DX11이 예산을 넘는 대표 상태(20k draw)를
// 한 컷으로 고정해 보여준다.

const CATS = [
  { key: '검증', c: COLORS.validate, dx11: 180, lo: 30 },
  { key: '상태·hazard', c: COLORS.state, dx11: 340, lo: 25 },
  { key: '디스크립터', c: COLORS.descriptor, dx11: 240, lo: 15 },
  { key: '제출', c: COLORS.submit, dx11: 140, lo: 30 },
]; // ns/draw

const BUDGET_MS = 16.6;
const DRAWS = 20000; // 대표 draw 수: DX11이 예산을 넘고 DX12/Vk는 한참 여유 있는 지점

export default function DrawCallCost() {
  const total = (which: 'dx11' | 'lo') =>
    CATS.reduce((s, c) => s + c[which] * DRAWS, 0) / 1e6; // ms

  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;
    const pad = 12;
    const leftW = 56;
    const barX = pad + leftW;
    const barMaxW = w - barX - pad - 52;
    const dx11ms = total('dx11');
    const loMs = total('lo');
    const scaleMax = Math.max(dx11ms, BUDGET_MS) * 1.08;
    const msToPx = barMaxW / scaleMax;

    const barH = 40;
    const top = 30;
    const gap = 30;

    const drawBar = (
      y: number,
      name: string,
      nameC: string,
      which: 'dx11' | 'lo',
      totalMs: number,
    ) => {
      label(ctx, pad + leftW / 2, y + barH / 2, name, nameC, 13, 'bold');
      let x = barX;
      CATS.forEach((c) => {
        const segMs = (c[which] * DRAWS) / 1e6;
        const segW = segMs * msToPx;
        if (segW < 0.5) return;
        roundRect(ctx, x, y, Math.max(1, segW - 1), barH, 3);
        ctx.fillStyle = withAlpha(c.c, 0.85);
        ctx.fill();
        x += segW;
      });
      // 총합
      ctx.font = monoFont(13, 'bold');
      ctx.fillStyle = totalMs > BUDGET_MS ? COLORS.submit : theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${totalMs.toFixed(1)}ms`, barX + totalMs * msToPx + 6, y + barH / 2);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'start';
    };

    drawBar(top, 'DX11', COLORS.dx11, 'dx11', dx11ms);
    drawBar(top + barH + gap, 'DX12/Vk', COLORS.dx12, 'lo', loMs);

    // 예산선 16.6ms
    const bx = barX + BUDGET_MS * msToPx;
    ctx.strokeStyle = COLORS.submit;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx, top - 12);
    ctx.lineTo(bx, top + barH * 2 + gap + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, bx, top - 20, '16.6ms (60fps)', COLORS.submit, 12, 'bold');

    // 범례 (세로로 2열 배치, draw 수 라벨 포함)
    const ly = top + barH * 2 + gap + 30;
    ctx.font = monoFont(12, 'bold');
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${(DRAWS / 1000).toFixed(0)}k draw / 프레임`, barX, ly);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'start';

    let lx = barX;
    let lrow = ly + 22;
    ctx.font = monoFont(12);
    CATS.forEach((c) => {
      const labW = 18 + ctx.measureText(c.key).width + 14;
      if (lx + labW > barX + barMaxW + 52) {
        lx = barX;
        lrow += 20;
      }
      ctx.fillStyle = withAlpha(c.c, 0.85);
      roundRect(ctx, lx, lrow - 8, 14, 14, 3);
      ctx.fill();
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.key, lx + 18, lrow);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'start';
      lx += labW;
    });
  };

  const { ref } = useCanvas2d(draw, []);
  const dx11ms = total('dx11');
  const loMs = total('lo');

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ width: '100%', maxWidth: 400, minWidth: 0, height: 260, display: 'block' }}
      />
      <figcaption>
        프레임당 {(DRAWS / 1000).toFixed(0)}k draw에서 CPU 시간이 어디에 쓰이는지 한 컷으로(도식용 대표
        차수 — 절대값이 아니라 구성과 기울기가 요점입니다). DX11의 draw당 비용은{' '}
        <span style={{ color: COLORS.state }}>상태·hazard tracking</span>과{' '}
        <span style={{ color: COLORS.descriptor }}>디스크립터 패치</span>가 큰 비중을 차지합니다 —
        드라이버가 매 draw마다 바인딩을 검사·변환하기 때문입니다.{' '}
        <span style={{ color: COLORS.dx12 }}>DX12와 Vulkan</span>은 이 일들을 PSO / VkPipeline 생성
        시점(프레임 밖)으로 옮기고 descriptor heap·root signature / descriptor set으로 패치를 없애, draw당
        비용이 거의 제출만 남습니다(둘 다 같은 explicit 모델이라 한 막대로 묶었습니다). 그래서 같은 draw
        수에서 DX11은 <span style={{ color: COLORS.submit }}>16.6ms 예산</span>을 먼저 넘고(DX11{' '}
        {dx11ms.toFixed(1)}ms vs DX12/Vk {loMs.toFixed(1)}ms), explicit API는 같은 장면을 한참 더 끌고
        갑니다. DX12·Vulkan이 “빠르다”는 건 GPU가 아니라 <strong>이 CPU 제출 오버헤드</strong>가
        얇아졌다는 뜻입니다 — Mantle이 처음 보여준 바로 그 이득입니다.
      </figcaption>
    </figure>
  );
}
