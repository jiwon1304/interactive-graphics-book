import { useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, label, roundRect, withAlpha, monoFont, drawArrow } from './dcj2d';

// 제출당 draw 수를 슬라이더로 올리면 커널 전환(user→kernel)이 분할 상환되는 과정.
// 고정 프레임 draw 수(=DRAWS) 안에서 "제출당 draw 수"를 키우면 제출 횟수가 줄고,
// 그래서 총 커널 전환 비용과 draw당 커널 비용이 줄어든다. 위쪽: 제출 묶음 시각화(칸).
// 아래: 제출 횟수 / draw당 커널 비용 두 막대. 도식용 대표값(절대값 아님, 관계가 요점).

const DRAWS = 4096; // 한 프레임의 draw 수(고정)
const KERNEL_NS = 8000; // 제출 1회당 user→kernel 전환 대표 비용(ns)
const RECORD_NS = 250; // draw 1개 기록(user 변환) 대표 비용(ns)

export default function RecordVsSubmit() {
  const [perSubmit, setPerSubmit] = useState(256);

  const submits = Math.ceil(DRAWS / perSubmit);
  const kernelTotalUs = (submits * KERNEL_NS) / 1000;
  const recordTotalUs = (DRAWS * RECORD_NS) / 1000;
  const kernelPerDrawNs = (submits * KERNEL_NS) / DRAWS;

  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;
    const pad = 12;

    // --- 위: 제출 묶음 시각화 ---
    // DRAWS개의 draw를 perSubmit씩 묶은 칸들. 칸 = 1회 제출.
    const topY = 16;
    const topH = 48;
    const trackX = pad;
    const trackW = w - pad * 2;
    label(ctx, pad, topY - 4, `한 프레임 ${DRAWS} draws를 ${submits}회로 제출`, theme.muted, 11, 'bold');
    // 칸들 (너무 많으면 비례 폭으로, 칸 테두리만)
    const cell = trackW / submits;
    for (let i = 0; i < submits; i++) {
      const x = trackX + i * cell;
      roundRect(ctx, x + 0.5, topY + 8, Math.max(1, cell - 1.5), topH, 3);
      ctx.fillStyle = withAlpha(COLORS.umd, 0.18);
      ctx.fill();
      if (cell > 6) {
        ctx.strokeStyle = withAlpha(COLORS.umd, 0.9);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // 각 칸 위에 제출(빨강 화살표) — 칸이 충분히 넓을 때만
      if (cell > 26 && submits <= 24) {
        drawArrow(ctx, x + cell / 2, topY + 8 - 1, x + cell / 2, topY + 8 - 9, COLORS.submit, 1.4, 5);
      }
    }
    // 묶음 = 제출 1회 범례
    label(ctx, trackX + trackW / 2, topY + 8 + topH + 12, '칸 1개 = command buffer 1개 = 제출 1회 = 커널 전환 1회', theme.muted, 9, 'bold');

    // --- 아래: 두 막대 ---
    const barX = pad + 86;
    const barMaxW = w - barX - pad - 64;
    const baseY = topY + 8 + topH + 34;
    const barH = 26;

    // 기준 스케일: perSubmit=1(최악, 제출=DRAWS회)일 때의 커널 비용을 기준 max로.
    const kernelWorstUs = (DRAWS * KERNEL_NS) / 1000;
    const totalWorstUs = kernelWorstUs + recordTotalUs;
    const usToPx = barMaxW / (totalWorstUs * 1.02);

    // 막대 1: 이번 프레임 CPU = 기록(고정) + 커널(가변)
    const recordPx = recordTotalUs * usToPx;
    const kernelPx = kernelTotalUs * usToPx;
    label(ctx, pad, baseY + barH / 2, 'CPU/프레임', theme.muted, 10, 'bold');
    roundRect(ctx, barX, baseY, Math.max(1, recordPx), barH, 3);
    ctx.fillStyle = withAlpha(COLORS.umd, 0.85);
    ctx.fill();
    roundRect(ctx, barX + recordPx, baseY, Math.max(1, kernelPx), barH, 3);
    ctx.fillStyle = withAlpha(COLORS.submit, 0.85);
    ctx.fill();
    ctx.font = monoFont(11, 'bold');
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${(recordTotalUs + kernelTotalUs).toFixed(0)}µs`, barX + recordPx + kernelPx + 6, baseY + barH / 2);
    ctx.textBaseline = 'alphabetic';

    // 범례
    const ly = baseY + barH + 22;
    const legend: Array<[string, string]> = [
      ['기록(user 변환, 고정)', COLORS.umd],
      ['커널 전환(제출 × 전환비용)', COLORS.submit],
    ];
    let lx = barX;
    let lyCur = ly;
    ctx.font = monoFont(10);
    legend.forEach(([t, c]) => {
      const need = 16 + ctx.measureText(t).width + 18;
      if (lx + need > w - pad) {
        lx = barX;
        lyCur += 16;
      }
      roundRect(ctx, lx, lyCur - 8, 12, 12, 3);
      ctx.fillStyle = withAlpha(c, 0.85);
      ctx.fill();
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, lx + 16, lyCur - 1);
      ctx.textBaseline = 'alphabetic';
      lx += need;
    });

    // draw당 커널 비용 표시
    label(
      ctx,
      w / 2,
      lyCur + 20,
      `draw당 커널 비용 ≈ ${kernelPerDrawNs.toFixed(0)} ns  (제출 ${submits}회)`,
      kernelPerDrawNs > 40 ? COLORS.submit : COLORS.dx12,
      12,
      'bold',
    );
  };

  const { ref } = useCanvas2d(draw, [perSubmit]);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 240, display: 'block' }} />
      <ControlPanel>
        <Slider
          label="제출당 draw 수"
          value={perSubmit}
          min={1}
          max={1024}
          step={1}
          onChange={setPerSubmit}
          format={(v) => `${v}`}
        />
      </ControlPanel>
      <figcaption>
        한 프레임에 그릴 draw 수는 {DRAWS}개로 고정하고, <strong>제출당 draw 수</strong>만 바꿔 보세요(도식용
        대표값). 슬라이더를 왼쪽 끝(=1)에 두면 draw마다 command buffer를 닫고 커널로 내려가
        <strong> {DRAWS}번의 user→kernel 전환</strong>이 일어나, 비싼 빨강(커널) 부분이 막대를 가득 채웁니다.
        오른쪽으로 갈수록 한 번의 제출이 더 많은 draw를 담아 제출 횟수가 {submits}회로 떨어지고, 그만큼{' '}
        <span style={{ color: COLORS.submit }}>커널 전환 총비용</span>과 <strong>draw당 커널 비용</strong>이
        급격히 줄어듭니다. 기록(user 변환) 비용은 draw 수에 비례하므로 고정입니다. 이것이 1편에서 본
        “비동기·배치”의 비용 측면이고, Vulkan 문서가 “submission can be a high overhead operation … batch
        work into as few calls to <code>vkQueueSubmit</code> as possible”이라고 못 박는 이유입니다.
      </figcaption>
    </figure>
  );
}
