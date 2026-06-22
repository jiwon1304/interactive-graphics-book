import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, drawArrow, monoFont, withAlpha } from './wgs2d';

// ResidencyPaging (정적): WDDM 2.0 residency를 한 대표 상태로 보여준다.
// 이번 프레임에 4개 allocation을 참조(●)하는데 VRAM 예산은 3슬롯뿐 → 참조 하나(Shadow)를
// 다 못 올린다. VidMm이 제출 전에 참조분을 VRAM에 page-in하지만, 예산을 넘는 한 개는 매 프레임
// VRAM↔system memory를 오가며 paging thrash가 난다. 이 "초과 상태"가 가장 설명력 있는 한 컷.

const BUDGET = 3;

interface Alloc {
  name: string;
  refd: boolean; // 이번 프레임에 참조되는가
  loc: 'vram' | 'sys'; // VidMm 패스 후 위치
  pagedIn?: boolean; // 이번 제출에서 system → VRAM 으로 올라옴
  thrash?: boolean; // 참조되지만 예산 초과로 못 올라온 것
}

// VidMm 패스 결과 상태(참조 4 > 예산 3):
//  참조분을 위에서부터 VRAM 채움 → Tex A, Tex B, RT 가 resident, Shadow는 못 올라옴(thrash).
//  Mesh/CBuf 는 비참조라 system memory에 남는다.
const VRAM_ALLOCS: Alloc[] = [
  { name: 'Tex A', refd: true, loc: 'vram' },
  { name: 'Tex B', refd: true, loc: 'vram' },
  { name: 'RT', refd: true, loc: 'vram', pagedIn: true },
];
const SYS_ALLOCS: Alloc[] = [
  { name: 'Shadow', refd: true, loc: 'sys', thrash: true },
  { name: 'Mesh', refd: false, loc: 'sys' },
  { name: 'CBuf', refd: false, loc: 'sys' },
];

export default function ResidencyPaging() {
  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const colGap = 16;
    const padX = Math.max(10, w * 0.03);
    const colW = (w - padX * 2 - colGap) / 2;
    const vramX = padX;
    const sysX = padX + colW + colGap;
    const headY = 24;
    const top = 46;
    const slotH = 30;
    const slotGap = 9;

    // 컬럼 헤더
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = monoFont(12.5, 'bold');
    ctx.fillStyle = COLORS.vram;
    ctx.fillText(`VRAM  예산 ${BUDGET}`, vramX + colW / 2, headY);
    ctx.fillStyle = COLORS.sysmem;
    ctx.fillText('system memory', sysX + colW / 2, headY);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // VRAM 슬롯 윤곽(예산만큼)
    for (let s = 0; s < BUDGET; s++) {
      const y = top + s * (slotH + slotGap);
      ctx.strokeStyle = withAlpha(COLORS.vram, 0.5);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeRect(vramX, y, colW, slotH);
      ctx.setLineDash([]);
    }

    const drawAlloc = (a: Alloc, x: number, y: number) => {
      const inVram = a.loc === 'vram';
      const base = inVram ? COLORS.vram : COLORS.sysmem;
      box(ctx, x, y, colW, slotH, base, '', theme, { alpha: a.refd ? 0.22 : 0.1 });
      // 이름
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = monoFont(12, 'bold');
      ctx.fillStyle = a.refd ? theme.text : theme.muted;
      ctx.fillText(a.name, x + 10, y + slotH / 2);
      // 참조 마크
      ctx.font = monoFont(11);
      ctx.fillStyle = a.refd ? COLORS.gpu : theme.muted;
      ctx.textAlign = 'right';
      ctx.fillText(a.refd ? '● 참조' : '○', x + colW - 8, y + slotH / 2);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    };

    // VRAM 컬럼
    VRAM_ALLOCS.forEach((a, i) => {
      const y = top + i * (slotH + slotGap);
      drawAlloc(a, vramX, y);
      // page-in 화살표(system → VRAM)
      if (a.pagedIn) {
        drawArrow(ctx, sysX - 4, y + slotH / 2, vramX + colW + 4, y + slotH / 2, COLORS.gpu, 2, 7);
      }
    });

    // system memory 컬럼
    SYS_ALLOCS.forEach((a, i) => {
      const y = top + i * (slotH + slotGap);
      drawAlloc(a, sysX, y);
      // thrash: 참조되는데 예산 초과로 못 올라온 것 — 양방향 화살표로 강조
      if (a.thrash) {
        drawArrow(ctx, sysX - 4, y + slotH / 2, vramX + colW + 4, y + slotH / 2, COLORS.era1, 1.8, 6);
        drawArrow(ctx, vramX + colW + 4, y + slotH / 2 + 6, sysX - 4, y + slotH / 2 + 6, COLORS.era1, 1.8, 6);
      }
    });

    // 하단 상태줄(초과 → thrash)
    const statusY = h - 18;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = monoFont(12, 'bold');
    ctx.fillStyle = COLORS.era1;
    ctx.fillText('참조 4 > 예산 3 — 1개를 못 올림. 매 프레임 paging thrash', w / 2, statusY);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ width: '100%', maxWidth: 400, height: 230, display: 'block' }}
      />
      <figcaption>
        WDDM 2.0의 residency는 <strong>per-device 목록</strong>입니다. UMD가 "이번 프레임에 이
        allocation들을 쓴다"고 device residency list에 올리면, <strong>VidMm</strong>이 제출된 work를
        GPU에 스케줄하기 <em>전에</em> 그 allocation들이 전부 <span style={{ color: COLORS.vram }}>VRAM
        </span>에 <strong>resident</strong>가 되도록 보장합니다 — 비어 있으면
        <span style={{ color: COLORS.sysmem }}> system memory</span>에서 page-in하고(주황 화살표), 자리가
        부족하면 참조 안 되는 것을 evict합니다. 그림은 참조(●) 네 개가 <strong>VRAM 예산 3슬롯</strong>을
        넘은 상태입니다: VidMm이 Tex A·Tex B·RT는 올렸지만 <strong>Shadow</strong>는 자리가 없어 못
        올립니다. 참조 수가 예산을 넘으면 한 프레임에 다 못 올려, 매 프레임 page-in/out이 반복되는
        <strong> paging thrash</strong>(분홍 양방향 화살표)가 일어납니다 — 대형 씬의 hitch 원인입니다.
        DX12의 <code>MakeResident</code>/<code>Evict</code>는 이 결정을 앱이 직접 쥐려는 API입니다.
      </figcaption>
    </figure>
  );
}
