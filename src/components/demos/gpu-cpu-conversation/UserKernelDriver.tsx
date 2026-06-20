import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, label, box, withAlpha, monoFont, drawArrow, wrapText } from './gcc2d';

// user-mode vs kernel-mode 어디에 드라이버가 있나(정적, WDDM 맛보기).
// 위쪽 user 모드: app → runtime → UMD가 command buffer를 프로세스 메모리에 기록(커널 진입 0회).
// 점선 = user/kernel 경계(syscall). 아래쪽 kernel 모드: OS scheduler/KMD가 제출, GPU가 실행.
// 핵심: 기록은 user에서 싸게, 제출 때만 비싼 경계를 "한 번" 넘는다(배치).

export default function UserKernelDriver() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 12;
    const bw = w - pad * 2;
    const narrow = w < 480;

    // 세로 배치: user 3블록 → 경계 → kernel 2블록
    const top = 8;
    const userBoxH = narrow ? 40 : 44;
    const userGap = 12;

    let y = top;
    const node = (fill: string, title: string, sub: string) => {
      box(ctx, pad, y, bw, userBoxH, fill, '', theme);
      label(ctx, pad + bw / 2, y + userBoxH / 2 - (narrow ? 8 : 9), title, theme.text, narrow ? 11 : 12.5, 'bold');
      ctx.font = monoFont(narrow ? 8.5 : 9.5);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      wrapText(ctx, sub, pad + bw / 2, y + userBoxH / 2 + (narrow ? 8 : 9), bw - 24, 11);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      y += userBoxH + userGap;
    };
    const downArrow = () => {
      drawArrow(ctx, w / 2, y - userGap - 1, w / 2, y - 2, theme.muted, 1.6, 6);
    };

    node(COLORS.app, '애플리케이션 + runtime', 'Draw / SetState — D3D runtime · Vulkan loader');
    downArrow();
    node(COLORS.umd, 'UMD (user-mode driver)', 'command buffer를 프로세스 메모리에 기록');

    // "여기까지 커널 진입 0회" 표시
    ctx.font = monoFont(narrow ? 9 : 10, 'bold');
    ctx.fillStyle = COLORS.umd;
    ctx.textAlign = 'right';
    ctx.fillText('user 모드 · 커널 진입 0회', pad + bw, y - userGap + 1);
    ctx.textAlign = 'start';

    // user/kernel 경계(점선) — 제출 시 한 번 넘음
    const lineY = y - userGap / 2 + 4;
    ctx.strokeStyle = withAlpha(COLORS.fence, 0.85);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pad, lineY);
    ctx.lineTo(pad + bw, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    // 경계 라벨 박스
    ctx.font = monoFont(narrow ? 9 : 10, 'bold');
    const bl = 'user / kernel 경계 (submit = syscall)';
    const tw = ctx.measureText(bl).width + 12;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(pad + bw / 2 - tw / 2, lineY - 8, tw, 16);
    label(ctx, pad + bw / 2, lineY, bl, COLORS.fence, narrow ? 9 : 10, 'bold');
    y = lineY + userGap / 2 + 6;

    // submit 화살표(경계 가로지름)
    drawArrow(ctx, w / 2, lineY + 2, w / 2, y - 2, COLORS.fence, 1.8, 6);

    node(COLORS.kernel, 'OS scheduler + KMD', 'residency 보장 · GPU 엔진 ring에 큐잉');
    downArrow();
    node(COLORS.gpu, 'GPU', 'command buffer 실행');
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 360, display: 'block' }} />
      <figcaption>
        드라이버는 한 덩어리가 아니라 <strong>user 모드</strong>와 <strong>kernel 모드</strong>로
        쪼개져 있습니다. <span style={{ color: COLORS.umd }}>UMD</span>(user-mode driver)는 앱과 같은
        프로세스 주소공간에서 돌며 API 호출을 command buffer로 기록합니다 — 이 과정엔 커널 진입이{' '}
        <strong>한 번도</strong> 없어 싸게 많이 할 수 있습니다. command buffer를 GPU에 제출할 때만{' '}
        <span style={{ color: COLORS.fence }}>user/kernel 경계</span>를 넘는데(syscall),
        이 전환은 비싸므로 한 번의 제출에 수백~수천 개의 명령을 <strong>배치</strong>해 그 비용을 분할
        상환합니다. kernel 쪽(OS scheduler + KMD)이 비싸고 작은 이유는 따로 있습니다: GPU는 여러 프로세스가
        공유하는 자원이라, 누가 언제 GPU를 쓸지 중재하고 다른 프로세스 메모리로부터 보호하는 일은 신뢰된
        커널 코드만 해야 하기 때문입니다. Windows에서 이 분담은 WDDM이라는 모델로 굳어 있고 — runtime,
        UMD, <code>Dxgkrnl</code>, KMD — 다음 편에서 자세히 다룹니다.
      </figcaption>
    </figure>
  );
}
