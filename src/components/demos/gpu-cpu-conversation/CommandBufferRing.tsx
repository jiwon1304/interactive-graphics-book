import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, label, withAlpha, monoFont, drawArrow, roundRect } from './gcc2d';

// Producer/consumer ring buffer(정적). CPU(write pointer)가 명령을 채우고 GPU(read pointer)가
// 뒤따라 소비한다. 둘 사이의 간격 = GPU가 CPU보다 얼마나 뒤처져 있는가.
//
// 출처: fgiesen, "A trip through the graphics pipeline 2011, part 2" — CP가 ring buffer를
// read pointer/write pointer로 소비. write==read이면 비었고, write가 read를 따라잡으면 가득 참.

export default function CommandBufferRing() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const cx = w / 2;
    const cy = h / 2 + 6;
    const R = Math.min(w, h) / 2 - 46;
    const N = 16; // 슬롯 수
    const writeIdx = 11; // CPU가 여기까지 채움
    const readIdx = 4; // GPU가 여기까지 소비

    // 슬롯이 [readIdx, writeIdx) 사이면 "기록됨, 아직 미소비"
    const isPending = (i: number) => {
      const rel = (i - readIdx + N) % N;
      const span = (writeIdx - readIdx + N) % N;
      return rel < span;
    };

    // 링 슬롯
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      const a2 = ((i + 1) / N) * Math.PI * 2 - Math.PI / 2;
      const inner = R - 16;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a + 0.012, a2 - 0.012);
      ctx.arc(cx, cy, inner, a2 - 0.012, a + 0.012, true);
      ctx.closePath();
      ctx.fillStyle = isPending(i)
        ? withAlpha(COLORS.cmd, 0.8)
        : withAlpha(theme.text, 0.07);
      ctx.fill();
      ctx.strokeStyle = withAlpha(theme.text, 0.18);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 포인터 화살표(중심 → 경계)
    const pointer = (idx: number, color: string, name: string) => {
      const a = (idx / N) * Math.PI * 2 - Math.PI / 2;
      const x1 = cx + Math.cos(a) * (R + 4);
      const y1 = cy + Math.sin(a) * (R + 4);
      const x0 = cx + Math.cos(a) * (R - 22);
      const y0 = cy + Math.sin(a) * (R - 22);
      drawArrow(ctx, x0, y0, x1, y1, color, 2.4, 9);
      const lx = cx + Math.cos(a) * (R + 32);
      const ly = cy + Math.sin(a) * (R + 32);
      label(ctx, lx, ly, name, color, 12, 'bold');
    };
    pointer(writeIdx, COLORS.cpu, 'write (CPU)');
    pointer(readIdx, COLORS.gpu, 'read (GPU)');

    // 중앙 라벨
    label(ctx, cx, cy - 9, 'command', theme.muted, 12, 'bold');
    label(ctx, cx, cy + 8, 'ring buffer', theme.muted, 12, 'bold');

    // 방향 표시(시계방향)
    ctx.font = monoFont(12);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'center';
    ctx.fillText('소비 방향 →', cx, h - 8);
    ctx.textAlign = 'start';

    // 좌상단 범례
    const lx = 10;
    let ly = 14;
    const leg = (c: string, t: string) => {
      roundRect(ctx, lx, ly - 7, 11, 11, 2);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.font = monoFont(9.5);
      ctx.fillStyle = theme.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, lx + 16, ly - 1);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      ly += 17;
    };
    leg(withAlpha(COLORS.cmd, 0.8), '기록됨 · 미소비');
    leg(withAlpha(theme.text, 0.12), '빈 슬롯');
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 340, display: 'block' }} />
      <figcaption>
        CPU와 GPU는 하나의 <strong>ring buffer</strong>를 공유합니다. CPU는{' '}
        <span style={{ color: COLORS.cpu }}>write pointer</span>를 앞세워 명령을 채우고(producer),
        GPU의 command processor는 <span style={{ color: COLORS.gpu }}>read pointer</span>를 앞세워 뒤따라
        소비합니다(consumer). 두 포인터 사이의 칸들(파란색)이 “기록은 됐지만 아직 실행 안 된” 명령입니다 —
        이 간격이 곧 <strong>GPU가 CPU보다 얼마나 뒤처져 있는가</strong>입니다. read가 write를 따라잡으면
        ring이 비어 GPU가 굶고(starve), write가 한 바퀴 돌아 read를 따라잡으면 ring이 가득 차 CPU가 자리를
        기다려야 합니다(back-pressure). 그래서 두 포인터는 서로를 추월하면 안 되고, 이 비교가 바로 다음에
        나올 <strong>동기화</strong>가 필요한 이유입니다.
      </figcaption>
    </figure>
  );
}
