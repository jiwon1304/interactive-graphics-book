import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, monoFont, centerText, cell, drawArrow } from './wdo2d';

// ---------------------------------------------------------------------------
// 정적 도식: 한 워프가 if/else에서 갈릴 때.
//
// 32개 레인 중 일부는 then(조건 참), 일부는 else(거짓). 워프는 한 번에 한 명령만
// 낼 수 있으므로 두 경로를 "차례로" 실행한다:
//   pass A (then): then 레인 활성(초록), else 레인 마스크 off(빨강) → 흐려서 표시
//   pass B (else): 반대로 마스크
// 두 패스가 끝나면 재수렴 지점(IPDOM)에서 다시 32개 전부 활성.
//
// 시간이 가로(왼→오). 비용 = then 시간 + else 시간(둘 다 거쳐야 함).
// 캔버스 글자 최소: 패스 라벨 2개("then"/"else"), 재수렴 틱, 활성/마스크 범례 칩.
// ---------------------------------------------------------------------------

const CANVAS_H = 340;

export default function DivergenceReconverge() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const pad = 16;
    const legendH = 22;
    const labelH = 20;

    // 어떤 레인이 then으로 가는가(고정 대표 상태): 일부만 then.
    // 32개 중 인덱스 집합으로 then 결정.
    const thenSet = new Set([0, 1, 2, 5, 8, 9, 10, 13, 16, 19, 24, 25, 28, 31]);

    const cols = 8;
    const rows = 4;

    // 세 단계(공통 → then-pass → else-pass → 재수렴)를 가로로 배치.
    // 가운데 두 패스가 본론. 좌(분기 직전 32 활성)·우(재수렴 32 활성)는 좁게.
    const top = pad + legendH + labelH + 8;
    const bottom = h - pad - 14;
    const gridH = bottom - top;
    const cellGap = 3;
    const cellH = (gridH - (rows - 1) * cellGap) / rows;

    // 4개 패널: [분기전] [then패스] [else패스] [재수렴]
    const panelGap = 26;
    const innerW = w - 2 * pad;
    // then/else 패스를 넓게, 양 끝은 좁게.
    const wEnds = 0.7; // 상대폭
    const wMid = 1.0;
    const totalUnits = wEnds * 2 + wMid * 2;
    const unit = (innerW - 3 * panelGap) / totalUnits;
    const pw = [wEnds * unit, wMid * unit, wMid * unit, wEnds * unit];
    const px: number[] = [];
    let cx0 = pad;
    for (let i = 0; i < 4; i++) {
      px.push(cx0);
      cx0 += pw[i] + panelGap;
    }

    const drawPanel = (
      pxi: number,
      pwi: number,
      mode: 'all' | 'then' | 'else',
    ): void => {
      const colGap = 3;
      const cellW = (pwi - (cols - 1) * colGap) / cols;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const x = pxi + c * (cellW + colGap);
          const y = top + r * (cellH + cellGap);
          let color: string;
          let active: boolean;
          if (mode === 'all') {
            color = COLORS.exec;
            active = true;
          } else {
            const goesThen = thenSet.has(idx);
            active = mode === 'then' ? goesThen : !goesThen;
            color = mode === 'then' ? COLORS.then : COLORS.else;
            if (!active) color = COLORS.masked;
          }
          if (active) {
            cell(ctx, x, y, cellW, cellH, color, { fillAlpha: 0.38, strokeAlpha: 0.95 });
          } else {
            // 마스크 off: 아주 흐리게 + 대각선 빗금 느낌(점)
            cell(ctx, x, y, cellW, cellH, color, {
              fillAlpha: 0.08,
              strokeAlpha: 0.3,
              lineWidth: 0.7,
            });
          }
        }
      }
    };

    // 패널 위 라벨
    const panelLabel = (pxi: number, pwi: number, text: string, color: string): void => {
      centerText(ctx, text, pxi + pwi / 2, top - labelH / 2 - 2, color, monoFont(12));
    };

    drawPanel(px[0], pw[0], 'all');
    drawPanel(px[1], pw[1], 'then');
    drawPanel(px[2], pw[2], 'else');
    drawPanel(px[3], pw[3], 'all');

    panelLabel(px[0], pw[0], '분기 전', theme.muted);
    panelLabel(px[1], pw[1], 'then', COLORS.then);
    panelLabel(px[2], pw[2], 'else', COLORS.else);
    panelLabel(px[3], pw[3], '재수렴', COLORS.recon);

    // 시간축 화살표(아래): 분기전 → then → else → 재수렴 (직렬)
    const axY = bottom + 9;
    drawArrow(ctx, pad, axY, w - pad, axY, withAlpha(theme.muted, 0.8), {
      width: 1.2,
      head: 7,
    });
    ctx.font = monoFont(10);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('시간 →', pad + 2, axY - 3);

    // 패널 사이 직렬 화살표(분기 갈림과 합류를 암시)
    const midY = top + gridH / 2;
    for (let i = 0; i < 3; i++) {
      const fromX = px[i] + pw[i] + 4;
      const toX = px[i + 1] - 4;
      drawArrow(ctx, fromX, midY, toX, midY, withAlpha(theme.text, 0.5), {
        width: 1.3,
        head: 6,
      });
    }

    // 재수렴 틱: 마지막 패널 좌상단에 짧은 세로 마커
    const tickX = px[3] - panelGap / 2;
    ctx.strokeStyle = COLORS.recon;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tickX, top - 4);
    ctx.lineTo(tickX, bottom + 4);
    ctx.stroke();

    // 범례 칩(상단): 활성 / 마스크 off
    const chipY = pad;
    const chipR = 6;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = monoFont(11);
    let lx = pad;
    const chip = (color: string, label: string): void => {
      cell(ctx, lx, chipY, chipR * 2, chipR * 2, color, { fillAlpha: 0.38, strokeAlpha: 0.95, radius: 3 });
      ctx.fillStyle = theme.text;
      ctx.fillText(label, lx + chipR * 2 + 5, chipY + chipR);
      lx += chipR * 2 + 5 + ctx.measureText(label).width + 18;
    };
    chip(COLORS.then, '활성');
    // 마스크 off 칩(흐린)
    cell(ctx, lx, chipY, chipR * 2, chipR * 2, COLORS.masked, {
      fillAlpha: 0.1,
      strokeAlpha: 0.4,
      radius: 3,
    });
    ctx.fillStyle = theme.text;
    ctx.fillText('마스크 off', lx + chipR * 2 + 5, chipY + chipR);

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
        한 워프 안에서 <code>if/else</code>가 갈리면 무슨 일이 일어나는지를 시간순(왼→오)으로
        편 그림입니다. 32개 레인 중 일부는 <strong>then</strong>(조건 참), 일부는{' '}
        <strong>else</strong>(거짓)로 가야 하지만, 워프는 한 사이클에 <em>단 하나의 명령</em>만 낼 수
        있습니다. 그래서 하드웨어는 두 경로를 <strong>차례로</strong> 실행합니다. then 패스에서는 then
        레인만 켜고(초록) else 레인을 <strong>마스크 off</strong>(흐린 빨강)하고, else 패스에서는
        정반대로 합니다. 결정적인 점: <em>두 패스 동안 절반의 레인이 매번 놀고 있다</em>는 것입니다.
        그래서 다이버전스의 비용은 두 경로의 <strong>합</strong>입니다 —{' '}
        분기가 없었다면 한 경로 시간으로 끝났을 일을, 갈리는 순간 <em>then 시간 + else 시간</em>으로
        치릅니다. 두 패스가 끝나면 <strong>재수렴 지점</strong>(보통 분기의 immediate
        post-dominator)에서 32개 레인이 다시 모두 켜져 함께 전진합니다. 비용은 오직{' '}
        <em>같은 워프 안에서</em> 갈릴 때만 발생합니다 — 워프 전체가 만장일치로 then(또는 else)이면
        마스크가 다 켜진 채라 공짜입니다.
      </figcaption>
    </figure>
  );
}
