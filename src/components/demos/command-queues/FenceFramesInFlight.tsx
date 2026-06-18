import { useEffect, useMemo, useRef, useState } from 'react';
import { ControlPanel, Slider, SelectControl, ToggleControl } from '../../controls';
import type { SelectOption } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { QUEUE_COLORS, roundRect, withAlpha, drawArrow } from './cq2d';

// ---------------------------------------------------------------------------
// 모델: 프레임 인플라이트(frames in flight) + 펜스(fence)
//
// CPU는 프레임 k(=0,1,2,…)를 cpuTime ms 동안 "기록"하고, GPU는 같은 프레임을
// gpuTime ms 동안 "실행"한다. 둘은 병렬로 흐르며 디커플링되어 있다.
//
// 핵심 규칙(정확해야 함):
//  - 프레임 k는 슬롯 (k mod N)의 프레임별 리소스에 기록된다.
//  - CPU가 프레임 k 기록을 "시작"하려면, 그 슬롯을 이전에 쓴 프레임 k−N을
//    GPU가 끝냈어야 한다. 즉 fence ≥ (k−N)+1 = k−N+1 이어야 한다.
//    (k < N 이면 슬롯이 처음 쓰이므로 대기 없음.)
//  - GPU는 프레임을 순서대로 실행한다. 프레임 k를 시작하려면
//    (1) CPU가 프레임 k 기록을 끝냈고 (2) GPU가 프레임 k−1을 끝냈어야 한다.
//  - 펜스(fence): GPU가 프레임 k를 끝낼 때 fence = k+1 로 올린다(완료 프레임 수).
//
// 이 규칙에서 자연히:
//  - N=1: CPU와 GPU가 핑퐁(둘 다 절반은 논다).
//  - N=2~3, cpuTime≈gpuTime: 두 레인이 거의 꽉 참(겹침! → 더블/트리플 버퍼링의 이유).
//  - cpuTime≪gpuTime(GPU-bound): CPU가 버퍼 N개를 채운 뒤 펜스에서 STALL,
//    레이턴시가 N으로 자란다.
//  - cpuTime≫gpuTime(CPU-bound): GPU가 굶는다(N과 무관).
// ---------------------------------------------------------------------------

/** CPU/GPU가 처리한 프레임 한 블록(start~end, ms). stall이면 대기 구간. */
interface Block {
  frame: number; // 어떤 프레임인지
  start: number; // ms
  end: number; // ms
  stall: boolean; // true면 "대기(idle)" 구간
}

interface SimResult {
  cpu: Block[];
  gpu: Block[];
  fence: number; // 현재 펜스 값(완료 프레임 수)
  /** 각 프레임의 (CPU 기록 끝 시각, GPU 실행 끝 시각) — 레이턴시·화살표용 */
  cpuRecEnd: number[];
  gpuExecEnd: number[];
  cpuBusy: number; // CPU가 실제 기록한 누적 ms
  gpuBusy: number; // GPU가 실제 실행한 누적 ms
  cpuStall: number; // CPU 대기 누적 ms
  gpuStall: number; // GPU 대기 누적 ms
}

/**
 * 결정론적 이벤트 시뮬레이션을 horizon(ms)까지 돌려 블록 목록을 만든다.
 * CPU와 GPU 각각의 "다음 자유 시각"을 추적하며 프레임을 하나씩 스케줄.
 *
 * 순수 함수 — 매 틱 horizon만 늘려 다시 계산해도 되지만, 비용을 줄이려고
 * useMemo로 파라미터가 바뀔 때만 재계산하고, 그 안에서 충분한 프레임 수까지
 * 한 번에 만든다. (시각 t는 그리기에서 잘라 보여준다.)
 */
function simulate(
  N: number,
  cpuTime: number,
  gpuTime: number,
  maxFrames: number,
): SimResult {
  const cpu: Block[] = [];
  const gpu: Block[] = [];
  const cpuRecEnd: number[] = [];
  const gpuExecEnd: number[] = [];

  let cpuFree = 0; // CPU가 다음 작업을 할 수 있는 가장 이른 시각
  let gpuFree = 0; // GPU가 다음 작업을 할 수 있는 가장 이른 시각
  let cpuBusy = 0;
  let gpuBusy = 0;
  let cpuStall = 0;
  let gpuStall = 0;

  for (let k = 0; k < maxFrames; k++) {
    // --- CPU가 프레임 k 기록 ---
    // 슬롯 (k mod N)을 이전에 쓴 프레임 k−N이 GPU에서 끝나야 시작 가능.
    // 그 "끝난 시각"은 gpuExecEnd[k−N] (k≥N일 때).
    let cpuStart = cpuFree;
    if (k >= N) {
      const slotFreeAt = gpuExecEnd[k - N]; // 펜스 ≥ k−N+1 이 되는 시각
      if (slotFreeAt > cpuStart) {
        // 펜스 대기(STALL): CPU가 슬롯이 비길 기다린다.
        cpu.push({ frame: k, start: cpuStart, end: slotFreeAt, stall: true });
        cpuStall += slotFreeAt - cpuStart;
        cpuStart = slotFreeAt;
      }
    }
    const cpuEnd = cpuStart + cpuTime;
    cpu.push({ frame: k, start: cpuStart, end: cpuEnd, stall: false });
    cpuBusy += cpuTime;
    cpuRecEnd[k] = cpuEnd;
    cpuFree = cpuEnd;

    // --- GPU가 프레임 k 실행 ---
    // (1) CPU 기록이 끝나야 하고 (2) GPU가 직전 프레임을 끝내야 한다.
    let gpuStart = Math.max(gpuFree, cpuEnd);
    if (gpuStart > gpuFree) {
      // GPU가 굶었다(STALL): 다음 프레임이 아직 준비 안 됨.
      gpu.push({ frame: k, start: gpuFree, end: gpuStart, stall: true });
      gpuStall += gpuStart - gpuFree;
    }
    const gpuEnd = gpuStart + gpuTime;
    gpu.push({ frame: k, start: gpuStart, end: gpuEnd, stall: false });
    gpuBusy += gpuTime;
    gpuExecEnd[k] = gpuEnd;
    gpuFree = gpuEnd;
  }

  return {
    cpu,
    gpu,
    fence: maxFrames, // 모든 프레임을 끝까지 시뮬레이션했을 때의 최종 펜스
    cpuRecEnd,
    gpuExecEnd,
    cpuBusy,
    gpuBusy,
    cpuStall,
    gpuStall,
  };
}

const CANVAS_H = 340;
const SIM_FRAMES = 60; // 충분히 많이 만들어 두고 화면에선 일부만 본다
const N_OPTIONS: ReadonlyArray<SelectOption<'1' | '2' | '3' | '4'>> = [
  { value: '1', label: '1 (버퍼 1개)' },
  { value: '2', label: '2 (더블 버퍼)' },
  { value: '3', label: '3 (트리플 버퍼)' },
  { value: '4', label: '4' },
];

/**
 * 펜스 + 프레임 인플라이트 위젯: 위 레인 = CPU 기록, 아래 레인 = GPU 실행.
 * 시간이 흐르며 누가 STALL 하는지, 펜스 값이 어떻게 오르는지, 레이턴시가
 * N으로 어떻게 자라는지를 보여준다.
 */
export default function FenceFramesInFlight() {
  const [nStr, setNStr] = useState<'1' | '2' | '3' | '4'>('2');
  const [cpuTime, setCpuTime] = useState(8); // ms
  const [gpuTime, setGpuTime] = useState(8); // ms
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1); // ms-시뮬 / ms-실시간 배율
  const [now, setNow] = useState(0); // 현재 시뮬 시각(ms)

  const N = Number(nStr);

  // 결정론적 시뮬레이션(파라미터가 바뀔 때만 재계산).
  const sim = useMemo(
    () => simulate(N, cpuTime, gpuTime, SIM_FRAMES),
    [N, cpuTime, gpuTime],
  );

  // 전체 타임라인 길이(마지막 GPU 종료 시각). 끝나면 now를 0으로 되돌려 반복.
  const totalMs = useMemo(() => {
    const last = sim.gpu[sim.gpu.length - 1];
    return last ? last.end : 1;
  }, [sim]);

  // 파라미터가 바뀌면 처음부터 다시 재생.
  useEffect(() => {
    setNow(0);
  }, [N, cpuTime, gpuTime]);

  // RAF로 항상 최신 speed/total을 읽도록 ref.
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const totalRef = useRef(totalMs);
  totalRef.current = totalMs;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = performance.now();
    const loop = (t: number): void => {
      const dtReal = Math.min(50, t - prev); // 실시간 ms (상한)
      prev = t;
      setNow((cur) => {
        // 화면 윈도가 흐르도록 시뮬 시각을 전진. 끝에 닿으면 다시 0.
        const next = cur + dtReal * speedRef.current;
        return next >= totalRef.current ? 0 : next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // --- 파생량: now 시점의 펜스, 롤링 stall %, 측정 레이턴시 ---
  const live = useMemo(() => {
    // 현재까지 GPU가 끝낸 프레임 수 = 펜스
    let fence = 0;
    for (const e of sim.gpuExecEnd) if (e <= now) fence += 1;

    // [0, now] 구간의 CPU/GPU 바쁨·대기 누적으로 롤링 % 계산
    const acc = (blocks: Block[]): { busy: number; stall: number } => {
      let busy = 0;
      let stall = 0;
      for (const b of blocks) {
        const s = Math.max(b.start, 0);
        const e = Math.min(b.end, now);
        if (e <= s) continue;
        const d = e - s;
        if (b.stall) stall += d;
        else busy += d;
      }
      return { busy, stall };
    };
    const c = acc(sim.cpu);
    const g = acc(sim.gpu);
    const cpuStallPct = c.busy + c.stall > 0 ? (c.stall / (c.busy + c.stall)) * 100 : 0;
    const gpuStallPct = g.busy + g.stall > 0 ? (g.stall / (g.busy + g.stall)) * 100 : 0;

    // 레이턴시: 가장 최근에 GPU가 끝낸 프레임 k에 대해,
    // (그 프레임을 GPU가 끝낸 시점의 펜스) 와 (CPU가 이미 기록을 끝낸 최신 프레임)의 차.
    // = "CPU가 앞서 달린 프레임 수". GPU-bound면 N에 수렴.
    let cpuRecorded = 0;
    for (const e of sim.cpuRecEnd) if (e <= now) cpuRecorded += 1;
    const latency = Math.max(0, cpuRecorded - fence);

    return { fence, cpuStallPct, gpuStallPct, latency };
  }, [sim, now]);

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 14;
    const laneH = 54;
    const fenceBoxH = 56;
    const slotRowH = 22;

    // 보여줄 시간 윈도: now를 따라 흐르되 시작은 0에서. 윈도 폭은 화면 비례.
    const windowMs = Math.max(60, (cpuTime + gpuTime) * 5);
    // now가 windowMs 안에 있으면 0부터, 넘으면 따라 흐른다.
    const t0 = Math.max(0, now - windowMs * 0.66);
    const t1 = t0 + windowMs;
    const plotX = padX;
    const plotW = w - padX * 2;
    const xOf = (t: number): number => plotX + ((t - t0) / (t1 - t0)) * plotW;

    const cpuLaneY = 70;
    const gpuLaneY = cpuLaneY + laneH + 40;

    // 펜스 큰 숫자 박스(우상단)
    {
      const bw = 120;
      const bx = w - padX - bw;
      const by = 8;
      roundRect(ctx, bx, by, bw, fenceBoxH, 10);
      ctx.fillStyle = withAlpha(theme.border, 0.4);
      ctx.fill();
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.fillText('FENCE', bx + 12, by + 16);
      ctx.font = '700 26px ui-monospace, monospace';
      ctx.fillStyle = theme.accent;
      ctx.fillText(String(live.fence), bx + 12, by + 44);
    }

    // 제목/슬롯 표시(좌상단)
    {
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.fillText(`프레임 인플라이트 N = ${N}  ·  슬롯:`, padX, 22);
      // N개의 슬롯 칸
      const sx = padX;
      const sy = 30;
      const sw = 26;
      for (let i = 0; i < N; i++) {
        roundRect(ctx, sx + i * (sw + 6), sy, sw, slotRowH, 5);
        ctx.fillStyle = withAlpha(theme.accent, 0.15);
        ctx.fill();
        ctx.strokeStyle = withAlpha(theme.accent, 0.6);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = theme.muted;
        ctx.textAlign = 'center';
        ctx.fillText(String(i), sx + i * (sw + 6) + sw / 2, sy + slotRowH / 2 + 3.5);
        ctx.textAlign = 'start';
      }
    }

    // 레인 라벨
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = theme.muted;
    ctx.fillText('CPU: 기록(record)', plotX, cpuLaneY - 6);
    ctx.fillText('GPU: 실행(execute)', plotX, gpuLaneY - 6);

    // 레인 배경
    for (const y of [cpuLaneY, gpuLaneY]) {
      roundRect(ctx, plotX, y, plotW, laneH, 8);
      ctx.fillStyle = withAlpha(theme.border, 0.35);
      ctx.fill();
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 블록 그리기 헬퍼
    const drawBlocks = (
      blocks: Block[],
      laneY: number,
      busyColor: string,
    ): void => {
      for (const b of blocks) {
        if (b.end < t0 || b.start > t1) continue; // 윈도 밖
        const bx = xOf(b.start);
        const bxe = xOf(b.end);
        const bw = Math.max(1, bxe - bx);
        const by = laneY + 6;
        const bh = laneH - 12;
        if (b.stall) {
          // 대기(STALL): 주황 해치
          ctx.save();
          roundRect(ctx, bx, by, bw, bh, 4);
          ctx.clip();
          ctx.fillStyle = withAlpha(QUEUE_COLORS.stall, 0.15);
          ctx.fillRect(bx, by, bw, bh);
          ctx.strokeStyle = withAlpha(QUEUE_COLORS.stall, 0.85);
          ctx.lineWidth = 1;
          const step = 7;
          ctx.beginPath();
          for (let x = bx - bh; x < bx + bw; x += step) {
            ctx.moveTo(x, by + bh);
            ctx.lineTo(x + bh, by);
          }
          ctx.stroke();
          ctx.restore();
        } else {
          roundRect(ctx, bx, by, bw, bh, 4);
          ctx.fillStyle = withAlpha(busyColor, 0.85);
          ctx.fill();
          // 프레임 번호(블록이 충분히 넓을 때만)
          if (bw > 16) {
            ctx.font = '10px ui-monospace, monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`f${b.frame}`, bx + bw / 2, by + bh / 2);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
          }
        }
      }
    };

    drawBlocks(sim.cpu, cpuLaneY, QUEUE_COLORS.graphics);
    drawBlocks(sim.gpu, gpuLaneY, QUEUE_COLORS.compute);

    // 펜스 화살표: 최근 GPU 완료 → 그것이 풀어주는 CPU 프레임 시작.
    // GPU가 프레임 k를 끝내면 슬롯 (k mod N)이 비어 프레임 k+N의 CPU 기록이 가능.
    // 윈도 안에 보이는 가장 최근의 그런 쌍 1~2개만 그린다.
    {
      let drawn = 0;
      for (let k = sim.gpuExecEnd.length - 1; k >= 0 && drawn < 2; k--) {
        const gEnd = sim.gpuExecEnd[k];
        if (gEnd > now) continue; // 아직 안 끝남
        const target = k + N; // 이 완료가 풀어주는 CPU 프레임
        if (target >= sim.cpuRecEnd.length) continue;
        // 그 CPU 프레임의 (대기 후) 실제 기록 시작 시각 = 기록끝 − cpuTime
        const cpuStart = sim.cpuRecEnd[target] - cpuTime;
        if (gEnd < t0 || cpuStart > t1) continue;
        // GPU 블록 끝(아래 레인) → CPU 블록 시작(위 레인)
        const x1 = xOf(gEnd);
        const y1 = gpuLaneY + 4;
        const x2 = xOf(cpuStart);
        const y2 = cpuLaneY + laneH - 4;
        drawArrow(ctx, x1, y1, x2, y2, withAlpha(QUEUE_COLORS.ok, 0.9), {
          dashed: true,
          width: 1.4,
          head: 6,
        });
        drawn++;
      }
    }

    // "now" 세로 마커
    {
      const nx = xOf(now);
      ctx.strokeStyle = withAlpha(theme.text, 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nx, cpuLaneY - 4);
      ctx.lineTo(nx, gpuLaneY + laneH + 4);
      ctx.stroke();
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = theme.text;
      ctx.fillText('now', nx + 3, gpuLaneY + laneH + 14);
    }
  };

  const { ref } = useCanvas2d(draw, [sim, now, N, cpuTime, gpuTime]);

  // 워크로드 진단 한 줄(교육용).
  const verdict = useMemo(() => {
    if (cpuTime > gpuTime * 1.25) return 'CPU-bound: GPU가 굶습니다 (N과 무관).';
    if (gpuTime > cpuTime * 1.25)
      return `GPU-bound: CPU가 버퍼 ${N}개를 채우고 펜스에서 대기 → 레이턴시 ↑.`;
    if (N === 1) return 'N=1: 핑퐁 — 둘 다 절반은 놉니다(처리량 낮음).';
    return '균형 + N≥2: 두 레인이 겹쳐 거의 꽉 참 (버퍼링의 효과!).';
  }, [cpuTime, gpuTime, N]);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block' }}
      />
      <ControlPanel>
        <SelectControl
          label="프레임 인플라이트 N"
          value={nStr}
          options={N_OPTIONS}
          onChange={setNStr}
        />
        <Slider
          label="CPU 프레임 시간"
          value={cpuTime}
          min={2}
          max={20}
          step={1}
          onChange={setCpuTime}
          unit=" ms"
        />
        <Slider
          label="GPU 프레임 시간"
          value={gpuTime}
          min={2}
          max={20}
          step={1}
          onChange={setGpuTime}
          unit=" ms"
        />
        <Slider
          label="재생 속도"
          value={speed}
          min={0.1}
          max={3}
          step={0.1}
          onChange={setSpeed}
          format={(v) => `${v.toFixed(1)}×`}
        />
        <ToggleControl label="재생" checked={playing} onChange={setPlaying} />
        <div style={{ display: 'flex', gap: '0.4rem', width: '100%' }}>
          <button
            type="button"
            onClick={() => setNow(0)}
            style={{
              minHeight: 38,
              padding: '0 0.85rem',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              font: 'inherit',
              fontSize: '0.85rem',
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            리셋
          </button>
        </div>
      </ControlPanel>
      <div
        style={{
          marginTop: '0.6rem',
          fontSize: '0.85rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--muted)',
          lineHeight: 1.6,
        }}
      >
        펜스 = {live.fence} · CPU 대기 {live.cpuStallPct.toFixed(0)}% · GPU 대기{' '}
        {live.gpuStallPct.toFixed(0)}% · 레이턴시 ≈ {live.latency}프레임
        <br />
        <span style={{ color: 'var(--text)' }}>{verdict}</span>
      </div>
      <figcaption>
        <strong>펜스(fence)</strong>는 CPU와 GPU를 잇는 동기화 카운터입니다. GPU가 프레임 k를
        끝내면 펜스를 k+1로 올리고, CPU는 슬롯 (k mod N)을 다시 쓰기 전에 그 슬롯을 쓰던 옛 프레임이
        끝났는지(펜스 ≥ k−N+1) 기다립니다. 그래서 프레임별 리소스를 <strong>N벌</strong> 두면(더블·
        트리플 버퍼링) CPU가 프레임 i+1을 기록하는 동안 GPU가 프레임 i를 실행할 수 있습니다 —{' '}
        두 레인이 <em>겹칩니다</em>. 대신 N이 클수록 입력→화면 <em>레이턴시</em>가 길어지고 메모리도
        N배가 듭니다. 처리량·레이턴시·메모리의 삼각 트레이드오프입니다.
        <br />
        <strong>직접 해보세요:</strong> N=1로 두면 CPU·GPU가 번갈아 멈추는(주황 해치) 걸 보세요.
        N=3으로 올리면 두 레인이 꽉 찹니다. 이제 “GPU 프레임 시간”을 “CPU 프레임 시간”보다 훨씬 크게
        하면, CPU가 버퍼를 채운 뒤 펜스에서 멈추고 레이턴시가 N까지 자라는 게 보입니다.
      </figcaption>
    </figure>
  );
}
