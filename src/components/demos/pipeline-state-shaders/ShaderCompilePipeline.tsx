import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, roundRect, withAlpha, label, drawArrow, wrapText } from './pss2d';

// 셰이더 컴파일 파이프라인(정적). 두 줄 병기:
//   D3D12 : HLSL --(dxc, offline)--> DXIL --(UMD JIT, PSO 생성 시)--> GPU ISA
//   Vulkan: HLSL/GLSL --(dxc/glslang, offline)--> SPIR-V --(driver JIT, pipeline 생성 시)--> GPU ISA
// 가운데 세로 점선 = offline(앱 빌드 시) / online(드라이버, 생성 시) 경계.

interface Stage {
  title: string;
  sub: string;
  color: string;
}

interface Row {
  api: string;
  apiColor: string;
  stages: [Stage, Stage, Stage]; // source, IR, ISA
  toolOffline: string; // source -> IR 변환 도구
  toolOnline: string; // IR -> ISA 변환 도구
}

const ROWS: Row[] = [
  {
    api: 'D3D12',
    apiColor: COLORS.dx12,
    stages: [
      { title: 'HLSL', sub: '소스', color: COLORS.hlsl },
      { title: 'DXIL', sub: 'IR (LLVM 기반)', color: COLORS.ir },
      { title: 'GPU ISA', sub: '하드웨어 명령', color: COLORS.isa },
    ],
    toolOffline: 'dxc',
    toolOnline: 'UMD JIT @ PSO',
  },
  {
    api: 'Vulkan',
    apiColor: COLORS.vk,
    stages: [
      { title: 'HLSL / GLSL', sub: '소스', color: COLORS.hlsl },
      { title: 'SPIR-V', sub: '바이너리 IR', color: COLORS.ir },
      { title: 'GPU ISA', sub: '하드웨어 명령', color: COLORS.isa },
    ],
    toolOffline: 'dxc / glslang',
    toolOnline: 'driver JIT @ pipeline',
  },
];

export default function ShaderCompilePipeline() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 10;
    const topPad = 26; // 상단 offline/online 헤더
    const apiW = 56;
    const x0 = pad + apiW;
    const x1 = w - pad;
    const usableW = x1 - x0;
    const boxW = Math.min(118, usableW * 0.3);
    const boxH = 46;
    const rowGap = 18;
    const rowH = boxH + rowGap;
    const totalRowsH = ROWS.length * rowH - rowGap;
    const startY = topPad + (h - topPad - pad - totalRowsH) / 2;

    // 세 박스의 중심 x (좌·중·우)
    const cxs = [x0 + boxW / 2, x0 + usableW / 2, x1 - boxW / 2];
    // offline/online 경계 = 두 번째 박스(IR)와 세 번째(ISA) 사이
    const boundaryX = (cxs[1] + boxW / 2 + (cxs[2] - boxW / 2)) / 2;

    // 경계 점선 + 상단 라벨
    ctx.strokeStyle = withAlpha(theme.text, 0.35);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(boundaryX, topPad - 4);
    ctx.lineTo(boundaryX, h - pad);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, (x0 + boundaryX) / 2, topPad - 14, 'offline (앱 빌드 시)', theme.muted, 9, 'bold');
    label(ctx, (boundaryX + x1) / 2, topPad - 14, 'online (드라이버, 생성 시)', COLORS.jit, 9, 'bold');

    ROWS.forEach((row, r) => {
      const top = startY + r * rowH;
      const cy = top + boxH / 2;
      // API 라벨
      label(ctx, pad + apiW / 2 - 2, cy, row.api, row.apiColor, 12, 'bold');

      // 박스들
      row.stages.forEach((s, i) => {
        const cx = cxs[i];
        roundRect(ctx, cx - boxW / 2, top, boxW, boxH, 7);
        ctx.fillStyle = withAlpha(s.color, 0.16);
        ctx.fill();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        label(ctx, cx, top + 16, s.title, s.color, 12, 'bold');
        wrapText(ctx, s.sub, cx, top + 33, boxW - 8, theme.muted, { px: 8.5, lineH: 10 });
      });

      // 화살표 + 도구 라벨
      const a0x = cxs[0] + boxW / 2;
      const a1x = cxs[1] - boxW / 2;
      drawArrow(ctx, a0x + 2, cy, a1x - 2, cy, row.apiColor, 1.8, 7);
      label(ctx, (a0x + a1x) / 2, cy - 9, row.toolOffline, theme.text, 8.5, 'bold');

      const b0x = cxs[1] + boxW / 2;
      const b1x = cxs[2] - boxW / 2;
      drawArrow(ctx, b0x + 2, cy, b1x - 2, cy, COLORS.jit, 1.8, 7);
      wrapText(ctx, row.toolOnline, (b0x + b1x) / 2, cy - 12, (b1x - b0x) - 6, COLORS.jit, {
        px: 8.5,
        weight: 'bold',
        lineH: 9.5,
      });
    });
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 230, display: 'block' }} />
      <figcaption>
        셰이더는 <strong>두 단계</strong>로 컴파일됩니다. 왼쪽(점선 왼편)은 <strong>offline</strong> — 앱을
        빌드할 때 HLSL/GLSL 소스를 중간 IR로 한 번 컴파일합니다.{' '}
        <span style={{ color: COLORS.dx12 }}>D3D12</span>는 <code>dxc</code>가 <strong>DXIL</strong>(LLVM
        bitcode 기반)을, <span style={{ color: COLORS.vk }}>Vulkan</span>은 <code>dxc</code>(<code>-spirv</code>)
        나 <code>glslang</code>이 <strong>SPIR-V</strong>(바이너리 IR)를 냅니다. 이 IR은 아직 어느 GPU의
        명령도 아닙니다 — IHV 중립적인 <em>계약</em>일 뿐입니다. 오른쪽(점선 오른편)은{' '}
        <span style={{ color: COLORS.jit }}>online</span> — 드라이버(UMD)의 <strong>JIT 컴파일러</strong>가
        그 IR을 받아 <strong>실제 GPU ISA</strong>로 변환합니다. 그런데 이 JIT가 도는 시점이 바로{' '}
        <strong>PSO / VkPipeline 생성 시</strong>입니다. 셰이더를 GPU 명령으로 바꾸는 무거운 작업이 여기서
        일어나기 때문에, 파이프라인 생성이 느리고 첫 사용 때 hitching이 생기는 것입니다.
      </figcaption>
    </figure>
  );
}
