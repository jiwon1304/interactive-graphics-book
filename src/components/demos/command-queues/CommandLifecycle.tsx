import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { QUEUE_COLORS, roundRect, withAlpha, drawArrow } from './cq2d';

// ---------------------------------------------------------------------------
// 정적 도식: 명령의 일생 — 기록(record) → 제출(submit) → 실행(execute)
//
// 현대 명시적 GPU API(D3D12/Vulkan)에서 CPU는 GPU를 "함수처럼" 호출하지 않는다.
// CPU는 명령을 커맨드 리스트(command list)에 기록(record)하고, 그 리스트를
// 큐(queue)에 제출(submit, ExecuteCommandLists/vkQueueSubmit)할 뿐이다.
// GPU는 나중에, 비동기로, FIFO 순서로 큐에서 꺼내 실행한다.
//
// 이 도식은 그 세 레인이 동시에 어떤 상태인지를 "한 장의 정지 화면"으로 보여준다.
// (비-렌더링 시스템 주제라 라이브 조작 대신 라벨이 달린 정적 그림으로 가르친다.)
// ---------------------------------------------------------------------------

type CmdKind = 'Draw' | 'Dispatch' | 'Copy' | 'Clear';

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

// 대표 스냅샷(잘 고른 고정 값):
//  - CPU 레인: 아직 열린(기록 중인) 커맨드 리스트에 명령 2개.
//  - 큐 레인: 이미 제출된 배치 2개가 FIFO로 줄 서 있음(#1이 먼저).
//  - GPU 레인: 배치 #1의 첫 명령을 실행 중(절반 진행) + 완료 히스토리 2개.
const OPEN_LIST: CmdKind[] = ['Draw', 'Clear'];
const QUEUE_BATCHES: { id: number; cmds: CmdKind[] }[] = [
  { id: 1, cmds: ['Draw', 'Dispatch'] },
  { id: 2, cmds: ['Copy', 'Draw'] },
];
const GPU_HISTORY: CmdKind[] = ['Clear', 'Draw']; // 오래된→최근
const GPU_RUNNING: CmdKind = 'Dispatch';
const GPU_PROGRESS = 0.55;

const CANVAS_H = 320;

export default function CommandLifecycle() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 14;
    const laneH = 64;
    const laneGap = 34; // 레인 사이 간격 — 화살표 라벨(제출/드레인)이 레인 헤더와 안 겹치게
    const top0 = 30;
    const laneX = padX;
    const laneW = w - laneX - padX;

    const lanes: Array<{ y: number; label: string }> = [
      { y: top0, label: '① CPU: 기록(record) — 열린 커맨드 리스트' },
      { y: top0 + laneH + laneGap, label: '② 큐(queue) 대기열 — FIFO(제출 순서)' },
      { y: top0 + 2 * (laneH + laneGap), label: '③ GPU: 실행(execute)' },
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

    const drawChip = (
      x: number,
      y: number,
      kind: CmdKind,
      opts?: { alpha?: number; progress?: number },
    ): void => {
      const a = opts?.alpha ?? 1;
      const col = cmdColor(kind);
      roundRect(ctx, x, y, chipW, chipH, 6);
      ctx.fillStyle = withAlpha(col, 0.22 * a);
      ctx.fill();
      ctx.strokeStyle = withAlpha(col, a);
      ctx.lineWidth = 1.5;
      ctx.stroke();
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
      ctx.fillText(kind, x + chipW / 2, y + chipH / 2 + 0.5);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    };

    // (1) CPU 레인: 열린 리스트의 칩들 + "아직 GPU가 모름" 주석
    {
      const lane = lanes[0];
      const cy = lane.y + (laneH - chipH) / 2;
      let x = laneX + 10;
      for (const kind of OPEN_LIST) {
        drawChip(x, cy, kind);
        x += chipW + chipGap;
      }
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.fillText('아직 GPU는 모름 — 메모리에 적는 중', x + 8, lane.y + laneH / 2 + 3);
    }

    // (2) 큐 레인: 제출된 배치들(점선 묶음 = 한 번의 ExecuteCommandLists)
    {
      const lane = lanes[1];
      const cy = lane.y + (laneH - chipH) / 2;
      let x = laneX + 10;
      for (const batch of QUEUE_BATCHES) {
        const groupW = batch.cmds.length * chipW + (batch.cmds.length - 1) * chipGap + 10;
        roundRect(ctx, x - 5, cy - 7, groupW, chipH + 14, 8);
        ctx.strokeStyle = theme.text;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = theme.muted;
        ctx.fillText(`배치 #${batch.id}`, x - 4, cy - 9);
        let cx = x;
        for (const kind of batch.cmds) {
          drawChip(cx, cy, kind);
          cx += chipW + chipGap;
        }
        x += groupW + 14;
      }
      // 드레인 방향 화살표(맨 앞 #1이 먼저 꺼내짐)
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'right';
      ctx.fillText('← 먼저 꺼냄', laneX + laneW - 6, lane.y + 12);
      ctx.textAlign = 'start';
    }

    // (3) GPU 레인: 완료 히스토리(연하게) + 현재 실행 중(진행 바)
    {
      const lane = lanes[2];
      const cy = lane.y + (laneH - chipH) / 2;
      let x = laneX + 10;
      for (const kind of GPU_HISTORY) {
        drawChip(x, cy, kind, { alpha: 0.4 });
        x += chipW + chipGap;
      }
      drawChip(x, cy, GPU_RUNNING, { progress: GPU_PROGRESS });
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = QUEUE_COLORS.ok;
      ctx.fillText('▶ 실행 중', x, cy - 6);
      ctx.fillStyle = theme.muted;
      ctx.fillText('완료(history)', laneX + 10, cy + chipH + 13);
    }

    // 흐름 화살표: ①→②(제출), ②→③(드레인)
    {
      const midX = laneX + 28;
      const a = withAlpha(theme.muted, 0.8);
      // ① → ②
      drawArrow(
        ctx,
        midX,
        lanes[0].y + laneH + 2,
        midX,
        lanes[1].y - 2,
        a,
        { width: 1.4, head: 6 },
      );
      ctx.save();
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      // 라벨은 출발 레인 바로 아래(갭 상단)에 둠 → 도착 레인 헤더(갭 하단)와 분리
      ctx.fillText('제출', midX + 8, lanes[0].y + laneH + 12);
      ctx.restore();
      // ② → ③
      drawArrow(
        ctx,
        midX,
        lanes[1].y + laneH + 2,
        midX,
        lanes[2].y - 2,
        a,
        { width: 1.4, head: 6 },
      );
      ctx.save();
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = theme.muted;
      ctx.fillText('드레인(나중에)', midX + 8, lanes[1].y + laneH + 12);
      ctx.restore();
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
      <figcaption>
        명령은 세 단계를 거칩니다. <strong>기록(record)</strong>은 CPU가 명령을 커맨드 리스트에
        써 넣는 것이고(레인 ①), <strong>제출(submit)</strong>은 그 리스트를 통째로 큐에 넘기는 것(한 번의
        ExecuteCommandLists 호출 = 점선으로 묶인 한 배치, 레인 ②)입니다. 하지만 제출해도{' '}
        <em>그 자리에서 실행되지 않습니다</em> — 명령은 큐에 FIFO로 줄을 서고(먼저 제출한 배치 #1이
        먼저 꺼내짐), GPU가 차례가 되어야 비로소 <strong>실행(execute)</strong>합니다(레인 ③). 이
        시간 간격이 “비동기 갭”입니다. 위 그림은 그 순간의 한 장면입니다: CPU는 새 리스트를 적는 중,
        큐엔 제출된 배치 둘이 대기, GPU는 배치 #1의 첫 명령을 실행 중입니다. GPU가 한 리스트를 다
        끝내기 전에는 그 리스트가 쓰던 커맨드 할당자 메모리를 재사용할 수 없는데, “언제 끝났는지”를
        CPU가 알려면 다음 절의 <em>펜스(fence)</em>가 필요합니다.
      </figcaption>
    </figure>
  );
}
