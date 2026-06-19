import { useState } from 'react';
import { ControlPanel, ToggleControl } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, roundRect, monoFont } from './tbr2d';

// HsrOverdraw (과정): 한 픽셀 위에 겹친 불투명 면 LAYERS개.
// - HSR on(불투명만): 타일 안에서 보이는 픽셀을 먼저 가려내, 픽셀당 셰이딩 1회(zero overdraw).
// - HSR off: 겹친 만큼 다 셰이딩(레이어 수).
// - 반투명/discard 섞기 토글: HSR이 깨져 다시 레이어 수만큼 셰이딩.
// 픽셀당 셰이딩 횟수 카운터.

const LAYERS = 5;

function shadeCount(hsr: boolean, breakHsr: boolean): number {
  // HSR이 켜져 있고, 그것을 깨뜨리는 것(반투명/discard)이 없을 때만 1회.
  if (hsr && !breakHsr) return 1;
  return LAYERS;
}

export default function HsrOverdraw() {
  const [hsr, setHsr] = useState(true);
  const [breakHsr, setBreakHsr] = useState(false);

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const count = shadeCount(hsr, breakHsr);
    const effective = hsr && !breakHsr;

    // 겹친 면들을 비스듬히 쌓아 표현. 가장 앞(아래·오른쪽)이 카메라에 가까움.
    const cx = w * 0.32;
    const cy = h * 0.42;
    const planeW = Math.min(w * 0.34, 150);
    const planeH = planeW * 0.7;
    const dxStep = -16;
    const dyStep = -12;

    for (let i = LAYERS - 1; i >= 0; i--) {
      const x = cx + i * dxStep;
      const y = cy + i * dyStep;
      roundRect(ctx, x, y, planeW, planeH, 8);
      // 면이 실제로 셰이딩됐는지에 따라 색.
      // HSR effective: 맨 앞(i=0)만 셰이딩(초록), 나머지는 셰이딩 안 됨(회색).
      // 아니면: 전부 셰이딩(주황 — overdraw).
      let isShaded = true;
      if (effective) isShaded = i === 0;
      const col = isShaded ? (effective ? COLORS.gmem : COLORS.warn) : theme.muted;
      ctx.fillStyle = withAlpha(col, isShaded ? 0.8 : 0.18);
      ctx.fill();
      ctx.strokeStyle = withAlpha(col, 0.9);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // 깊이 라벨
      ctx.font = monoFont(10, 'bold');
      ctx.fillStyle = isShaded ? theme.bg : theme.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(i === 0 ? '앞(보임)' : `#${i}`, x + 6, y + 5);
    }
    ctx.textBaseline = 'alphabetic';

    // 카메라 → 면 시선 화살표는 생략(글자/도형 최소). 대신 카운터를 크게.
    const panelX = w * 0.66;
    const panelW = w - panelX - 14;
    const panelY = 24;

    ctx.font = monoFont(11);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.fillText('픽셀당 셰이딩', panelX, panelY);

    ctx.font = monoFont(46, 'bold');
    ctx.fillStyle = effective ? COLORS.gmem : COLORS.warn;
    ctx.fillText(`${count}×`, panelX, panelY + 44);

    ctx.font = monoFont(11);
    ctx.fillStyle = theme.text;
    const note = effective
      ? 'HSR: 보이는 1개만'
      : breakHsr
        ? '반투명/discard → HSR 무력'
        : 'HSR off → 겹친 만큼';
    // 줄바꿈 간단 처리
    ctx.fillText(note, panelX, panelY + 70);

    // 작은 막대: 셰이딩 횟수
    const barY = panelY + 86;
    const barMax = panelW;
    for (let i = 0; i < LAYERS; i++) {
      const on = i < count;
      const bw = barMax / LAYERS - 4;
      const x = panelX + i * (barMax / LAYERS);
      roundRect(ctx, x, barY, bw, 14, 3);
      ctx.fillStyle = on ? withAlpha(effective ? COLORS.gmem : COLORS.warn, 0.85) : withAlpha(theme.muted, 0.2);
      ctx.fill();
    }
  };

  const { ref } = useCanvas2d(draw, [hsr, breakHsr]);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 280, display: 'block' }} />
      <ControlPanel>
        <ToggleControl label="HSR (hidden surface removal)" checked={hsr} onChange={setHsr} />
        <ToggleControl
          label="반투명/discard 섞기 (HSR 깨짐)"
          checked={breakHsr}
          onChange={setBreakHsr}
        />
      </ControlPanel>
      <figcaption>
        한 픽셀 위에 불투명한 면이 <strong>{LAYERS}겹</strong> 겹쳐 있습니다. 결국 보이는 건 가장
        앞면 하나뿐입니다.{' '}
        <strong style={{ color: COLORS.gmem }}>HSR</strong>(TBDR의 핵심)은 타일 안에서 셰이딩을
        시작하기 <em>전에</em> 어느 면이 각 픽셀에서 보이는지를 먼저 정확히 가려냅니다 — 그래서
        보이는 한 면만 셰이딩하고 나머지 {LAYERS - 1}겹은 픽셀 셰이더를 아예 돌리지 않습니다(픽셀당
        셰이딩 <strong>1×</strong>, zero overdraw). 여기서 <strong>모바일에서는 z-prepass가
        역효과</strong>인 이유가 나옵니다 — HSR이 이미 같은 일을 공짜로 하므로, 깊이만 그리는 패스를
        따로 추가하면 지오메트리를 두 번 처리하는 손해만 남습니다.{' '}
        <strong>두 번째 토글을 켜 보세요:</strong> 반투명 블렌딩이나{' '}
        <code>discard</code>가 섞이면, 어느 면이 보일지를 셰이딩 <em>전에</em> 확정할 수 없게 되어
        HSR이 깨지고, 다시 겹친 만큼(<strong style={{ color: COLORS.warn }}>{LAYERS}×</strong>)
        셰이딩합니다. 모바일에서 overdraw가 갑자기 비싸지는 게 바로 이 순간입니다.
      </figcaption>
    </figure>
  );
}
