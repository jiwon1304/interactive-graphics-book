import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, drawArrow, monoFont, withAlpha, wrapText, type ThemeColors } from './wgs2d';

// GpuVaEras (정적): WDDM 1.x(물리주소 + allocation/patch location list) vs
// WDDM 2.0(per-process GPUVA, patch list 없음) 비교. 모바일에선 위/아래 2단으로.

interface Era {
  tag: string;
  color: string;
  cmd: string; // command buffer 안 주소 표현
  points: string[]; // 차이점 bullet
  submit: string; // 제출 API
}

const ERA1: Era = {
  tag: 'WDDM 1.x  (Vista~Win8.1)',
  color: COLORS.era1,
  cmd: '[bind  alloc#3]   ← 핸들/오프셋',
  points: [
    '리소스가 segment 물리주소를 참조',
    'segment 공유·과할당 → 재배치 시 물리주소 변함',
    'command buffer마다 allocation list + patch location list',
    '제출 전 VidMm이 모든 packet을 검사해 주소 patch',
  ],
  submit: 'D3DKMTRender  (legacy patch mode)',
};

const ERA2: Era = {
  tag: 'WDDM 2.0  (Win10+)',
  color: COLORS.era2,
  cmd: '[bind  0x7F2A_0000]   ← GPUVA 직접',
  points: [
    'process마다 고유한 GPU virtual address(GPUVA) 공간',
    'allocation의 GPUVA는 수명 동안 고정·불변',
    'UMD가 가상주소를 직접 기록 → patch list 안 만듦',
    'residency는 per-device list, VidMm이 제출 전 보장',
  ],
  submit: 'D3DKMTSubmitCommand  (GPUVA mode)',
};

export default function GpuVaEras() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const narrow = w < 560;
    const padX = Math.max(10, w * 0.03);

    if (narrow) {
      // 세로 2단
      const colW = w - padX * 2;
      let y = 10;
      y = drawEra(ctx, padX, y, colW, ERA1, theme, true);
      y += 18;
      drawEra(ctx, padX, y, colW, ERA2, theme, true);
    } else {
      const gap = 20;
      const colW = (w - padX * 2 - gap) / 2;
      const top = 10;
      drawEra(ctx, padX, top, colW, ERA1, theme, false);
      drawEra(ctx, padX + colW + gap, top, colW, ERA2, theme, false);
    }
    void h;
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 420, display: 'block' }} />
      <figcaption>
        같은 "리소스를 바인딩" 명령이 두 시대에 전혀 다르게 처리됩니다.
        <span style={{ color: COLORS.era1 }}> WDDM 1.x</span>에서 GPU는 segment의 <strong>물리주소
        </strong>를 참조했는데, segment가 공유·과할당되며 리소스가 재배치되면 물리주소가 바뀝니다.
        그래서 UMD가 command buffer마다 <strong>allocation list</strong>와 <strong>patch location
        list</strong>를 만들고, 제출 직전 VidMm이 모든 packet을 훑어 실제 주소로 <strong>patch</strong>
        했습니다 — 비싼 일이었죠. <span style={{ color: COLORS.era2 }}>WDDM 2.0</span>은 process마다
        <strong> GPU virtual address(GPUVA)</strong> 공간을 주고, allocation의 GPUVA를 수명 내내
        고정합니다. 주소가 안 변하니 UMD가 가상주소를 <strong>직접 기록</strong>하고
        <strong> patch list를 더 이상 만들지 않습니다</strong>. 제출 API마저 갈렸습니다:
        legacy는 <code>D3DKMTRender</code>, GPUVA는 <code>D3DKMTSubmitCommand</code>. DX12는 WDDM 2.0을
        요구하고, 최신 Windows에서는 DX9/11 앱도 이 GPUVA 경로로 돕니다.
      </figcaption>
    </figure>
  );
}

function drawEra(
  ctx: CanvasRenderingContext2D,
  x: number,
  y0: number,
  colW: number,
  era: Era,
  theme: ThemeColors,
  narrow: boolean,
): number {
  const pad = 10;
  const inner = colW - pad * 2;
  const bulletPx = narrow ? 9.5 : 10;
  const lineH = bulletPx + 3;

  // 제목
  let y = y0;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = monoFont(narrow ? 11.5 : 12.5, 'bold');
  ctx.fillStyle = era.color;
  ctx.fillText(era.tag, x, y + 9);
  y += 24;

  // command buffer 칩
  const cmdH = 30;
  box(ctx, x, y, colW, cmdH, COLORS.umd, '', theme, { alpha: 0.14, r: 6 });
  ctx.font = monoFont(narrow ? 9 : 9.5, 'bold');
  ctx.fillStyle = theme.muted;
  ctx.fillText('command buffer', x + pad, y + 9);
  ctx.font = monoFont(narrow ? 9.5 : 10.5, 'bold');
  ctx.fillStyle = theme.text;
  ctx.fillText(era.cmd, x + pad, y + 21);
  y += cmdH + 8;

  // 주소 해석 단계(patch 있음/없음)
  const stepH = 26;
  const hasPatch = era === ERA1;
  box(ctx, x, y, colW, stepH, hasPatch ? COLORS.era1 : COLORS.era2, '', theme, {
    alpha: 0.16,
    r: 6,
  });
  ctx.textAlign = 'center';
  ctx.font = monoFont(narrow ? 9.5 : 10.5, 'bold');
  ctx.fillStyle = hasPatch ? COLORS.era1 : COLORS.era2;
  ctx.fillText(
    hasPatch ? 'VidMm: patch list로 주소 메움' : 'patch 없음 — 주소 그대로 실행',
    x + colW / 2,
    y + stepH / 2,
  );
  ctx.textAlign = 'left';
  drawArrow(ctx, x + colW / 2, y - 8, x + colW / 2, y - 1, theme.muted, 1.5, 5);
  y += stepH + 10;

  // bullet points
  ctx.font = monoFont(bulletPx);
  for (const p of era.points) {
    const lines = wrapText(ctx, p, inner - 12, bulletPx);
    // 불릿 점
    ctx.fillStyle = era.color;
    ctx.beginPath();
    ctx.arc(x + 3, y + bulletPx / 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.text;
    ctx.textBaseline = 'middle';
    let ly = y + bulletPx / 2;
    for (const ln of lines) {
      ctx.fillText(ln, x + 12, ly);
      ly += lineH;
    }
    y = ly + 5;
  }
  ctx.textBaseline = 'alphabetic';

  // 제출 API 줄
  y += 2;
  ctx.strokeStyle = withAlpha(theme.text, 0.18);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + colW, y);
  ctx.stroke();
  y += 8;
  ctx.font = monoFont(narrow ? 9 : 9.5, 'bold');
  ctx.fillStyle = theme.muted;
  ctx.fillText('제출:', x, y + 5);
  ctx.fillStyle = era.color;
  ctx.fillText(era.submit, x + ctx.measureText('제출:  ').width, y + 5);
  y += 18;

  ctx.textAlign = 'start';
  return y;
}
