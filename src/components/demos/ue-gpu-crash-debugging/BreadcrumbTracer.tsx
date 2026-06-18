import { useEffect, useRef, useState } from 'react';
import { ControlPanel, SelectControl, type SelectOption } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { UE_COLORS, roundRect, withAlpha, monoFont } from './ue2d';

// ---------------------------------------------------------------------------
// 모델: RHI Breadcrumbs (Luke Thatcher (Epic) 발표)
//
// 렌더링이 진행되는 동안 각 렌더 패스가 시작될 때, 작은 버퍼에
// "monotonic하게 증가하는 정수"를 흔적(breadcrumb)으로 기록한다.
// GPU가 어딘가에서 멈춰도(hang) 마지막으로 기록된 흔적값이 어떤 패스에서
// 멈췄는지 알려준다. CPU는 한참(약 2초) 뒤에야 멈춤을 인지한다.
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

// 패스당 머무는 시간(ms). 애니메이션 속도.
const STEP_MS = 460;
const CANVAS_H = 330;

type CrashTarget = 'none' | (typeof PASSES)[number]['id'];

const CRASH_OPTIONS: ReadonlyArray<SelectOption<CrashTarget>> = [
  { value: 'none', label: '없음 (정상 완료)' },
  ...PASSES.map((p) => ({ value: p.id as CrashTarget, label: `${p.label}에서 크래시` })),
];

// 실행 상태. step = 현재 active 패스의 인덱스(-1 = 시작 전).
// crashed = 그 패스에서 hang. finished = 정상 완료.
type Phase = 'idle' | 'running' | 'crashed' | 'finished';

export default function BreadcrumbTracer() {
  const [crashTarget, setCrashTarget] = useState<CrashTarget>('basepass');
  const [step, setStep] = useState<number>(-1);
  const [phase, setPhase] = useState<Phase>('idle');
  // CPU가 hang을 인지하기까지 남은 시간 표시(약 2초). 0이면 인지 완료.
  const [cpuNoticeMs, setCpuNoticeMs] = useState<number>(0);

  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const crashIndex =
    crashTarget === 'none' ? -1 : PASSES.findIndex((p) => p.id === crashTarget);

  // 마지막으로 기록된 breadcrumb 값. step이 진행되며 1,2,3...로 monotonic 증가.
  // (idle=0개 기록, step k까지 진행 시 k+1개 기록 → 마지막 값 = step+1)
  const lastBreadcrumb = step >= 0 ? step + 1 : 0;

  const stop = (): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const reset = (): void => {
    stop();
    setStep(-1);
    setPhase('idle');
    setCpuNoticeMs(0);
  };

  const run = (): void => {
    stop();
    setStep(-1);
    setPhase('running');
    setCpuNoticeMs(0);
    lastTickRef.current = performance.now();
  };

  // 실행 RAF 루프: STEP_MS마다 한 패스씩 전진. crashIndex에 닿으면 hang.
  useEffect(() => {
    if (phase !== 'running' && phase !== 'crashed') return;

    const tick = (now: number): void => {
      if (phase === 'crashed') {
        // hang 상태: CPU가 인지하기까지 카운트다운(약 2초).
        const dt = now - lastTickRef.current;
        lastTickRef.current = now;
        setCpuNoticeMs((ms) => Math.max(0, ms - dt));
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (now - lastTickRef.current >= STEP_MS) {
        lastTickRef.current = now;
        setStep((s) => {
          const next = s + 1;
          if (next === crashIndex) {
            // 이 패스에서 hang. breadcrumb은 더 이상 증가하지 않는다.
            setPhase('crashed');
            setCpuNoticeMs(2000); // 약 2초 뒤 CPU가 인지
            return next;
          }
          if (next >= PASSES.length - 1) {
            setPhase('finished');
            return PASSES.length - 1;
          }
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, crashIndex]);

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
      const done = step > i || (phase === 'finished' && i <= step);
      const active = i === step && (phase === 'running' || phase === 'crashed');
      const isCrashRow = phase === 'crashed' && i === step;

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
        : active
          ? UE_COLORS.active
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
      } else if (active) {
        ctx.font = monoFont(9);
        ctx.fillStyle = UE_COLORS.active;
        ctx.textAlign = 'right';
        ctx.fillText('active', listX + listW - 10, dotY - 0.5);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // --- breadcrumb 버퍼(오른쪽): 기록된 만큼 행이 자라남 ---
    const recorded = step + 1; // 기록된 흔적 개수
    const bRowY0 = rowY0;
    const bRowH = 26;
    const bRowGap = 4;
    for (let i = 0; i < PASSES.length; i++) {
      const y = bRowY0 + i * (bRowH + bRowGap);
      const filled = i < recorded;
      const isLast = i === step;
      roundRect(ctx, bufX, y, bufW, bRowH, 5);
      if (filled) {
        ctx.fillStyle = withAlpha(
          phase === 'crashed' && isLast ? UE_COLORS.bad : UE_COLORS.graphics,
          0.16,
        );
        ctx.fill();
        ctx.lineWidth = phase === 'crashed' && isLast ? 2 : 1;
        ctx.strokeStyle =
          phase === 'crashed' && isLast
            ? UE_COLORS.bad
            : withAlpha(UE_COLORS.graphics, 0.7);
        ctx.stroke();

        ctx.font = monoFont(11);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = theme.text;
        // [idx] passName = N  (N은 monotonic 정수)
        ctx.fillText(`[${i}] ${PASSES[i].label}`, bufX + 8, y + bRowH / 2 - 0.5);
        ctx.textAlign = 'right';
        ctx.fillStyle =
          phase === 'crashed' && isLast ? UE_COLORS.bad : UE_COLORS.graphics;
        ctx.font = monoFont(12);
        ctx.fillText(`= ${i + 1}`, bufX + bufW - 8, y + bRowH / 2 - 0.5);
      } else {
        // 아직 기록 안 된 슬롯(점선 빈칸)
        ctx.fillStyle = withAlpha(theme.border, 0.2);
        ctx.fill();
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = withAlpha(theme.muted, 0.4);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // --- 진단 배너(맨 아래) ---
    const bannerY = bRowY0 + PASSES.length * (bRowH + bRowGap) + 6;
    const bannerH = h - bannerY - 8;
    if (bannerH > 18) {
      roundRect(ctx, padX, bannerY, w - padX * 2, bannerH, 7);
      let msg = '';
      let col = theme.muted;
      if (phase === 'crashed') {
        col = UE_COLORS.bad;
        const passLabel = PASSES[step]?.label ?? '?';
        msg = `마지막 기록값 = ${lastBreadcrumb} → "${passLabel}"에서 멈췄다`;
      } else if (phase === 'finished') {
        col = UE_COLORS.ok;
        msg = `프레임 완료 · 마지막 기록값 = ${lastBreadcrumb} (모든 패스 통과)`;
      } else if (phase === 'running') {
        col = UE_COLORS.active;
        msg = `진행 중 · 마지막 기록값 = ${lastBreadcrumb}`;
      } else {
        col = theme.muted;
        msg = '"프레임 실행"을 눌러 GPU 진행과 breadcrumb 기록을 보세요';
      }
      ctx.fillStyle = withAlpha(col, 0.14);
      ctx.fill();
      ctx.strokeStyle = withAlpha(col, 0.7);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = monoFont(11);
      ctx.fillStyle = col;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, padX + 10, bannerY + (phase === 'crashed' ? bannerH / 2 - 8 : bannerH / 2));

      // CPU 인지 지연 메모
      if (phase === 'crashed') {
        ctx.font = monoFont(10);
        ctx.fillStyle = theme.muted;
        const noticed = cpuNoticeMs <= 0;
        const note = noticed
          ? 'CPU: hang 인지 완료 (약 2초 뒤에야 알아챔)'
          : `CPU: 아직 정상으로 보임… ${(cpuNoticeMs / 1000).toFixed(1)}초 뒤 인지`;
        ctx.fillText(note, padX + 10, bannerY + bannerH / 2 + 9);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  };

  const { ref } = useCanvas2d(draw, [step, phase, crashTarget, cpuNoticeMs]);

  const running = phase === 'running';

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block' }}
      />
      <ControlPanel>
        <SelectControl<CrashTarget>
          label="크래시 주입"
          value={crashTarget}
          options={CRASH_OPTIONS}
          onChange={(v) => {
            setCrashTarget(v);
            reset();
          }}
        />
        <Btn onClick={run} disabled={running}>
          {running ? '실행 중…' : '프레임 실행'}
        </Btn>
        <Btn onClick={reset} variant="ghost">
          리셋
        </Btn>
      </ControlPanel>
      <figcaption>
        RHI <strong>Breadcrumbs</strong>: 렌더링이 진행되는 동안 각 렌더 패스가{' '}
        <em>시작될 때</em> 작은 버퍼에 <strong>monotonic하게 증가하는 정수</strong>를 흔적으로
        남깁니다. GPU가 어딘가에서 멈춰도(hang) <strong>마지막 기록값</strong>이 어느 패스에서
        멈췄는지 정확히 짚어 줍니다. 결정적으로, CPU는 GPU의 멈춤을 <strong>약 2초 뒤</strong>에야
        인지하기 때문에(이게 GPU 디버깅이 어려운 이유), 이 흔적이 없으면 "어디서 죽었는지"조차 알기
        힘듭니다. Stat GPU · Profile GPU · Unreal Insights가 모두 이 Breadcrumb 위에서 동작해
        스레드·GPU 전반에서 패스 이름을 일관되게 유지합니다. (Luke Thatcher (Epic) 발표)
        <br />
        <strong>직접 해보세요:</strong> "크래시 주입"에서 패스를 하나 골라 "프레임 실행"을 누르세요.
        흔적값이 1,2,3… 으로 자라다가 그 패스에서 <em>멈추고</em>, "마지막 기록값 = N → 이
        패스에서 멈췄다"가 뜹니다. "없음"으로 두면 끝까지 통과합니다.
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 작은 버튼 — 컨트롤 툴킷에 버튼 프리미티브가 없어 캔버스 밖(DOM)에서
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
