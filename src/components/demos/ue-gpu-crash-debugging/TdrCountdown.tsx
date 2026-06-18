import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { UE_COLORS, roundRect, withAlpha, monoFont } from './ue2d';

// ---------------------------------------------------------------------------
// 모델: TDR (Timeout Detection and Recovery) — 2초 타임아웃
//
// 출처: Luke Thatcher (Epic) 발표.
// - GPU 크래시가 나도 CPU가 인식하는 건 약 2초 뒤.
// - TDR: OS가 정한 시간 안에 GPU 작업이 끝나지 않으면 프로세스를 강제 종료.
//   Windows 기본값 = 2초.
// - 예시 #1: 잘못된 주소 참조 → 큰 수로 루프 → 행(hang) → OS가 종료(TDR).
//
// 이 위젯: "작업 길이" 슬라이더로 디스패치한 GPU 작업이 얼마나 걸릴지 정한다.
// 타임라인에 2.0초 TDR 한계 마커가 있다. 디스패치하면 진행 바가 채워지고
// 경과 타이머가 흐른다.
//   - 작업이 2초 전에 끝나면 → ✅ 정상 완료.
//   - 작업 길이 ≥ 2초 (또는 hang) → t=2.0s에서 OS가 프로세스를 강제 종료(TDR):
//     얼리고, 빨갛게 점멸, 판정 표시.
// ---------------------------------------------------------------------------

const CANVAS_H = 300;
const TDR_LIMIT = 2.0; // 초 (Windows 기본)
const HANG = Infinity; // 행 시나리오: 절대 끝나지 않음

type Status = 'idle' | 'running' | 'done' | 'tdr';

/**
 * TDR 카운트다운 위젯.
 * GPU 작업 바가 시간에 따라 채워지고, 2.0초 TDR 한계를 넘기면
 * OS가 프로세스를 죽이는 과정을 보여준다.
 */
export default function TdrCountdown() {
  const [workLen, setWorkLen] = useState(1.2); // 초
  const [status, setStatus] = useState<Status>('idle');
  const [elapsed, setElapsed] = useState(0); // 초
  const [isHang, setIsHang] = useState(false);

  // rAF / 상태를 ref로도 들고 있어 콜백 클로저가 최신값을 보게 한다.
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const workLenRef = useRef(workLen);
  const flashRef = useRef(0); // TDR 점멸 위상

  workLenRef.current = isHang ? HANG : workLen;

  const stopRaf = (): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  // 언마운트 시 rAF 취소
  useEffect(() => stopRaf, []);

  const tick = (now: number): void => {
    const t = (now - startRef.current) / 1000;
    const len = workLenRef.current;

    if (t >= TDR_LIMIT && len >= TDR_LIMIT) {
      // OS가 2초 한계에서 프로세스 강제 종료
      setElapsed(TDR_LIMIT);
      setStatus('tdr');
      flashRef.current = now;
      stopRaf();
      return;
    }
    if (t >= len) {
      // 작업 정상 완료 (2초 전)
      setElapsed(len);
      setStatus('done');
      stopRaf();
      return;
    }
    setElapsed(t);
    rafRef.current = requestAnimationFrame(tick);
  };

  const dispatch = (hang: boolean): void => {
    stopRaf();
    setIsHang(hang);
    workLenRef.current = hang ? HANG : workLen;
    setElapsed(0);
    setStatus('running');
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  };

  const reset = (): void => {
    stopRaf();
    setStatus('idle');
    setElapsed(0);
    setIsHang(false);
  };

  // TDR 상태에서 빨간 점멸을 위해 가벼운 리렌더 루프.
  useEffect(() => {
    if (status !== 'tdr') return;
    let id = 0;
    let alive = true;
    const loop = (): void => {
      if (!alive) return;
      setElapsed((e) => e); // 강제 리드로우 트리거(값 동일)
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [status]);

  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const padX = 16;
    const plotX = padX;
    const plotW = w - padX * 2;

    // 시간 축: 0 .. axisMax. 2.5초까지 보여 2초 마커가 가운데쯤.
    const axisMax = 2.6;
    const xOf = (t: number): number => plotX + (Math.min(t, axisMax) / axisMax) * plotW;

    // 제목
    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('GPU 작업 — TDR 2초 타임아웃', plotX, 20);

    // 작업 진행 바
    const barY = 50;
    const barH = 46;
    roundRect(ctx, plotX, barY, plotW, barH, 8);
    ctx.fillStyle = withAlpha(theme.border, 0.3);
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    const tdr = status === 'tdr';
    // 점멸 위상
    const flashOn = tdr ? Math.floor((performance.now() - flashRef.current) / 250) % 2 === 0 : false;

    // 채워진 진행분
    const fillFrac = Math.min(elapsed, axisMax) / axisMax;
    if (fillFrac > 0) {
      const fillW = fillFrac * plotW;
      roundRect(ctx, plotX, barY, Math.max(2, fillW), barH, 8);
      let col: string;
      if (tdr) col = flashOn ? UE_COLORS.bad : withAlpha(UE_COLORS.bad, 0.45);
      else if (status === 'done') col = UE_COLORS.ok;
      else col = UE_COLORS.graphics;
      ctx.fillStyle = withAlpha(col, tdr ? 1 : 0.85);
      ctx.fill();
    }

    // 작업 길이 목표 마커(반투명, 작업이 끝나는 지점)
    const len = isHang ? HANG : workLen;
    if (len <= axisMax) {
      const lx = xOf(len);
      ctx.strokeStyle = withAlpha(theme.text, 0.4);
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, barY - 6);
      ctx.lineTo(lx, barY + barH + 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = monoFont(9);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'center';
      ctx.fillText('작업 끝', lx, barY + barH + 18);
      ctx.textAlign = 'left';
    }

    // 2초 TDR 한계 마커(빨간 굵은 선)
    const tx = xOf(TDR_LIMIT);
    ctx.strokeStyle = UE_COLORS.bad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tx, barY - 14);
    ctx.lineTo(tx, barY + barH + 14);
    ctx.stroke();
    ctx.font = monoFont(10);
    ctx.fillStyle = UE_COLORS.bad;
    ctx.textAlign = 'center';
    ctx.fillText('TDR 2.0s', tx, barY - 18);
    ctx.textAlign = 'left';

    // 경과 타이머(큰 숫자)
    ctx.font = monoFont(28);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let timeColor: string;
    if (tdr) timeColor = UE_COLORS.bad;
    else if (status === 'done') timeColor = UE_COLORS.ok;
    else timeColor = theme.text;
    ctx.fillStyle = timeColor;
    ctx.fillText(`${elapsed.toFixed(2)}s`, w / 2, barY + barH + 56);
    ctx.font = monoFont(11);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = theme.muted;
    ctx.fillText('경과 시간', w / 2, barY + barH + 78);
    ctx.textAlign = 'left';

    // 판정 바
    const vy = barY + barH + 96;
    let verdict = '';
    let vColor = theme.muted;
    if (status === 'done') {
      verdict = '✅ 정상 완료 — GPU 작업이 2초 안에 끝남';
      vColor = UE_COLORS.ok;
    } else if (tdr) {
      verdict = isHang
        ? '⛔ TDR: 행(hang) — OS가 2초 내 미완료 GPU를 강제 종료'
        : '⛔ TDR: OS가 2초 내 미완료 GPU를 강제 종료';
      vColor = UE_COLORS.bad;
    } else if (status === 'running') {
      verdict = isHang ? '실행 중… (행: 절대 끝나지 않음)' : '실행 중…';
      vColor = UE_COLORS.graphics;
    } else {
      verdict = '“디스패치”를 눌러 GPU 작업을 실행';
      vColor = theme.muted;
    }
    if (!(tdr && !flashOn)) {
      roundRect(ctx, plotX, vy, plotW, 30, 6);
      ctx.fillStyle = withAlpha(vColor, 0.14);
      ctx.fill();
      ctx.strokeStyle = vColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = monoFont(11);
      ctx.fillStyle = vColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(verdict, plotX + plotW / 2, vy + 15);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  };

  const { ref } = useCanvas2d(draw, [status, elapsed, workLen, isHang]);

  const running = status === 'running';

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: CANVAS_H, touchAction: 'none', display: 'block' }}
      />
      <ControlPanel>
        <Slider
          label="작업 길이"
          value={workLen}
          min={0.2}
          max={4}
          step={0.1}
          onChange={setWorkLen}
          format={(v) => `${v.toFixed(1)} s`}
        />
        <Btn onClick={() => dispatch(false)} disabled={running}>
          디스패치
        </Btn>
        <Btn onClick={() => dispatch(true)} disabled={running} variant="ghost">
          행(hang) 시나리오
        </Btn>
        <Btn onClick={reset} variant="ghost">
          리셋
        </Btn>
      </ControlPanel>
      <figcaption>
        GPU가 작업을 마치지 못하고 멈추면, OS의 <strong>TDR</strong>(Timeout Detection and
        Recovery)이 개입합니다 — Windows 기본값은 <strong>2초</strong>입니다. 정해진 시간 안에 GPU
        작업이 끝나지 않으면 OS가 드라이버를 리셋하며 <strong>프로세스를 강제 종료</strong>합니다.
        발표의 예시 #1이 바로 이 경우였습니다: 잘못된 주소를 참조해 큰 수로 루프를 돌다 <em>행(hang)</em>에
        빠졌고, 그 결과 TDR로 죽었습니다. 중요한 점은 GPU 크래시를 CPU가 인식하는 건 보통{' '}
        <strong>약 2초 뒤</strong>라는 것 — 그래서 GPU hang은 마치 “2초 늦게 터지는 크래시”처럼
        보입니다. (출처: Luke Thatcher (Epic) 발표.)
        <br />
        <strong>직접 해보세요:</strong> 작업 길이를 2초 미만으로 두고 “디스패치”하면 초록색 ✅ 정상
        완료가 뜹니다. 길이를 2초 이상으로 올리거나 “행(hang) 시나리오”를 누르면, 경과 타이머가 정확히
        2.0초에서 빨갛게 점멸하며 OS가 프로세스를 죽입니다.
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 작은 버튼 — 컨트롤 툴킷에 버튼 프리미티브가 없어 캔버스 밖(DOM)에서
// CSS 변수만 읽는 플레인 버튼으로 직접 만든다. 탭 타깃 ≥ 38px.
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
