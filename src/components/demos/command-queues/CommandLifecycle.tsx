import { useEffect, useMemo, useRef, useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { QUEUE_COLORS, roundRect, withAlpha } from './cq2d';

// ---------------------------------------------------------------------------
// 모델: 명령의 일생 — 기록(record) → 제출(submit) → 실행(execute)
//
// 현대 명시적 GPU API(D3D12/Vulkan)에서 CPU는 GPU를 "함수처럼" 호출하지 않는다.
// CPU는 명령을 커맨드 리스트(command list)에 기록(record)하고, 그 리스트를
// 큐(queue)에 제출(submit, ExecuteCommandLists/vkQueueSubmit)할 뿐이다.
// GPU는 나중에, 비동기로, FIFO 순서로 큐에서 꺼내 실행한다.
// 이 위젯은 그 "시간 간격(async gap)"을 눈으로 보게 한다.
// ---------------------------------------------------------------------------

/** 기록할 수 있는 명령 종류(순환하며 추가). 의미색은 QUEUE_COLORS를 따른다. */
type CmdKind = 'Draw' | 'Dispatch' | 'Copy' | 'Clear';

const CMD_CYCLE: ReadonlyArray<CmdKind> = ['Draw', 'Dispatch', 'Copy', 'Clear'];

function cmdColor(kind: CmdKind): string {
  switch (kind) {
    case 'Draw':
      return QUEUE_COLORS.graphics; // 그래픽스 — 파랑
    case 'Dispatch':
      return QUEUE_COLORS.compute; // 컴퓨트 — 보라
    case 'Copy':
      return QUEUE_COLORS.copy; // 카피 — 청록
    case 'Clear':
      return QUEUE_COLORS.graphics;
  }
}

interface Cmd {
  id: number;
  kind: CmdKind;
}

/** 제출된 한 배치 = 한 번의 ExecuteCommandLists 호출(하나의 커맨드 리스트). */
interface Batch {
  id: number;
  cmds: Cmd[];
}

/** 시뮬레이션 상태 전체. 한 묶음으로 관리해 RAF/버튼이 같은 모델을 갱신. */
interface SimState {
  /** 아직 열려 있는(기록 중인) 커맨드 리스트 */
  open: Cmd[];
  /** 큐에 제출되어 GPU 실행을 기다리는 배치들(FIFO: [0]이 가장 먼저) */
  queue: Batch[];
  /** GPU가 지금 실행 중인 명령(없으면 idle) */
  running: Cmd | null;
  /** 현재 실행 명령의 진행도 0..1 */
  progress: number;
  /** GPU가 완료한 명령 누적 수 */
  done: number;
  /** 최근 완료된 명령들(연하게 히스토리로 표시, 최대 몇 개) */
  history: Cmd[];
}

const HISTORY_MAX = 8;

function initialState(): SimState {
  return { open: [], queue: [], running: null, progress: 0, done: 0, history: [] };
}

/**
 * GPU 타임라인을 dt(초)만큼, rate(commands/sec)로 전진.
 * - running이 비어 있으면 큐 맨 앞 배치에서 다음 명령을 꺼낸다(FIFO).
 * - progress가 1을 넘으면 그 명령을 완료 처리하고 다음 명령으로.
 * 순수 함수(상태를 새로 만들어 반환) — React setState에 안전.
 */
function advanceGpu(s: SimState, dt: number, rate: number): SimState {
  let { running, progress, done } = s;
  let queue = s.queue;
  let history = s.history;
  // dt를 작은 조각으로 나눠 여러 명령이 한 프레임에 끝나도 정확히 처리.
  let budget = dt * rate; // 이번 틱에 처리할 수 있는 "명령 진행량"

  // 무한 루프 방지: 큐가 비고 running도 없으면 더 할 일이 없다.
  let guard = 0;
  while (budget > 0 && guard < 64) {
    guard++;
    if (!running) {
      // 큐 맨 앞 배치에서 다음 명령을 꺼낸다.
      const head = queue[0];
      if (!head || head.cmds.length === 0) break; // 큐 비었거나 빈 배치 — idle
      running = head.cmds[0];
      progress = 0;
    }
    const remaining = 1 - progress;
    if (budget >= remaining) {
      // 이 명령 완료
      budget -= remaining;
      done += 1;
      history = [running, ...history].slice(0, HISTORY_MAX);
      // 큐 맨 앞 배치에서 그 명령 제거
      const head = queue[0];
      const restCmds = head.cmds.slice(1);
      if (restCmds.length === 0) {
        queue = queue.slice(1); // 배치 소진 → 큐에서 제거
      } else {
        queue = [{ ...head, cmds: restCmds }, ...queue.slice(1)];
      }
      running = null;
      progress = 0;
    } else {
      progress += budget;
      budget = 0;
    }
  }
  return { ...s, queue, running, progress, done, history };
}

const CANVAS_H = 320;

/**
 * 명령의 일생 위젯: 세 레인(CPU 기록 · 큐 대기 · GPU 실행)에 걸쳐
 * 명령이 record → submit → execute로 이동하는 과정을 보여준다.
 */
export default function CommandLifecycle() {
  const [sim, setSim] = useState<SimState>(initialState);
  const [rate, setRate] = useState(2); // commands/sec
  const [auto, setAuto] = useState(false);

  // 다음에 기록할 명령 종류를 순환시키기 위한 카운터.
  const nextKindRef = useRef(0);
  const nextIdRef = useRef(1);
  const nextBatchRef = useRef(1);

  // RAF가 항상 최신 rate를 읽도록 ref로 보관(stale closure 방지).
  const rateRef = useRef(rate);
  rateRef.current = rate;

  // --- 액션들 ---
  const recordCmd = (): void => {
    const kind = CMD_CYCLE[nextKindRef.current % CMD_CYCLE.length];
    nextKindRef.current += 1;
    const id = nextIdRef.current++;
    setSim((s) => ({ ...s, open: [...s.open, { id, kind }] }));
  };

  const submit = (): void => {
    setSim((s) => {
      if (s.open.length === 0) return s;
      const batch: Batch = { id: nextBatchRef.current++, cmds: s.open };
      return { ...s, open: [], queue: [...s.queue, batch] };
    });
  };

  const stepOne = (): void => {
    // 한 명령을 정확히 끝까지 전진시킨다.
    // advanceGpu에 dt=need, rate=1을 주면 budget=need 만큼만 진행하므로
    // 현재(또는 큐 맨 앞) 명령이 딱 하나 완료된다.
    setSim((s) => {
      if (!s.running && s.queue.length === 0) return s;
      const need = s.running ? 1 - s.progress : 1; // 현재 명령의 남은 분량
      return advanceGpu(s, need, 1);
    });
  };

  const reset = (): void => {
    nextKindRef.current = 0;
    nextIdRef.current = 1;
    nextBatchRef.current = 1;
    setSim(initialState());
  };

  // --- 자동 실행 RAF 루프 ---
  useEffect(() => {
    if (!auto) return;
    let raf = 0;
    let prev = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - prev) / 1000); // dt 상한(탭 전환 점프 방지)
      prev = now;
      setSim((s) => advanceGpu(s, dt, rateRef.current));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [auto]);

  // 큐 대기 명령 총 개수(읽기 표시용)
  const queuedCmds = useMemo(
    () => sim.queue.reduce((n, b) => n + b.cmds.length, 0),
    [sim.queue],
  );

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 14;
    const laneH = 64;
    const laneGap = 18;
    const labelW = 0; // 라벨은 레인 위에 작게
    const top0 = 30;
    const laneX = padX + labelW;
    const laneW = w - laneX - padX;

    const lanes: Array<{ y: number; label: string }> = [
      { y: top0, label: 'CPU: 기록(record) — 열린 커맨드 리스트' },
      { y: top0 + laneH + laneGap, label: '큐(queue) 대기열 — FIFO' },
      { y: top0 + 2 * (laneH + laneGap), label: 'GPU: 실행(execute)' },
    ];

    // 레인 배경 + 라벨
    for (const lane of lanes) {
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.fillText(lane.label, laneX + 2, lane.y - 6);
      roundRect(ctx, laneX, lane.y, laneW, laneH, 8);
      ctx.fillStyle = withAlpha(theme.border, 0.4);
      ctx.fill();
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const chipH = 26;
    const chipGap = 6;
    const chipW = 56;

    // 명령 칩 하나 그리기
    const drawChip = (
      x: number,
      y: number,
      cmd: Cmd,
      opts?: { alpha?: number; progress?: number },
    ): void => {
      const a = opts?.alpha ?? 1;
      const col = cmdColor(cmd.kind);
      roundRect(ctx, x, y, chipW, chipH, 6);
      ctx.fillStyle = withAlpha(col, 0.22 * a);
      ctx.fill();
      ctx.strokeStyle = withAlpha(col, a);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 진행 바(실행 중 명령)
      if (opts?.progress !== undefined) {
        const p = Math.max(0, Math.min(1, opts.progress));
        ctx.save();
        roundRect(ctx, x, y, chipW * p, chipH, 6);
        ctx.clip();
        roundRect(ctx, x, y, chipW, chipH, 6);
        ctx.fillStyle = withAlpha(col, 0.55);
        ctx.fill();
        ctx.restore();
      }
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = withAlpha(theme.text, a);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cmd.kind, x + chipW / 2, y + chipH / 2 + 0.5);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    };

    // (1) CPU 레인: 열린 리스트의 칩들
    {
      const lane = lanes[0];
      const cy = lane.y + (laneH - chipH) / 2;
      let x = laneX + 10;
      for (const cmd of sim.open) {
        if (x + chipW > laneX + laneW - 10) break; // 넘치면 생략
        drawChip(x, cy, cmd);
        x += chipW + chipGap;
      }
      if (sim.open.length === 0) {
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillStyle = theme.muted;
        ctx.fillText('(빈 리스트 — “명령 기록”으로 추가)', laneX + 12, lane.y + laneH / 2 + 4);
      }
    }

    // (2) 큐 레인: 제출된 배치들. 각 배치는 가는 테두리로 묶어 "한 번의 제출"임을 표시.
    {
      const lane = lanes[1];
      const cy = lane.y + (laneH - chipH) / 2;
      let x = laneX + 10;
      for (const batch of sim.queue) {
        const groupW = batch.cmds.length * chipW + (batch.cmds.length - 1) * chipGap + 10;
        // 배치 테두리
        roundRect(ctx, x - 5, cy - 7, groupW, chipH + 14, 8);
        ctx.strokeStyle = theme.text;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        // 배치 번호 라벨
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = theme.muted;
        ctx.fillText(`#${batch.id}`, x - 4, cy - 9);
        let cx = x;
        for (const cmd of batch.cmds) {
          if (cx + chipW > laneX + laneW - 6) break;
          drawChip(cx, cy, cmd);
          cx += chipW + chipGap;
        }
        x += groupW + 14;
        if (x > laneX + laneW - 20) break;
      }
      if (sim.queue.length === 0) {
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillStyle = theme.muted;
        ctx.fillText('(비어 있음 — 제출하면 여기 쌓임)', laneX + 12, lane.y + laneH / 2 + 4);
      }
    }

    // (3) GPU 레인: 완료 히스토리(연하게) + 현재 실행 중(진행 바)
    {
      const lane = lanes[2];
      const cy = lane.y + (laneH - chipH) / 2;
      // 히스토리: 왼쪽부터 오래된→최근, 연하게
      let x = laneX + 10;
      const hist = [...sim.history].reverse(); // 오래된 게 왼쪽
      for (const cmd of hist) {
        if (x + chipW > laneX + laneW - 90) break;
        drawChip(x, cy, cmd, { alpha: 0.4 });
        x += chipW + chipGap;
      }
      // 현재 실행 중
      if (sim.running) {
        drawChip(x, cy, sim.running, { progress: sim.progress });
        // "실행 중" 표시
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = QUEUE_COLORS.ok;
        ctx.fillText('▶ 실행 중', x, cy - 6);
      } else {
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillStyle = QUEUE_COLORS.stall;
        const msg = queuedCmds > 0 ? '● GPU idle (자동 실행 꺼짐)' : '● GPU idle (할 일 없음)';
        ctx.fillText(msg, laneX + laneW - 200, lane.y + laneH / 2 + 4);
      }
    }

    // "현재 시각(now)" 세로 마커 — GPU 레인 실행 위치 근처에 옅게
    {
      const lane = lanes[2];
      const markerX = laneX + 6;
      ctx.strokeStyle = withAlpha(theme.muted, 0.35);
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(markerX, lanes[0].y - 2);
      ctx.lineTo(markerX, lane.y + laneH + 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.save();
      ctx.translate(markerX - 4, lanes[0].y + 4);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'right';
      ctx.fillText('now', 0, 0);
      ctx.restore();
      ctx.textAlign = 'start';
    }
  };

  const { ref } = useCanvas2d(draw, [sim, queuedCmds]);

  const canStep = sim.running !== null || sim.queue.length > 0;

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block' }}
      />
      <ControlPanel>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.4rem',
            width: '100%',
          }}
        >
          <Btn onClick={recordCmd}>명령 기록</Btn>
          <Btn onClick={submit} disabled={sim.open.length === 0}>
            제출(submit)
          </Btn>
          <Btn onClick={stepOne} disabled={!canStep || auto}>
            한 칸 실행
          </Btn>
          <Btn onClick={reset} variant="ghost">
            리셋
          </Btn>
        </div>
        <Slider
          label="GPU 실행 속도"
          value={rate}
          min={0.5}
          max={8}
          step={0.5}
          onChange={setRate}
          format={(v) => `${v} cmd/s`}
        />
        <ToggleControl label="자동 실행" checked={auto} onChange={setAuto} />
      </ControlPanel>
      <div
        style={{
          marginTop: '0.6rem',
          fontSize: '0.85rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--muted)',
        }}
      >
        열린 리스트: {sim.open.length}개 명령 · 큐 대기: {sim.queue.length}배치(
        {queuedCmds}명령) · GPU 완료: {sim.done}
      </div>
      <figcaption>
        명령은 세 단계를 거칩니다. <strong>기록(record)</strong>은 CPU가 명령을 커맨드 리스트에
        써 넣는 것이고, <strong>제출(submit)</strong>은 그 리스트를 통째로 큐에 넘기는 것(한 번의
        ExecuteCommandLists 호출 = 점선으로 묶인 한 배치)입니다. 하지만 제출해도{' '}
        <em>그 자리에서 실행되지 않습니다</em> — 명령은 큐에 줄을 서고, GPU가 차례가 되어야 비로소{' '}
        <strong>실행(execute)</strong>합니다. 이 시간 간격이 “비동기 갭”입니다. GPU가 한 리스트를
        다 끝내기 전에는 그 리스트가 쓰던 커맨드 할당자 메모리를 재사용할 수 없는데, “언제 끝났는지”를
        CPU가 알려면 다음 장의 <em>펜스(fence)</em>가 필요합니다.
        <br />
        <strong>직접 해보세요:</strong> 명령을 몇 개 기록해 제출하고, GPU가 다 비우기{' '}
        <em>전에</em> 또 기록·제출해 보세요. 배치들이 큐에 FIFO로 쌓이는 게 보입니다. “자동 실행”을
        끄면 GPU가 멈춰 큐가 점점 길어지고, “한 칸 실행”으로 한 명령씩 직접 꺼내볼 수 있습니다.
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 작은 버튼 — 컨트롤 툴킷에 버튼 프리미티브가 없어, 캔버스 밖(DOM)에서
// CSS 변수만 읽는 플레인 버튼으로 직접 만든다. 탭 타깃 ≥ 36px.
// ---------------------------------------------------------------------------
interface BtnProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'ghost';
  children: React.ReactNode;
}

function Btn({ onClick, disabled, variant = 'solid', children }: BtnProps) {
  const solid = variant === 'solid';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 38,
        padding: '0 0.85rem',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: solid ? 'var(--accent)' : 'var(--surface)',
        color: solid ? '#fff' : 'var(--text)',
        font: 'inherit',
        fontSize: '0.85rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        flex: '0 0 auto',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </button>
  );
}
