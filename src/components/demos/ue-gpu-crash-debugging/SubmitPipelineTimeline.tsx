import { useMemo } from 'react';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { UE_COLORS, roundRect, withAlpha, monoFont } from './ue2d';

// ---------------------------------------------------------------------------
// 정적 도식: RHI Submit Pipeline (Luke Thatcher (Epic) 발표)
//
// 기존: 단일 RHI 스레드가 변환(translate)+제출(submit)+동기화(sync)를 직렬로 처리.
//  - 역할이 너무 많아 병렬화가 제한적.
//  - Fence를 polling으로 확인 → 즉시 반응 못 함 → 유휴(bubble)가 생김.
//
// 신규: 3개의 역할을 분리.
//  - 변환(Translate): 여러 워커 스레드가 커맨드 리스트를 병렬 변환.
//  - 제출(Submit): 전용 스레드가 배칭해 GPU 큐에 빠르게 제출.
//  - 동기화(Sync): 인터럽트 스레드가 GPU 펜스에 즉시 반응(polling X) → bubble ≈ 0.
//    크래시도 마찬가지로 즉시 인지.
//
// 같은 N개 커맨드 리스트를 두 모델로 처리한 간트 차트를 위·아래로 나란히 비교한다
// (인터랙티브 아님 — 대표값 N=4, 폴링 지연=2로 고정).
// ---------------------------------------------------------------------------

const CANVAS_H = 360;
const CANVAS_MAXW = 360; // 모바일 우선: 내부 렌더 폭 상한

// 정적 비교용 대표값.
const N_LISTS = 4; // 커맨드 리스트 수
const FENCE_LATENCY = 2; // 기존 모델의 폴링 버블 길이

// 단위 시간(추상). 실제 ms 아님 — 비교용 상대값.
const T_TRANSLATE = 3; // 커맨드 리스트 1개 변환 비용
const T_SUBMIT = 1; // 제출 비용(배칭으로 작음)
const T_GPU = 2; // GPU 실행(펜스 신호까지)
const N_TRANSLATE_WORKERS = 3; // 신규 모델의 변환 워커 수

interface Bar {
  lane: number; // 레인 인덱스
  start: number;
  dur: number;
  color: string;
  label?: string;
  /** 버블(유휴)인지 — 빗금 처리 */
  bubble?: boolean;
}

interface Model {
  lanes: string[];
  bars: Bar[];
  makespan: number;
  bubbleTotal: number;
}

/**
 * 기존 모델: 단일 RHI 스레드가 [변환→제출]을 직렬로 N번.
 * 매 제출 뒤 GPU 펜스를 polling으로 기다리는데, polling 간격(fenceLatency)만큼
 * 즉시 반응하지 못해 버블이 생긴다.
 */
function buildOld(n: number, fenceLatency: number): Model {
  const bars: Bar[] = [];
  let t = 0;
  let bubbleTotal = 0;
  for (let i = 0; i < n; i++) {
    // 변환
    bars.push({ lane: 0, start: t, dur: T_TRANSLATE, color: UE_COLORS.graphics, label: `T${i + 1}` });
    t += T_TRANSLATE;
    // 제출
    bars.push({ lane: 0, start: t, dur: T_SUBMIT, color: UE_COLORS.copy, label: 'S' });
    t += T_SUBMIT;
    // GPU 실행은 같은 레인에서 기다림(직렬). 펜스를 polling → latency만큼 버블.
    const gpuStart = t;
    bars.push({ lane: 0, start: gpuStart, dur: T_GPU, color: withAlpha(UE_COLORS.compute, 0.55), label: 'GPU' });
    t += T_GPU;
    // polling 버블: 펜스가 신호된 뒤 스레드가 알아채기까지 latency.
    if (fenceLatency > 0) {
      bars.push({ lane: 0, start: t, dur: fenceLatency, color: UE_COLORS.stall, bubble: true });
      t += fenceLatency;
      bubbleTotal += fenceLatency;
    }
  }
  return { lanes: ['단일 RHI 스레드'], bars, makespan: t, bubbleTotal };
}

/**
 * 신규 모델: 변환은 N_TRANSLATE_WORKERS개 워커가 병렬, 제출은 전용 스레드가
 * 배칭, 동기화는 인터럽트 스레드가 펜스에 즉시 반응(버블 ≈ 0).
 */
function buildNew(n: number): Model {
  const bars: Bar[] = [];
  // 레인 0: 변환 워커들(병렬 — 같은 레인에 겹쳐 그리되 시작시간이 다름).
  // 단순화: 워커 수만큼 라운드로빈으로 분배, 워커별 누적 시간으로 시작점 계산.
  const workerEnd = new Array<number>(N_TRANSLATE_WORKERS).fill(0);
  const translateEnd: number[] = [];
  for (let i = 0; i < n; i++) {
    const wk = i % N_TRANSLATE_WORKERS;
    const start = workerEnd[wk];
    bars.push({
      lane: wk, // 변환 레인 = 워커 인덱스(0..N_TRANSLATE_WORKERS-1)
      start,
      dur: T_TRANSLATE,
      color: UE_COLORS.graphics,
      label: `T${i + 1}`,
    });
    workerEnd[wk] = start + T_TRANSLATE;
    translateEnd.push(start + T_TRANSLATE);
  }
  const submitLane = N_TRANSLATE_WORKERS;
  const syncLane = N_TRANSLATE_WORKERS + 1;

  // 제출 전용 스레드: 변환이 끝나는 대로 빠르게(배칭) 제출.
  let submitT = 0;
  const gpuStarts: number[] = [];
  for (let i = 0; i < n; i++) {
    const ready = translateEnd[i];
    const start = Math.max(submitT, ready);
    bars.push({ lane: submitLane, start, dur: T_SUBMIT, color: UE_COLORS.copy, label: 'S' });
    submitT = start + T_SUBMIT;
    gpuStarts.push(submitT);
  }

  // 동기화(인터럽트) 스레드: GPU가 펜스를 신호하는 즉시 반응(버블 0).
  // GPU 실행은 sync 레인에 표기(제출 직후 시작).
  let syncMakespan = 0;
  for (let i = 0; i < n; i++) {
    const gpuStart = gpuStarts[i];
    bars.push({
      lane: syncLane,
      start: gpuStart,
      dur: T_GPU,
      color: withAlpha(UE_COLORS.compute, 0.55),
      label: 'GPU',
    });
    // 인터럽트 반응 마커(아주 짧음) — 버블 아님.
    syncMakespan = Math.max(syncMakespan, gpuStart + T_GPU);
  }

  const makespan = Math.max(
    ...workerEnd,
    submitT,
    syncMakespan,
  );
  const lanes = [
    ...Array.from({ length: N_TRANSLATE_WORKERS }, (_, i) => `변환 워커 ${i + 1}`),
    '제출(전용)',
    '동기화(인터럽트)',
  ];
  return { lanes, bars, makespan, bubbleTotal: 0 };
}

export default function SubmitPipelineTimeline() {
  const oldModel = useMemo(() => buildOld(N_LISTS, FENCE_LATENCY), []);
  const newModel = useMemo(() => buildNew(N_LISTS), []);

  const tMax = Math.max(oldModel.makespan, newModel.makespan, 1);

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 14;
    const labelW = 96;
    const plotX = padX + labelW;
    const plotW = w - plotX - padX;
    const xOf = (t: number): number => plotX + (t / tMax) * plotW;
    const wOf = (dt: number): number => (dt / tMax) * plotW;

    const laneH = 22;
    const laneGap = 7;

    // 한 모델 블록을 그리는 헬퍼.
    const drawModel = (
      title: string,
      model: Model,
      y0: number,
      makespanColor: string,
    ): number => {
      ctx.font = monoFont(12);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(title, padX, y0);

      const lanesTop = y0 + 8;
      // 레인 배경 + 라벨
      for (let li = 0; li < model.lanes.length; li++) {
        const ly = lanesTop + li * (laneH + laneGap);
        roundRect(ctx, plotX, ly, plotW, laneH, 5);
        ctx.fillStyle = withAlpha(theme.border, 0.25);
        ctx.fill();
        ctx.strokeStyle = theme.border;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = monoFont(11);
        ctx.fillStyle = theme.muted;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(model.lanes[li], plotX - 6, ly + laneH / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }

      // 막대
      for (const b of model.bars) {
        const ly = lanesTop + b.lane * (laneH + laneGap);
        const bx = xOf(b.start);
        const bw = Math.max(2, wOf(b.dur));
        const by = ly + 3;
        const bh = laneH - 6;
        roundRect(ctx, bx, by, bw, bh, 3);
        if (b.bubble) {
          // 빗금 버블(유휴)
          ctx.fillStyle = withAlpha(UE_COLORS.stall, 0.22);
          ctx.fill();
          ctx.save();
          ctx.clip();
          ctx.strokeStyle = withAlpha(UE_COLORS.stall, 0.9);
          ctx.lineWidth = 1;
          for (let hx = bx - bh; hx < bx + bw; hx += 5) {
            ctx.beginPath();
            ctx.moveTo(hx, by + bh);
            ctx.lineTo(hx + bh, by);
            ctx.stroke();
          }
          ctx.restore();
          ctx.strokeStyle = UE_COLORS.stall;
          ctx.lineWidth = 1;
          roundRect(ctx, bx, by, bw, bh, 3);
          ctx.stroke();
        } else {
          ctx.fillStyle = withAlpha(b.color, 0.9);
          ctx.fill();
          if (bw > 20 && b.label) {
            ctx.font = monoFont(10);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.label, bx + bw / 2, by + bh / 2 + 0.5);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
          }
        }
      }

      // makespan 자
      const lastLaneY = lanesTop + (model.lanes.length - 1) * (laneH + laneGap);
      const ry = lastLaneY + laneH + 7;
      ctx.strokeStyle = makespanColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(plotX, ry);
      ctx.lineTo(xOf(model.makespan), ry);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xOf(model.makespan), ry - 4);
      ctx.lineTo(xOf(model.makespan), ry + 4);
      ctx.stroke();
      ctx.font = monoFont(11);
      ctx.fillStyle = makespanColor;
      ctx.textAlign = 'left';
      ctx.fillText(`makespan ${model.makespan.toFixed(0)}`, plotX + 4, ry - 4);

      return ry + 6; // 다음 블록 top
    };

    const afterOld = drawModel(
      `기존: 단일 RHI 스레드 (폴링) — 버블 ${oldModel.bubbleTotal.toFixed(0)}`,
      oldModel,
      18,
      UE_COLORS.stall,
    );
    drawModel(
      '신규: 변환·제출·동기화 분리 — 버블 0',
      newModel,
      afterOld + 12,
      UE_COLORS.ok,
    );
  };

  const { ref } = useCanvas2d(draw, []);

  const saved = oldModel.makespan - newModel.makespan;
  const savedPct = oldModel.makespan > 0 ? (saved / oldModel.makespan) * 100 : 0;

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{
          height: CANVAS_H,
          display: 'block',
          width: '100%',
          maxWidth: CANVAS_MAXW,
          minWidth: 0,
        }}
      />
      <div
        style={{
          marginTop: '0.6rem',
          fontSize: '0.85rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--muted)',
          lineHeight: 1.7,
        }}
      >
        같은 {N_LISTS}개 커맨드 리스트 · 기존 makespan:{' '}
        <span style={{ color: UE_COLORS.stall }}>{oldModel.makespan.toFixed(0)}</span> (폴링 버블{' '}
        <span style={{ color: UE_COLORS.stall }}>{oldModel.bubbleTotal.toFixed(0)}</span>) · 신규:{' '}
        <span style={{ color: UE_COLORS.ok }}>{newModel.makespan.toFixed(0)}</span> (버블{' '}
        <span style={{ color: UE_COLORS.ok }}>0</span>) · 단축:{' '}
        <span style={{ color: saved > 0 ? UE_COLORS.ok : 'var(--muted)' }}>
          {saved.toFixed(0)} ({savedPct.toFixed(0)}%)
        </span>
      </div>
      <figcaption>
        새로운 RHI <strong>Submit Pipeline</strong> (Luke Thatcher (Epic) 발표). 같은{' '}
        {N_LISTS}개 커맨드 리스트를 두 모델로 처리한 간트 차트입니다. <strong>위쪽 기존 모델</strong>은
        단일 RHI 스레드가 변환·제출·동기화를 <em>혼자 직렬로</em> 처리합니다. 게다가 GPU 펜스를{' '}
        <strong>polling</strong>으로 확인해, 펜스가 신호된 뒤에도 다음 polling까지 기다리는{' '}
        <strong>버블</strong>(빗금 친 주황 유휴 구간)이 매번 생겨 makespan을 부풀립니다.{' '}
        <strong>아래 신규 모델</strong>은 역할을 셋으로 쪼갭니다 — <strong>변환</strong>은 여러 워커
        스레드가 <em>병렬</em>로, <strong>제출</strong>은 전용 스레드가 배칭해 빠르게,{' '}
        <strong>동기화</strong>는 <em>인터럽트</em> 스레드가 펜스에 <strong>즉시</strong> 반응(polling
        없음)해 버블이 0이 됩니다. 두 makespan 자(아래 가로선)를 비교하면, 폴링 버블이 사라지고 변환이
        병렬화되며 전체 시간이 크게 줄어든 것이 보입니다. 같은 인터럽트 경로로 GPU 크래시도 즉시
        인지합니다.
      </figcaption>
    </figure>
  );
}
