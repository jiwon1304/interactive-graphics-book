import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, roundRect, withAlpha, monoFont, centerText, drawArrow } from './gpj2d';

// ---------------------------------------------------------------------------
// 정적 도식: ROP(Raster Operations / 픽셀 백엔드)의 마지막 세 단계.
//   들어온 프래그먼트 → 깊이 테스트 → 블렌딩 → 프레임버퍼 쓰기.
// 깊이 테스트에서 떨어지면 색 계산이 끝났어도 버려진다. 통과하면 기존 프레임버퍼
// 색과 src·α + dst·(1−α)로 섞은 뒤 깊이/색을 갱신해 쓴다.
// 캔버스 안 글자는 짧은 라벨만. 설명은 figcaption.
// ---------------------------------------------------------------------------

const CANVAS_H = 380;

export default function RopBlend() {
  const draw = (d: DrawCtx): void => {
    const { ctx, w, h, theme } = d;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const colW = Math.min(150, w * 0.32);
    const boxH = 52;
    const gapY = 30;
    let y = 40;

    // 상단: 들어오는 프래그먼트(픽셀 셰이더 출력)
    const fragX = cx - colW / 2;
    roundRect(ctx, fragX, y, colW, boxH, 9);
    ctx.fillStyle = withAlpha(COLORS.stage, 0.16);
    ctx.fill();
    ctx.strokeStyle = COLORS.stage;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    centerText(ctx, '프래그먼트', cx, y + 18, theme.text, monoFont(12));
    centerText(ctx, 'src 색 + α, z', cx, y + 36, theme.muted, monoFont(10));
    let prevY = y + boxH;
    y += boxH + gapY;

    // 단계 1: 깊이 테스트
    drawArrow(ctx, cx, prevY, cx, y, theme.muted, { width: 1.5, head: 7 });
    roundRect(ctx, fragX, y, colW, boxH, 9);
    ctx.fillStyle = withAlpha(COLORS.depth, 0.16);
    ctx.fill();
    ctx.strokeStyle = COLORS.depth;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    centerText(ctx, '① 깊이 테스트', cx, y + 18, theme.text, monoFont(12));
    centerText(ctx, 'z < z_buffer ?', cx, y + 36, theme.muted, monoFont(10));

    // 깊이 테스트 실패 분기(오른쪽으로 빠져나가 버려짐)
    const failX = cx + colW / 2;
    drawArrow(ctx, failX, y + boxH / 2, failX + 70, y + boxH / 2, COLORS.fail, {
      width: 1.4,
      head: 7,
    });
    ctx.font = monoFont(10);
    ctx.fillStyle = COLORS.fail;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('실패→버림', failX + 76, y + boxH / 2);
    prevY = y + boxH;
    y += boxH + gapY;

    // 단계 2: 블렌딩
    drawArrow(ctx, cx, prevY, cx, y, theme.muted, { width: 1.5, head: 7 });
    ctx.font = monoFont(10);
    ctx.fillStyle = COLORS.pass;
    ctx.textAlign = 'left';
    ctx.fillText('통과', cx + 8, prevY + gapY / 2);

    roundRect(ctx, fragX, y, colW, boxH, 9);
    ctx.fillStyle = withAlpha(COLORS.front, 0.16);
    ctx.fill();
    ctx.strokeStyle = COLORS.front;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    centerText(ctx, '② 블렌딩', cx, y + 18, theme.text, monoFont(12));
    centerText(ctx, 'src·α + dst·(1−α)', cx, y + 36, theme.muted, monoFont(10));

    // 프레임버퍼에서 dst 색을 읽어오는 화살표(왼쪽에서 들어옴)
    const fbX = fragX - 90;
    const fbY = y + boxH / 2 - 16;
    roundRect(ctx, fbX, fbY, 70, 32, 6);
    ctx.fillStyle = withAlpha(COLORS.vA, 0.18);
    ctx.fill();
    ctx.strokeStyle = COLORS.vA;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    centerText(ctx, 'dst 색', fbX + 35, y + boxH / 2, theme.text, monoFont(10));
    drawArrow(ctx, fbX + 70, y + boxH / 2, fragX, y + boxH / 2, COLORS.vA, {
      width: 1.3,
      head: 6,
      dashed: true,
    });
    prevY = y + boxH;
    y += boxH + gapY;

    // 단계 3: 쓰기
    drawArrow(ctx, cx, prevY, cx, y, theme.muted, { width: 1.5, head: 7 });
    roundRect(ctx, fragX, y, colW, boxH, 9);
    ctx.fillStyle = withAlpha(COLORS.clip, 0.16);
    ctx.fill();
    ctx.strokeStyle = COLORS.clip;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    centerText(ctx, '③ 쓰기', cx, y + 18, theme.text, monoFont(12));
    centerText(ctx, '색·깊이 갱신', cx, y + 36, theme.muted, monoFont(10));

    // 오른쪽: 프레임버퍼 셀(작은 2×2 픽셀)
    const pbX = fragX + colW + 50;
    const pbY = y - 4;
    const cell = 26;
    const cols2: string[] = [COLORS.vA, COLORS.vC, COLORS.vB, COLORS.depth];
    for (let i = 0; i < 4; i++) {
      const r = Math.floor(i / 2);
      const cc = i % 2;
      const x = pbX + cc * cell;
      const yy = pbY + r * cell;
      ctx.fillStyle = withAlpha(cols2[i], 0.5);
      ctx.fillRect(x, yy, cell - 1, cell - 1);
    }
    ctx.font = monoFont(10);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('프레임버퍼', pbX + cell, pbY + 2 * cell + 4);
    drawArrow(ctx, fragX + colW, y + boxH / 2, pbX - 6, pbY + cell, COLORS.clip, {
      width: 1.3,
      head: 6,
    });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
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
        픽셀 셰이더가 색을 다 계산해도, 그 색이 화면에 박힌다는 보장은 없습니다. 마지막 단계{' '}
        <strong>ROP</strong>(픽셀 백엔드)이 세 일을 차례로 합니다.{' '}
        <strong style={{ color: '#f97316' }}>① 깊이 테스트</strong>: 이 프래그먼트의 z가 그 픽셀에 이미
        기록된 깊이보다 가까운가? 멀면 — 색 계산을 다 했더라도 — 그냥 <span style={{ color: '#ef4444' }}>
        버립니다</span>(그래서 가려질 픽셀을 셰이딩 전에 거르는 <em>early-Z</em>가 그토록 이득입니다).{' '}
        <strong style={{ color: '#14b8a6' }}>② 블렌딩</strong>: 통과하면 기존 프레임버퍼 색(<em>dst</em>)을
        읽어와, 들어온 색(<em>src</em>)과 알파로 섞습니다 — 가장 흔한 “스트레이트 알파” 식이{' '}
        <em>src·α + dst·(1−α)</em>입니다(불투명이면 α=1이라 그냥 덮어쓰기).{' '}
        <strong style={{ color: '#a855f7' }}>③ 쓰기</strong>: 섞은 색과 새 깊이를 프레임버퍼에 기록합니다.
        이 세 단계는 같은 픽셀에 여러 삼각형이 겹칠 때 순서·정확성을 보장해야 하므로, 하드웨어가 픽셀당
        원자적으로(read-modify-write) 처리합니다 — 그래서 ROP는 메모리 대역폭을 가장 많이 먹는 곳 중
        하나입니다. (깊이 테스트가 어떻게 셰이딩 전으로 당겨지는지는{' '}
        <em>early-Z</em> 절에서 더 파고듭니다.)
      </figcaption>
    </figure>
  );
}
