import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, monoFont, roundRect, cell } from './wdo2d';

// ---------------------------------------------------------------------------
// 정적 도식: 점유율의 "구속 제약(binding constraint)".
//
// SM에 동시에 걸 수 있는 워프 수는 네 자원 중 가장 빨리 바닥나는 것이 정한다:
//   1) 하드웨어 워프 슬롯 상한 (예: 64 워프/SM)
//   2) 레지스터 파일: (레지스터/스레드)가 많으면 걸 수 있는 워프가 줄어듦
//   3) 공유 메모리/블록: 블록이 공유 메모리를 많이 쓰면 동시 블록 수가 줄어듦
//   4) 블록 슬롯 상한 (예: 32 블록/SM, 보통 잘 안 걸림)
//
// 각 자원이 "허용하는 최대 워프 수"를 가로 막대로. 가장 짧은 막대 = 구속 제약(강조).
// 대표 상태(고정): 레지스터가 24 워프로 가장 빡빡 → 그게 binding. 점유율 = 24/64.
//
// 캔버스 글자 최소: 자원명 4개, 각 막대 끝 워프 수 1개, "binding" 마커, 점유율 1개.
// ---------------------------------------------------------------------------

const CANVAS_H = 320;

interface Limiter {
  name: string;
  warps: number; // 이 자원이 허용하는 최대 워프 수
  color: string;
  detail: string; // 짧은 부가 토큰
}

export default function OccupancyLimiters() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const pad = 16;
    const MAX_WARPS = 64; // 하드웨어 상한(가로 스케일 기준)

    // 대표 값(고정). 레지스터가 가장 빡빡(24) → binding.
    const limiters: Limiter[] = [
      { name: '워프 슬롯', warps: 64, color: COLORS.sched, detail: 'HW 상한 64' },
      { name: '레지스터', warps: 24, color: COLORS.reg, detail: '80 reg/thread' },
      { name: '공유 메모리', warps: 40, color: COLORS.smem, detail: '대형 타일' },
      { name: '블록 슬롯', warps: 56, color: COLORS.exec, detail: '256/block' },
    ];

    // binding = 가장 작은 warps
    let bindIdx = 0;
    for (let i = 1; i < limiters.length; i++) {
      if (limiters[i].warps < limiters[bindIdx].warps) bindIdx = i;
    }
    const active = limiters[bindIdx].warps;

    // 레이아웃
    const titleH = 26;
    const top = pad + titleH;
    const bottom = h - pad - 30;
    const rowGap = 14;
    const rowH = (bottom - top - (limiters.length - 1) * rowGap) / limiters.length;

    const labelW = 92;
    const trackLeft = pad + labelW;
    const trackW = w - trackLeft - pad - 30; // 우측에 워프 수 라벨 공간
    const scale = trackW / MAX_WARPS;

    // 제목
    ctx.font = monoFont(12);
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SM당 동시 워프 수를 제한하는 자원', pad, pad);

    for (let i = 0; i < limiters.length; i++) {
      const L = limiters[i];
      const y = top + i * (rowH + rowGap);
      const isBind = i === bindIdx;

      // 자원명(좌)
      ctx.font = monoFont(11);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(L.name, trackLeft - 8, y + rowH / 2);

      // 트랙 배경(전체 = MAX_WARPS)
      roundRect(ctx, trackLeft, y, trackW, rowH, 4);
      ctx.fillStyle = withAlpha(theme.muted, 0.08);
      ctx.fill();
      ctx.strokeStyle = withAlpha(theme.muted, 0.2);
      ctx.lineWidth = 1;
      ctx.stroke();

      // 채워진 막대(허용 워프 수)
      const barW = L.warps * scale;
      cell(ctx, trackLeft, y, barW, rowH, L.color, {
        fillAlpha: isBind ? 0.5 : 0.26,
        strokeAlpha: isBind ? 1 : 0.7,
        radius: 4,
        lineWidth: isBind ? 2 : 1,
      });

      // 워프 수 라벨(막대 우측 끝)
      ctx.font = monoFont(11);
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(L.warps), trackLeft + barW + 6, y + rowH / 2);

      // 짧은 부가 토큰(막대 안 좌측)
      ctx.font = monoFont(8);
      ctx.fillStyle = withAlpha(theme.text, 0.7);
      ctx.textAlign = 'left';
      ctx.fillText(L.detail, trackLeft + 6, y + rowH / 2);

      // binding 마커
      if (isBind) {
        ctx.font = monoFont(9);
        ctx.fillStyle = L.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('◀ binding (최소)', trackLeft + barW + 28, y + rowH / 2 + 5);
      }
    }

    // binding 막대 끝에 세로 점선(= active warps 한계선)
    const lineX = trackLeft + active * scale;
    ctx.strokeStyle = withAlpha(limiters[bindIdx].color, 0.8);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(lineX, top - 4);
    ctx.lineTo(lineX, bottom + 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // 하단: 점유율 결과 한 줄(수치 하나)
    ctx.font = monoFont(12);
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const occ = Math.round((active / MAX_WARPS) * 100);
    ctx.fillText(
      `점유율 = ${active} / ${MAX_WARPS} = ${occ}%`,
      w / 2,
      h - pad + 6,
    );

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: CANVAS_H, display: 'block' }} />
      </div>
      <figcaption>
        점유율이 <em>왜</em> 그 값으로 정해지는지를 보여줍니다. SM에 동시에 걸 수 있는 워프 수는 네
        자원이 각각 허용하는 워프 수의 한계 중 <strong>가장 작은 것</strong>이 정합니다 —
        막대가 짧은 자원이 <strong>구속 제약(binding constraint)</strong>입니다. <strong>워프 슬롯</strong>은
        하드웨어가 SM당 걸 수 있는 절대 상한(여기 64). <strong>레지스터</strong>는 레지스터 파일을
        스레드 수로 나눈 값 — 스레드가 레지스터를 많이 쓰면(여기 80 reg/스레드) 걸 수 있는 워프가 확
        줄어듭니다. <strong>공유 메모리</strong>는 블록이 큰 타일을 잡으면 동시 블록 수가 줄어 워프도
        줄고, <strong>블록 슬롯</strong>은 SM당 블록 수 상한입니다. 이 예에선 <strong>레지스터가 24
        워프</strong>로 가장 빡빡해, 다른 자원이 아무리 여유로워도 점유율은{' '}
        <strong>24/64 ≈ 38%</strong>에서 막힙니다(점선). 그래서 튜닝의 첫 질문은 늘 “지금 무엇이
        binding인가?”입니다 — 레지스터가 binding이면 레지스터 사용을 줄여야지(예: 변수 재활용,{' '}
        <code>__launch_bounds__</code>), 공유 메모리를 줄여도 소용없습니다. binding이 아닌 자원을 줄이면
        그 자원의 한계만 더 커질 뿐 활성 워프 수는 그대로입니다.
      </figcaption>
    </figure>
  );
}
