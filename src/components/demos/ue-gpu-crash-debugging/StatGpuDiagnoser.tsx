import { useMemo, useState } from 'react';
import { ControlPanel, SelectControl, Slider, type SelectOption } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { UE_COLORS, roundRect, withAlpha, monoFont } from './ue2d';

// ---------------------------------------------------------------------------
// 모델: Stat GPU — Busy / Wait / Idle 진단 (Luke Thatcher (Epic) 발표)
//
// 각 GPU 큐(그래픽스/컴퓨트)의 시간은 Busy / Wait / Idle로 쪼개진다.
// 발표의 진단 규칙:
//  - 그래픽스 큐의 Wait이 크면 → 문제 (큐가 무언가를 기다림).
//  - 컴퓨트 큐의 Wait → 정상 (AsyncCompute는 wait이 자연스러움).
//  - Idle > 0 → CPU bound (CPU가 일감을 못 대줘 GPU가 굶음).
// 사용자는 프리셋을 고르거나 슬라이더로 비율을 직접 조정해 진단을 도출한다.
// ---------------------------------------------------------------------------

const CANVAS_H = 300;

// 0..100 비율. graphicsWait/graphicsIdle만 조절, Busy는 100-Wait-Idle로 도출.
interface Mix {
  gWait: number;
  gIdle: number;
  cWait: number;
  cIdle: number;
}

type Scenario = 'normal' | 'gwait' | 'cwait' | 'idle' | 'custom';

const PRESETS: Record<Exclude<Scenario, 'custom'>, Mix> = {
  // 정상(GPU bound): 그래픽스 거의 busy, wait/idle 작음.
  normal: { gWait: 8, gIdle: 0, cWait: 25, cIdle: 0 },
  // 그래픽스 Wait 큼(문제).
  gwait: { gWait: 45, gIdle: 0, cWait: 20, cIdle: 0 },
  // 컴퓨트 Wait(정상).
  cwait: { gWait: 6, gIdle: 0, cWait: 55, cIdle: 0 },
  // Idle>0 (CPU bound).
  idle: { gWait: 10, gIdle: 35, cWait: 15, cIdle: 30 },
};

const SCENARIO_OPTIONS: ReadonlyArray<SelectOption<Scenario>> = [
  { value: 'normal', label: '정상 (GPU bound)' },
  { value: 'gwait', label: '그래픽스 Wait 큼 (문제)' },
  { value: 'cwait', label: '컴퓨트 Wait (정상)' },
  { value: 'idle', label: 'Idle>0 (CPU bound)' },
  { value: 'custom', label: '직접 조정' },
];

interface Verdict {
  text: string;
  color: string;
}

/** 발표의 규칙으로 숫자에서 결론을 도출한다. */
function diagnose(m: Mix): Verdict {
  // Idle이 우선 신호: 큐 중 하나라도 Idle이 의미 있게 크면 CPU bound.
  if (m.gIdle >= 12 || m.cIdle >= 12) {
    return {
      text: 'Idle > 0 → CPU bound: CPU가 일감을 못 대줘 GPU가 굶고 있습니다.',
      color: UE_COLORS.stall,
    };
  }
  // 그래픽스 Wait이 크면 문제.
  if (m.gWait >= 25) {
    return {
      text: '⚠ 그래픽스 큐 Wait이 큽니다 → 문제: 큐가 무언가(펜스/리소스)를 기다리는 중.',
      color: UE_COLORS.bad,
    };
  }
  // 컴퓨트 Wait은 커도 정상.
  if (m.cWait >= 25) {
    return {
      text: '컴퓨트 Wait이 큽니다 → 정상: AsyncCompute는 그래픽스를 기다리는 게 자연스럽습니다.',
      color: UE_COLORS.ok,
    };
  }
  return {
    text: '정상 (GPU bound): 그래픽스가 대부분 Busy, Wait·Idle이 작습니다.',
    color: UE_COLORS.ok,
  };
}

export default function StatGpuDiagnoser() {
  const [scenario, setScenario] = useState<Scenario>('gwait');
  const [custom, setCustom] = useState<Mix>(PRESETS.normal);

  const mix: Mix = scenario === 'custom' ? custom : PRESETS[scenario];
  const verdict = useMemo(() => diagnose(mix), [mix]);

  // 비율 정규화(Busy = 100 - Wait - Idle, 음수면 클램프).
  const gBusy = Math.max(0, 100 - mix.gWait - mix.gIdle);
  const cBusy = Math.max(0, 100 - mix.cWait - mix.cIdle);

  // 슬라이더 조작 시 custom 모드로 전환.
  const editMix = (patch: Partial<Mix>): void => {
    const base = scenario === 'custom' ? custom : PRESETS[scenario];
    setCustom({ ...base, ...patch });
    setScenario('custom');
  };

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 16;
    const labelW = 78;
    const plotX = padX + labelW;
    const plotW = w - plotX - padX;

    const barH = 38;
    const top = 26;
    const rowGap = 30;

    // 범례
    ctx.font = monoFont(10);
    ctx.textBaseline = 'middle';
    const legend: Array<{ c: string; t: string }> = [
      { c: UE_COLORS.graphics, t: 'Busy' },
      { c: UE_COLORS.stall, t: 'Wait' },
      { c: withAlpha(theme.muted, 0.5), t: 'Idle' },
    ];
    let lx = plotX;
    for (const item of legend) {
      ctx.fillStyle = item.c;
      roundRect(ctx, lx, 8, 12, 12, 3);
      ctx.fill();
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.fillText(item.t, lx + 17, 14);
      lx += 17 + ctx.measureText(item.t).width + 16;
    }

    // 한 큐의 스택 막대를 그린다.
    const drawQueue = (
      name: string,
      y: number,
      busy: number,
      wait: number,
      idle: number,
      waitIsBad: boolean,
    ): void => {
      ctx.font = monoFont(11);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, plotX - 8, y + barH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // 배경 트랙
      roundRect(ctx, plotX, y, plotW, barH, 6);
      ctx.fillStyle = withAlpha(theme.border, 0.25);
      ctx.fill();

      const segs: Array<{ frac: number; color: string; label: string }> = [
        { frac: busy / 100, color: UE_COLORS.graphics, label: 'Busy' },
        {
          frac: wait / 100,
          // 그래픽스 Wait은 빨강(문제), 컴퓨트 Wait은 주황(정상이지만 wait).
          color: waitIsBad && wait >= 25 ? UE_COLORS.bad : UE_COLORS.stall,
          label: 'Wait',
        },
        { frac: idle / 100, color: withAlpha(theme.muted, 0.45), label: 'Idle' },
      ];
      let x = plotX;
      for (const s of segs) {
        const sw = s.frac * plotW;
        if (sw <= 0.5) continue;
        ctx.save();
        roundRect(ctx, plotX, y, plotW, barH, 6);
        ctx.clip();
        ctx.fillStyle = s.color;
        ctx.fillRect(x, y, sw, barH);
        ctx.restore();
        // 세그먼트 라벨(폭 충분할 때만)
        if (sw > 34) {
          ctx.font = monoFont(10);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            `${s.label} ${Math.round(s.frac * 100)}`,
            x + sw / 2,
            y + barH / 2,
          );
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
        }
        x += sw;
      }

      roundRect(ctx, plotX, y, plotW, barH, 6);
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    drawQueue('그래픽스 큐', top, gBusy, mix.gWait, mix.gIdle, true);
    drawQueue('컴퓨트 큐', top + barH + rowGap, cBusy, mix.cWait, mix.cIdle, false);

    // --- 진단 결론 배너 ---
    const bannerY = top + (barH + rowGap) * 2 + 4;
    const bannerH = h - bannerY - 10;
    if (bannerH > 16) {
      roundRect(ctx, padX, bannerY, w - padX * 2, bannerH, 7);
      ctx.fillStyle = withAlpha(verdict.color, 0.14);
      ctx.fill();
      ctx.strokeStyle = withAlpha(verdict.color, 0.7);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = monoFont(10.5);
      ctx.fillStyle = verdict.color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      // 긴 진단 텍스트 줄바꿈
      const words = verdict.text.split(' ');
      const maxW = w - padX * 2 - 20;
      const lines: string[] = [];
      let cur = '';
      for (const word of words) {
        const test = cur ? `${cur} ${word}` : word;
        if (ctx.measureText(test).width > maxW && cur) {
          lines.push(cur);
          cur = word;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
      const lineH = 15;
      const startY = bannerY + bannerH / 2 - ((lines.length - 1) * lineH) / 2;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], padX + 10, startY + i * lineH);
      }
      ctx.textBaseline = 'alphabetic';
    }
  };

  const { ref } = useCanvas2d(draw, [mix, verdict, gBusy, cBusy]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block' }}
      />
      <ControlPanel>
        <SelectControl<Scenario>
          label="시나리오"
          value={scenario}
          options={SCENARIO_OPTIONS}
          onChange={setScenario}
        />
        <Slider
          label="그래픽스 Wait"
          value={mix.gWait}
          min={0}
          max={80}
          step={1}
          onChange={(v) => editMix({ gWait: v })}
          format={(v) => `${v}%`}
        />
        <Slider
          label="그래픽스 Idle"
          value={mix.gIdle}
          min={0}
          max={60}
          step={1}
          onChange={(v) => editMix({ gIdle: v })}
          format={(v) => `${v}%`}
        />
        <Slider
          label="컴퓨트 Wait"
          value={mix.cWait}
          min={0}
          max={80}
          step={1}
          onChange={(v) => editMix({ cWait: v })}
          format={(v) => `${v}%`}
        />
      </ControlPanel>
      <figcaption>
        <strong>Stat GPU</strong>는 각 큐의 시간을 <strong>Busy / Wait / Idle</strong>로 쪼개
        보여줍니다 (Luke Thatcher (Epic) 발표). 핵심 진단 규칙은 직관적이지 않습니다 —{' '}
        <strong>그래픽스 큐의 Wait이 크면 문제</strong>입니다(메인 큐가 펜스나 리소스를 기다리며
        멈춰 있다는 뜻). 반대로 <strong>컴퓨트 큐의 Wait은 정상</strong>입니다: AsyncCompute는
        그래픽스 큐의 결과를 기다리도록 설계됐으니까요. 그리고 어느 큐든{' '}
        <strong>Idle &gt; 0이면 CPU bound</strong> — GPU가 다 처리했는데 CPU가 다음 일감을 못 만들어
        GPU가 굶고 있는 상황입니다.
        <br />
        <strong>직접 해보세요:</strong> 시나리오를 바꿔 막대 구성과 결론이 어떻게 달라지는지 보세요.
        그다음 슬라이더로 직접 비율을 움직여 보세요 — "그래픽스 Wait"을 키우면 빨간 경고가 뜨지만,
        같은 양을 "컴퓨트 Wait"에 줘도 정상으로 판정됩니다. "Idle"을 올리면 CPU bound로 바뀝니다.
      </figcaption>
    </figure>
  );
}
