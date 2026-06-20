import { useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, label, roundRect, withAlpha, monoFont } from './dev2d';

// 드로우 콜 CPU 비용(인터랙티브). draw 수 슬라이더 → DX11 vs DX12/Vulkan 프레임 CPU 시간을
// 범주별(검증/상태·hazard/디스크립터/제출)로 누적 막대. 16.6ms(60fps) 예산선.
//
// directx-driver-internals의 DrawCallCost 재사용 — 둘째 막대를 "DX12 / Vulkan"으로 묶었다(둘은
// 같은 explicit 모델이라 per-draw 비용 구조가 사실상 같다). 대표 차수의 도식용 모델(특정 드라이버
// 측정 아님): 핵심은 절대값이 아니라 per-draw 합과 기울기.

const CATS = [
  { key: '검증', c: COLORS.validate, dx11: 180, lo: 30 },
  { key: '상태·hazard', c: COLORS.state, dx11: 340, lo: 25 },
  { key: '디스크립터', c: COLORS.descriptor, dx11: 240, lo: 15 },
  { key: '제출(amortized)', c: COLORS.submit, dx11: 140, lo: 30 },
]; // ns/draw

const BUDGET_MS = 16.6;

export default function DrawCallCost() {
  const [draws, setDraws] = useState(12000);

  const totals = (which: 'dx11' | 'lo') =>
    CATS.reduce((s, c) => s + c[which] * draws, 0) / 1e6; // ms

  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;
    const pad = 12;
    const leftW = 64;
    const barX = pad + leftW;
    const barMaxW = w - barX - pad - 64;
    const dx11ms = totals('dx11');
    const loMs = totals('lo');
    const scaleMax = Math.max(dx11ms, BUDGET_MS) * 1.08;
    const msToPx = barMaxW / scaleMax;

    const barH = 36;
    const drawBar = (
      y: number,
      name: string,
      nameC: string,
      which: 'dx11' | 'lo',
      totalMs: number,
    ) => {
      label(ctx, pad + leftW / 2 - 2, y + barH / 2, name, nameC, 11, 'bold');
      let x = barX;
      CATS.forEach((c) => {
        const segMs = (c[which] * draws) / 1e6;
        const segW = segMs * msToPx;
        if (segW < 0.5) return;
        roundRect(ctx, x, y, Math.max(1, segW - 1), barH, 3);
        ctx.fillStyle = withAlpha(c.c, 0.85);
        ctx.fill();
        x += segW;
      });
      // 총합
      ctx.font = monoFont(12, 'bold');
      ctx.fillStyle = totalMs > BUDGET_MS ? COLORS.submit : theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${totalMs.toFixed(1)}ms`, barX + totalMs * msToPx + 6, y + barH / 2);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'start';
    };

    drawBar(26, 'DX11', COLORS.dx11, 'dx11', dx11ms);
    drawBar(26 + barH + 28, 'DX12/Vk', COLORS.dx12, 'lo', loMs);

    // 예산선 16.6ms
    const bx = barX + BUDGET_MS * msToPx;
    ctx.strokeStyle = COLORS.submit;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx, 16);
    ctx.lineTo(bx, 26 + barH * 2 + 28 + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, bx, 9, '16.6ms (60fps)', COLORS.submit, 9, 'bold');

    // 범례
    const ly = 26 + barH * 2 + 28 + 24;
    let lx = barX;
    ctx.font = monoFont(10);
    CATS.forEach((c) => {
      ctx.fillStyle = withAlpha(c.c, 0.85);
      roundRect(ctx, lx, ly - 8, 12, 12, 3);
      ctx.fill();
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.key, lx + 16, ly - 1);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'start';
      lx += 16 + ctx.measureText(c.key).width + 16;
    });
  };

  const { ref } = useCanvas2d(draw, [draws]);
  const dx11ms = totals('dx11');
  const loMs = totals('lo');

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 220, display: 'block' }} />
      <ControlPanel>
        <Slider
          label="draw call 수 / 프레임"
          value={draws}
          min={1000}
          max={50000}
          step={500}
          onChange={setDraws}
          format={(v) => `${(v / 1000).toFixed(1)}k`}
        />
      </ControlPanel>
      <figcaption>
        프레임당 draw 수를 늘리며 CPU 시간이 어디에 쓰이는지 보세요(도식용 대표 차수 — 절대값이 아니라
        구성과 기울기가 요점입니다). DX11의 draw당 비용은 <span style={{ color: COLORS.state }}>상태·hazard
        tracking</span>과 <span style={{ color: COLORS.descriptor }}>디스크립터 패치</span>가 큰 비중을
        차지합니다 — 드라이버가 매 draw마다 바인딩을 검사·변환하기 때문입니다.{' '}
        <span style={{ color: COLORS.dx12 }}>DX12와 Vulkan</span>은 이 일들을 PSO / VkPipeline 생성
        시점(프레임 밖)으로 옮기고 descriptor heap·root signature / descriptor set으로 패치를 없애, draw당
        비용이 거의 제출만 남습니다(둘 다 같은 explicit 모델이라 한 막대로 묶었습니다). 그래서 draw가
        많아질수록 DX11은 <span style={{ color: COLORS.submit }}>16.6ms 예산</span>을 먼저 넘고(현재 DX11{' '}
        {dx11ms.toFixed(1)}ms vs DX12/Vk {loMs.toFixed(1)}ms), explicit API는 같은 장면을 한참 더 끌고
        갑니다. DX12·Vulkan이 “빠르다”는 건 GPU가 아니라 <strong>이 CPU 제출 오버헤드</strong>가
        얇아졌다는 뜻입니다 — Mantle이 처음 보여준 바로 그 이득입니다.
      </figcaption>
    </figure>
  );
}
