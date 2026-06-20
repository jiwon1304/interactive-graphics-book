import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, drawArrow, monoFont, wrapText } from './wgs2d';

// DDI 호출 흐름(정적): 앱의 CreateResource 한 번이 runtime → UMD → Dxgkrnl/VidMm → KMD 로
// 내려가는 한 예. 각 단계가 "누가 무엇을" 하는지 한 줄. 세로 스택(모바일 친화).

interface Step {
  fill: string;
  who: string;
  call: string; // 굵은 호출/콜백 이름
  note: string;
}

const STEPS: Step[] = [
  {
    fill: COLORS.app,
    who: '애플리케이션',
    call: 'CreateResource()',
    note: 'D3D 리소스 생성 요청 (예: 텍스처)',
  },
  {
    fill: COLORS.runtime,
    who: 'D3D Runtime',
    call: 'pfnCreateResource (DDI)',
    note: '인자 검증 후 DDI로 UMD 진입',
  },
  {
    fill: COLORS.umd,
    who: 'UMD',
    call: 'pfnAllocateCb()',
    note: 'allocation이 필요하면 runtime 콜백으로 커널에 요청',
  },
  {
    fill: COLORS.kernel,
    who: 'Dxgkrnl / VidMm',
    call: 'D3DKMTCreateAllocation',
    note: 'VidMm이 메모리 잡고 KMD DDI 호출',
  },
  {
    fill: COLORS.kernel,
    who: 'KMD',
    call: 'DxgkDdiCreateAllocation',
    note: 'KMD가 하드웨어 관점 allocation을 만든다',
  },
];

export default function DdiCallFlow() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, theme } = d;
    const bx = Math.max(12, w * 0.05);
    const bw = w - bx * 2;
    const narrow = w < 460;
    const callPx = narrow ? 11 : 12;
    const notePx = narrow ? 9.5 : 10.5;
    const lineH = notePx + 3;
    const pad = 9;
    const inner = bw - pad * 2 - (narrow ? 0 : 120); // 데스크톱은 좌측에 who 컬럼 여유
    const gap = narrow ? 15 : 16;

    let y = 8;
    STEPS.forEach((s, i) => {
      const noteLines = wrapText(ctx, s.note, inner, notePx);
      const bh = Math.max(narrow ? 50 : 46, pad + callPx + 6 + noteLines.length * lineH + pad);
      box(ctx, bx, y, bw, bh, s.fill, '', theme);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      // who (작게, 위)
      ctx.font = monoFont(notePx - 0.5, 'bold');
      ctx.fillStyle = s.fill;
      ctx.fillText(s.who, bx + pad, y + pad + (notePx - 0.5) / 2);
      // call (굵게)
      ctx.font = monoFont(callPx, 'bold');
      ctx.fillStyle = theme.text;
      ctx.fillText(s.call, bx + pad, y + pad + callPx + 2);
      // note (여러 줄)
      ctx.font = monoFont(notePx);
      ctx.fillStyle = theme.muted;
      let ly = y + pad + callPx + 2 + callPx;
      for (const ln of noteLines) {
        ctx.fillText(ln, bx + pad, ly);
        ly += lineH;
      }
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'start';

      y += bh;
      if (i < STEPS.length - 1) {
        drawArrow(ctx, bx + bw / 2, y + 2, bx + bw / 2, y + gap - 3, theme.muted, 1.7, 6);
        y += gap;
      }
    });
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 470, display: 'block' }} />
      <figcaption>
        한 번의 <code>CreateResource</code>가 레이어를 타고 내려가는 길. 앱 호출을
        <span style={{ color: COLORS.runtime }}> runtime</span>이 검증하고 <strong>DDI</strong>
        함수 포인터(<code>pfnCreateResource</code>)로 <span style={{ color: COLORS.umd }}>UMD</span>를
        부릅니다. UMD가 GPU 메모리가 필요하면 runtime 콜백(<code>pfnAllocateCb</code>, 이름에 <code>Cb</code>
        =callback)으로 커널에 allocation을 요청하고, 이때 <code>D3DKMT*</code> 호출로
        <span style={{ color: COLORS.kernel }}> Dxgkrnl/VidMm</span>에 진입합니다(여기가 user→kernel
        경계). VidMm은 메모리를 확보한 뒤 KMD의 <code>DxgkDdiCreateAllocation</code> 콜백을 불러 그
        하드웨어가 이해하는 allocation을 만들게 합니다. 즉 위로 갈수록 <em>무엇을</em>(API 의도),
        아래로 갈수록 <em>어떻게</em>(하드웨어 자원)에 가까워집니다.
      </figcaption>
    </figure>
  );
}
