import { useState } from 'react';
import { ControlPanel, Slider, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, monoFont, label } from './tf2d';

// 미니피케이션 앨리어싱 (훅).
// 한 줄(1D) 줄무늬 텍스처를, 왼→오른쪽으로 갈수록 "한 픽셀이 더 많은 텍셀을 덮는"
// (= 멀어지는) 미니피케이션으로 그린다.
//   - 필터 OFF: 점 샘플(nearest, 밉 없음) → 멀어질수록 모아레가 들끓고,
//     '카메라 이동(위상)'을 끌면 무늬가 *살아 움직인다*(shimmer).
//   - 필터 ON: 픽셀 footprint를 평균(prefilter) → 멀리는 매끈한 회색, 위상에도 안정.
//
// 1D 사각파(주기 P 텍셀, 절반 검정/절반 흰색)로 단순화.
// "옳은 값" = footprint 평균 = 사각파를 [t, t+rho]에서 적분(여기선 64샘플 평균으로 근사).

const DARK: [number, number, number] = [40, 46, 60];
const LITE: [number, number, number] = [230, 234, 242];
const P = 8; // 줄무늬 주기(텍셀)
const NCOL = 64; // 출력 열 수
const NROW = 1; // (개념상 1D — 세로는 같은 값으로 채움)

function squareAt(t: number): number {
  const m = ((t % P) + P) % P;
  return m < P / 2 ? 0 : 1; // 0=검정, 1=흰색
}

// [t, t+rho]에서 사각파 평균(=prefilter한 옳은 값).
function squareAvg(t: number, rho: number): number {
  const K = 64;
  let s = 0;
  for (let k = 0; k < K; k++) s += squareAt(t + ((k + 0.5) / K) * rho);
  return s / K;
}

function gray(v: number): string {
  const r = Math.round(DARK[0] + (LITE[0] - DARK[0]) * v);
  const g = Math.round(DARK[1] + (LITE[1] - DARK[1]) * v);
  const b = Math.round(DARK[2] + (LITE[2] - DARK[2]) * v);
  return `rgb(${r},${g},${b})`;
}

export default function MinificationAliasing() {
  const [filtered, setFiltered] = useState(false);
  const [phase, setPhase] = useState(0);

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const padX = 12;
    const top = 30;
    const stripH = h - top - 46;
    const colW = (w - padX * 2) / NCOL;

    // 제목 라벨(짧게)
    label(ctx, padX + 60, 14, '가까움', theme.muted, 11);
    label(ctx, w - padX - 60, 14, '멀어짐 →', theme.muted, 11);

    void NROW;
    for (let c = 0; c < NCOL; c++) {
      // rho: 왼쪽=1텍셀/픽셀 → 오른쪽=최대 ~24텍셀/픽셀 (기하적으로 증가)
      const f = c / (NCOL - 1);
      const rho = Math.pow(2, f * 4.6); // 1 .. ~24
      // 이 열의 출력 픽셀이 시작하는 텍셀 좌표
      const t = phase + c * rho;
      const v = filtered ? squareAvg(t, rho) : squareAt(t);
      ctx.fillStyle = gray(v);
      ctx.fillRect(padX + c * colW, top, colW + 0.6, stripH);
    }

    // 외곽선
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(padX, top, w - padX * 2, stripH);

    // 하단 상태
    ctx.font = monoFont(12, 'bold');
    ctx.fillStyle = filtered ? COLORS.good : COLORS.bad;
    ctx.textAlign = 'left';
    ctx.fillText(
      filtered ? '필터 ON — footprint 평균(prefilter)' : '필터 OFF — 점 샘플(nearest)',
      padX,
      top + stripH + 22,
    );
    ctx.fillStyle = theme.muted;
    ctx.font = monoFont(11);
    ctx.fillText(
      filtered ? '멀리도 매끈한 회색, 위상에 안정' : '멀리서 모아레가 들끓음 — 위상을 끌면 살아 움직인다',
      padX,
      top + stripH + 38,
    );
  };

  const { ref } = useCanvas2d(draw, [filtered, phase]);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 220, display: 'block' }} />
      <ControlPanel>
        <ToggleControl label="밉/필터" checked={filtered} onChange={setFiltered} />
        <Slider
          label="카메라 이동(위상)"
          value={phase}
          min={0}
          max={P}
          step={0.02}
          onChange={setPhase}
          format={(v) => v.toFixed(2)}
        />
      </ControlPanel>
      <figcaption>
        같은 줄무늬 텍스처가 왼쪽(가까움)에서 오른쪽(멀어짐)으로 갈수록 <em>한 화면 픽셀이 더 많은
        텍셀을 덮습니다</em>. <strong>필터를 꺼 보세요.</strong> 멀리(오른쪽)서 텍셀 하나만 콕 집어
        읽으니(nearest), 옆 픽셀이 전혀 다른 텍셀로 튀어 <span style={{ color: COLORS.bad }}>모아레</span>가
        생깁니다. 이제 <strong>‘카메라 이동’ 슬라이더를 천천히 끌어</strong> 보세요 — 무늬가 가만히
        있질 못하고 <em>꿈틀거립니다</em>. 이게 실제 화면에서 카메라가 조금만 움직여도 멀리 있는
        바닥·철망이 반짝이며 끓는(shimmer) 현상입니다. <strong>필터를 켜면</strong> 각 픽셀이 자기가
        덮는 텍셀들을 <span style={{ color: COLORS.good }}>평균</span>해 멀리는 매끈한 회색이 되고,
        위상을 끌어도 끄떡없습니다. 이 챕터는 그 “평균”을 GPU가 어떻게 거의 공짜로 해내는지 —
        밉맵·양선형·삼선형·이방성 — 를 하나씩 뜯어봅니다.
      </figcaption>
    </figure>
  );
}
