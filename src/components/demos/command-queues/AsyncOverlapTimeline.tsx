import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { QUEUE_COLORS, roundRect, withAlpha, drawArrow } from './cq2d';

// ---------------------------------------------------------------------------
// 정적 도식: 멀티 큐 비동기 컴퓨트 오버랩과 그 동기화 비용
//
// 서로 독립적인 작업을 별도 큐(그래픽스 + 비동기 컴퓨트)에 올리면 GPU에서
// 동시에(concurrently) 돌아 지연을 숨긴다(idle ALU를 메움).
//   - 같은 큐 안: FIFO로 직렬 실행.
//   - 다른 큐끼리: 동시에 실행.
//   - 교차 큐 의존: 세마포어(semaphore)가 필요하고, 그 대기는 스톨(stall)을 만든다.
//
// 오버랩 절감 = (모두 직렬일 때 시간) − (오버랩 스케줄의 makespan)
// 동기화 비용 = 의존이 강제한 스톨.
//
// 비-렌더링 시스템 주제이므로 라이브 탭 대신, 대표 설정(컴퓨트 패스를 컴퓨트
// 레인에 올리고 + 교차 큐 의존 켬)에서 오버랩 이득과 세마포어 스톨을 한 장에 보인다.
// ---------------------------------------------------------------------------

type Queue = 'graphics' | 'compute';

interface Pass {
  id: string;
  label: string;
  queue: Queue;
  dur: number;
}

// 5개 패스 — 대표 배정(컴퓨트 패스는 컴퓨트 큐로 옮겨 오버랩이 보이게).
// 길이는 "오버랩 이득은 크되 의존 스톨도 또렷이 보이는" 교육용 값으로 고정.
// (스케줄 손검증은 아래 schedule() 주석 참조.)
const PASSES: ReadonlyArray<Pass> = [
  { id: 'shadow', label: 'G-Shadow', queue: 'graphics', dur: 3 },
  { id: 'gbuffer', label: 'G-GBuffer', queue: 'graphics', dur: 3 },
  { id: 'ssao', label: 'C-SSAO', queue: 'compute', dur: 8 },
  { id: 'particles', label: 'C-Particles', queue: 'compute', dur: 3 },
  { id: 'lighting', label: 'G-Lighting', queue: 'graphics', dur: 4 },
] as const;

const DEP_FROM = 'ssao';
const DEP_TO = 'lighting';

interface Scheduled {
  pass: Pass;
  start: number;
  end: number;
}

interface Schedule {
  items: Scheduled[];
  makespan: number;
  serial: number;
  stall: number;
  depReadyT: number;
}

/** 작은 리스트 스케줄러: 큐 안 FIFO 직렬, 큐 간 동시, 교차 큐 의존은 세마포어. */
// 손검증(고정 값으로): graphics[shadow 0–3, gbuffer 3–6, lighting 8–12],
// compute[ssao 0–8, particles 8–11]. lighting은 fifoStart=6이지만 ssao 신호(8)를
// 기다려 8에서 시작 → stall=2. makespan=12, serial=21, 절감=9(≈43%).
function schedule(): Schedule {
  const queueEnd: Record<Queue, number> = { graphics: 0, compute: 0 };
  const endById: Record<string, number> = {};
  const items: Scheduled[] = [];

  let stall = 0;
  let depReadyT = 0;

  for (const pass of PASSES) {
    const fifoStart = queueEnd[pass.queue];
    let start = fifoStart;

    // 교차 큐 의존(세마포어): G-Lighting은 C-SSAO 종료까지 대기.
    if (pass.id === DEP_TO) {
      const signal = endById[DEP_FROM] ?? 0;
      depReadyT = fifoStart;
      if (signal > fifoStart) {
        stall = signal - fifoStart;
        start = signal;
      }
    }

    const end = start + pass.dur;
    queueEnd[pass.queue] = end;
    endById[pass.id] = end;
    items.push({ pass, start, end });
  }

  const makespan = Math.max(queueEnd.graphics, queueEnd.compute);
  const serial = PASSES.reduce((s, p) => s + p.dur, 0);
  return { items, makespan, serial, stall, depReadyT };
}

const CANVAS_H = 320;

export default function AsyncOverlapTimeline() {
  const sched = schedule();
  const savings = sched.serial - sched.makespan;
  const savingsPct = sched.serial > 0 ? (savings / sched.serial) * 100 : 0;

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 14;
    const labelW = 78;
    const plotX = padX + labelW;
    const plotW = w - plotX - padX;

    const tMax = Math.max(sched.serial, sched.makespan, 1);
    const xOf = (t: number): number => plotX + (t / tMax) * plotW;
    const wOf = (dt: number): number => (dt / tMax) * plotW;

    const top = 30;
    const serialY = top;
    const serialH = 22;
    const laneGap = 16;
    const laneH = 46;
    const gfxY = serialY + serialH + 26;
    const cmpY = gfxY + laneH + laneGap;

    // --- 직렬 기준선(faded) ---
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.muted;
    ctx.textBaseline = 'middle';
    ctx.fillText('직렬 기준선', plotX - 8, serialY + serialH / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    {
      let x = plotX;
      for (const p of PASSES) {
        const bw = wOf(p.dur);
        roundRect(ctx, x + 1, serialY, Math.max(2, bw - 2), serialH, 4);
        ctx.fillStyle = withAlpha(
          p.queue === 'graphics' ? QUEUE_COLORS.graphics : QUEUE_COLORS.compute,
          0.22,
        );
        ctx.fill();
        ctx.strokeStyle = withAlpha(theme.muted, 0.4);
        ctx.lineWidth = 1;
        ctx.stroke();
        x += bw;
      }
      ctx.strokeStyle = withAlpha(theme.muted, 0.5);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(xOf(sched.serial), serialY - 4);
      ctx.lineTo(xOf(sched.serial), cmpY + laneH + 6);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const lanes: Array<{ y: number; queue: Queue; label: string; color: string }> = [
      { y: gfxY, queue: 'graphics', label: '그래픽스 큐', color: QUEUE_COLORS.graphics },
      { y: cmpY, queue: 'compute', label: '컴퓨트 큐', color: QUEUE_COLORS.compute },
    ];

    for (const lane of lanes) {
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = lane.color;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(lane.label, plotX - 8, lane.y + laneH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      roundRect(ctx, plotX, lane.y, plotW, laneH, 8);
      ctx.fillStyle = withAlpha(theme.border, 0.3);
      ctx.fill();
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 스톨 갭(주황) — DEP_TO 레인에서 ready→start 사이.
    if (sched.stall > 0) {
      const target = sched.items.find((it) => it.pass.id === DEP_TO);
      const lane = lanes.find((l) => l.queue === target?.pass.queue);
      if (target && lane) {
        const sx = xOf(sched.depReadyT);
        const sw = wOf(sched.stall);
        roundRect(ctx, sx, lane.y + 6, Math.max(2, sw), laneH - 12, 4);
        ctx.fillStyle = withAlpha(QUEUE_COLORS.stall, 0.4);
        ctx.fill();
        ctx.strokeStyle = QUEUE_COLORS.stall;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = QUEUE_COLORS.stall;
        ctx.textAlign = 'center';
        ctx.fillText('스톨', sx + Math.max(2, sw) / 2, lane.y + laneH / 2 + 3);
        ctx.textAlign = 'left';
      }
    }

    // 패스 블록(간트).
    for (const it of sched.items) {
      const lane = lanes.find((l) => l.queue === it.pass.queue);
      if (!lane) continue;
      const bx = xOf(it.start);
      const bw = Math.max(6, wOf(it.pass.dur));
      const by = lane.y + 6;
      const bh = laneH - 12;
      roundRect(ctx, bx, by, bw, bh, 5);
      ctx.fillStyle = withAlpha(lane.color, 0.85);
      ctx.fill();
      ctx.strokeStyle = lane.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.pass.label, bx + bw / 2, by + bh / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // 의존 화살표(세마포어): C-SSAO 종료 → G-Lighting 시작.
    {
      const from = sched.items.find((it) => it.pass.id === DEP_FROM);
      const to = sched.items.find((it) => it.pass.id === DEP_TO);
      const fromLane = lanes.find((l) => l.queue === from?.pass.queue);
      const toLane = lanes.find((l) => l.queue === to?.pass.queue);
      if (from && to && fromLane && toLane) {
        const x1 = xOf(from.end);
        const y1 = fromLane.y + laneH / 2;
        const x2 = xOf(to.start);
        const y2 = toLane.y + laneH / 2;
        drawArrow(ctx, x1, y1, x2, y2, QUEUE_COLORS.stall, { dashed: true, width: 1.5, head: 6 });
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillStyle = QUEUE_COLORS.stall;
        ctx.fillText('세마포어', (x1 + x2) / 2 - 18, (y1 + y2) / 2 - 4);
      }
    }

    // makespan 자(ruler).
    {
      const ry = cmpY + laneH + 12;
      ctx.strokeStyle = QUEUE_COLORS.ok;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(plotX, ry);
      ctx.lineTo(xOf(sched.makespan), ry);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xOf(sched.makespan), ry - 4);
      ctx.lineTo(xOf(sched.makespan), ry + 4);
      ctx.stroke();
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = QUEUE_COLORS.ok;
      ctx.fillText(`makespan ${sched.makespan.toFixed(1)}`, plotX + 4, ry - 5);
    }
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, display: 'block' }}
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
        직렬: {sched.serial.toFixed(1)} ms · makespan:{' '}
        <span style={{ color: QUEUE_COLORS.ok }}>{sched.makespan.toFixed(1)} ms</span> · 절감:{' '}
        <span style={{ color: savings > 0 ? QUEUE_COLORS.ok : 'var(--muted)' }}>
          {savings.toFixed(1)} ms ({savingsPct.toFixed(0)}%)
        </span>{' '}
        · 스톨:{' '}
        <span style={{ color: QUEUE_COLORS.stall }}>{sched.stall.toFixed(1)} ms</span>
      </div>
      <figcaption>
        독립적인 작업을 서로 다른 큐에 올리면 GPU에서 <strong>동시에</strong> 돌아갑니다 — 비동기
        컴퓨트(C-SSAO·C-Particles)가 그래픽스의 노는 ALU를 메워 지연을 숨깁니다. 같은 큐 안에서는
        FIFO로 직렬 실행되고, <em>다른 큐끼리만</em> 겹칩니다. 위 그림에서 위쪽 “직렬 기준선”은 모든
        패스를 한 큐에 줄 세운 시간이고, 아래 두 레인은 컴퓨트 패스를 컴퓨트 큐로 옮겨 겹친 스케줄로 —
        makespan(초록 자)이 직렬보다 짧아진 만큼이 오버랩 <em>절감</em>입니다. 하지만 교차 큐 의존이
        생기면(여기서는 라이팅이 SSAO 결과를 필요로 함) <strong>세마포어</strong>로 기다려야 하고, 그
        대기가 <strong>스톨</strong>(주황 구간)이라는 동기화 비용을 만들어 makespan을 도로 늘립니다.
        SSAO가 길어질수록 이 스톨이 절감을 갉아먹어, 결국 <em>오버랩이 더는 이득이 아닌</em> 지점이
        옵니다. async 컴퓨트는 마법이 아니라, <strong>독립적인 일</strong>이 있고{' '}
        <strong>의존이 가벼울 때만</strong> 갚는 거래입니다.
      </figcaption>
    </figure>
  );
}
