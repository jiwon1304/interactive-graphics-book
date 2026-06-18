import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { UE_COLORS, roundRect, withAlpha, monoFont } from './ue2d';

// ---------------------------------------------------------------------------
// 정적 도식: RHI Breadcrumbs (Luke Thatcher (Epic) 발표)
//
// 렌더링이 진행되는 동안 각 렌더 패스가 시작될 때, 작은 버퍼에
// "monotonic하게 증가하는 정수"를 흔적(breadcrumb)으로 기록한다.
// GPU가 어딘가에서 멈춰도(hang) 마지막으로 기록된 흔적값이 어떤 패스에서
// 멈췄는지 알려준다. CPU는 한참(약 2초) 뒤에야 멈춤을 인지한다.
//
// 이 그림은 BasePass에서 hang한 "크래시 직후" 상태 하나를 그대로 정지시켜
// 보여준다(인터랙티브 아님). 마지막 기록값이 어떻게 범인을 호명하는지,
// 그리고 CPU가 ~2초 뒤에야 인지하는지를 라벨로 박아 둔다.
//
// Stat GPU / Profile GPU / Unreal Insights가 모두 이 Breadcrumb 위에서 동작한다.
// ---------------------------------------------------------------------------

interface RenderPass {
  id: string;
  label: string;
}

// 한 프레임의 고정된 렌더 패스 순서(전형적인 디퍼드 파이프라인 일부).
const PASSES: ReadonlyArray<RenderPass> = [
  { id: 'prepass', label: 'PrePass(Z)' },
  { id: 'shadows', label: 'ShadowDepths' },
  { id: 'basepass', label: 'BasePass' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'translucency', label: 'Translucency' },
  { id: 'postprocess', label: 'PostProcess' },
] as const;

const CANVAS_H = 330;

// 정지시킬 크래시 시점: BasePass(인덱스 2)에서 hang.
const CRASH_INDEX = 2;

export default function BreadcrumbTracer() {
  // 정적 상태: BasePass까지 진행한 뒤 거기서 멈춤(hang).
  const step = CRASH_INDEX; // 현재 active = BasePass
  const lastBreadcrumb = step + 1; // = 3 (monotonic 마지막 기록값)

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 14;
    const top = 14;
    // 왼쪽: 렌더 패스 목록. 오른쪽: breadcrumb 버퍼.
    const colGap = 14;
    const listW = Math.min(190, (w - padX * 2 - colGap) * 0.52);
    const listX = padX;
    const bufX = listX + listW + colGap;
    const bufW = w - bufX - padX;

    // --- 헤더 ---
    ctx.font = monoFont(11);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.muted;
    ctx.fillText('렌더 패스 (GPU 진행)', listX, top);
    ctx.fillText('breadcrumb 버퍼', bufX, top);

    const rowY0 = top + 14;
    const rowH = 38;
    const rowGap = 6;

    // --- 패스 행들 ---
    for (let i = 0; i < PASSES.length; i++) {
      const p = PASSES[i];
      const y = rowY0 + i * (rowH + rowGap);
      const done = i < step; // 통과한 패스(초록)
      const active = i === step; // BasePass = active
      const isCrashRow = i === step; // 여기서 hang

      roundRect(ctx, listX, y, listW, rowH, 7);
      if (isCrashRow) {
        ctx.fillStyle = withAlpha(UE_COLORS.bad, 0.2);
      } else if (active) {
        ctx.fillStyle = withAlpha(UE_COLORS.active, 0.22);
      } else if (done) {
        ctx.fillStyle = withAlpha(UE_COLORS.ok, 0.16);
      } else {
        ctx.fillStyle = withAlpha(theme.border, 0.3);
      }
      ctx.fill();
      ctx.lineWidth = active || isCrashRow ? 2 : 1;
      ctx.strokeStyle = isCrashRow
        ? UE_COLORS.bad
        : active
          ? UE_COLORS.active
          : done
            ? withAlpha(UE_COLORS.ok, 0.7)
            : theme.border;
      ctx.stroke();

      // 상태 점
      const dotX = listX + 14;
      const dotY = y + rowH / 2;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
      ctx.fillStyle = isCrashRow
        ? UE_COLORS.bad
        : done
          ? UE_COLORS.ok
          : withAlpha(theme.muted, 0.5);
      ctx.fill();

      ctx.font = monoFont(12);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.label, dotX + 14, dotY - 0.5);

      // active/crash 표시
      if (isCrashRow) {
        ctx.font = monoFont(9);
        ctx.fillStyle = UE_COLORS.bad;
        ctx.textAlign = 'right';
        ctx.fillText('HANG', listX + listW - 10, dotY - 0.5);
      } else if (done) {
        ctx.font = monoFont(9);
        ctx.fillStyle = withAlpha(UE_COLORS.ok, 0.9);
        ctx.textAlign = 'right';
        ctx.fillText('통과', listX + listW - 10, dotY - 0.5);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // --- breadcrumb 버퍼(오른쪽): 기록된 만큼 행이 자라남 ---
    const recorded = step + 1; // 기록된 흔적 개수 (= 3)
    const bRowY0 = rowY0;
    const bRowH = 26;
    const bRowGap = 4;
    for (let i = 0; i < PASSES.length; i++) {
      const y = bRowY0 + i * (bRowH + bRowGap);
      const filled = i < recorded;
      const isLast = i === step;
      roundRect(ctx, bufX, y, bufW, bRowH, 5);
      if (filled) {
        ctx.fillStyle = withAlpha(isLast ? UE_COLORS.bad : UE_COLORS.graphics, 0.16);
        ctx.fill();
        ctx.lineWidth = isLast ? 2 : 1;
        ctx.strokeStyle = isLast ? UE_COLORS.bad : withAlpha(UE_COLORS.graphics, 0.7);
        ctx.stroke();

        ctx.font = monoFont(11);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = theme.text;
        // [idx] passName = N  (N은 monotonic 정수)
        ctx.fillText(`[${i}] ${PASSES[i].label}`, bufX + 8, y + bRowH / 2 - 0.5);
        ctx.textAlign = 'right';
        ctx.fillStyle = isLast ? UE_COLORS.bad : UE_COLORS.graphics;
        ctx.font = monoFont(12);
        ctx.fillText(`= ${i + 1}`, bufX + bufW - 8, y + bRowH / 2 - 0.5);
      } else {
        // 아직 기록 안 된 슬롯(점선 빈칸) — 크래시로 영영 안 채워짐.
        ctx.fillStyle = withAlpha(theme.border, 0.2);
        ctx.fill();
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = withAlpha(theme.muted, 0.4);
        ctx.stroke();
        ctx.setLineDash([]);
        if (i === recorded) {
          // 첫 빈칸에 "여기서 멈춤" 표시
          ctx.font = monoFont(9);
          ctx.fillStyle = withAlpha(theme.muted, 0.85);
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText('(기록 멈춤 — 더 이상 증가 안 함)', bufX + 8, y + bRowH / 2 - 0.5);
        }
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // --- 진단 배너(맨 아래) ---
    const bannerY = bRowY0 + PASSES.length * (bRowH + bRowGap) + 6;
    const bannerH = h - bannerY - 8;
    if (bannerH > 18) {
      roundRect(ctx, padX, bannerY, w - padX * 2, bannerH, 7);
      const col = UE_COLORS.bad;
      const passLabel = PASSES[step]?.label ?? '?';
      const msg = `마지막 기록값 = ${lastBreadcrumb} → "${passLabel}"에서 멈췄다`;
      ctx.fillStyle = withAlpha(col, 0.14);
      ctx.fill();
      ctx.strokeStyle = withAlpha(col, 0.7);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = monoFont(11);
      ctx.fillStyle = col;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, padX + 10, bannerY + bannerH / 2 - 8);

      // CPU 인지 지연 메모
      ctx.font = monoFont(10);
      ctx.fillStyle = theme.muted;
      ctx.fillText(
        'CPU: 아직 정상으로 보임 — hang을 약 2초 뒤에야 인지',
        padX + 10,
        bannerY + bannerH / 2 + 9,
      );
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block' }}
      />
      <figcaption>
        RHI <strong>Breadcrumbs</strong>: 렌더링이 진행되는 동안 각 렌더 패스가{' '}
        <em>시작될 때</em> 작은 버퍼에 <strong>monotonic하게 증가하는 정수</strong>를 흔적으로
        남깁니다. 위 그림은 <strong>BasePass에서 hang</strong>한 크래시 직후 상태를 그대로 정지시킨
        모습입니다 — 버퍼에 1, 2, 3까지 기록된 뒤 더 이상 자라지 않으므로,{' '}
        <strong>마지막 기록값 3</strong>이 곧 "BasePass에서 멈췄다"를 정확히 짚어 줍니다. 결정적으로,
        CPU는 GPU의 멈춤을 <strong>약 2초 뒤</strong>에야 인지하기 때문에(이게 GPU 디버깅이 어려운
        이유), 이 흔적이 없으면 "어디서 죽었는지"조차 알기 힘듭니다. Stat GPU · Profile GPU · Unreal
        Insights가 모두 이 Breadcrumb 위에서 동작해 스레드·GPU 전반에서 패스 이름을 일관되게
        유지합니다. (Luke Thatcher (Epic) 발표)
      </figcaption>
    </figure>
  );
}
