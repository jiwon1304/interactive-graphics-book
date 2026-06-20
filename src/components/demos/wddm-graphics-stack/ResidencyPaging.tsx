import { useMemo, useState } from 'react';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, box, drawArrow, monoFont, withAlpha } from './wgs2d';
import { ControlPanel, Slider, ToggleControl } from '../../controls';

// ResidencyPaging (인터랙티브): allocation들이 VRAM ↔ system memory를 오간다.
// 사용자가 (1) 이번 프레임에 "참조"하는 allocation을 토글하고 (2) VRAM 예산(슬롯 수)을 정한 뒤
// "프레임 제출"을 누르면, VidMm이 제출 *전에* 참조된 것들을 VRAM에 resident로 만든다(필요하면
// 비참조 allocation을 system memory로 evict). 참조 수가 예산을 넘으면 모두 resident로 만들 수
// 없어 paging이 매 프레임 반복(thrash)된다 — 이 "과정"을 보여준다.

const ALLOC_NAMES = ['Tex A', 'Tex B', 'Mesh', 'CBuf', 'RT', 'Shadow'];
const N = ALLOC_NAMES.length;

type Loc = 'vram' | 'sys';

export default function ResidencyPaging() {
  // 각 allocation을 이번 프레임에 참조하는가
  const [refd, setRefd] = useState<boolean[]>([true, true, false, true, false, false]);
  // VRAM 예산(동시에 resident 가능한 슬롯 수)
  const [budget, setBudget] = useState(3);
  // 현재 residency 위치(제출이 갱신). 초기엔 일부 VRAM/일부 sys.
  const [loc, setLoc] = useState<Loc[]>(['vram', 'vram', 'sys', 'vram', 'sys', 'sys']);
  // 마지막 제출에서 page-in / evict 된 인덱스(애니메이션·강조용)
  const [pagedIn, setPagedIn] = useState<boolean[]>(Array(N).fill(false));
  const [evicted, setEvicted] = useState<boolean[]>(Array(N).fill(false));
  const [submitted, setSubmitted] = useState(false);

  const refCount = refd.filter(Boolean).length;
  const overBudget = refCount > budget;

  const submit = () => {
    // VidMm 패스: 참조된 것을 VRAM으로, 예산 초과분은 어쩔 수 없이 thrash.
    // 우선순위: 참조된 allocation부터 VRAM 슬롯을 채운다(예산까지). 나머지는 sys.
    const nextLoc: Loc[] = Array(N).fill('sys');
    const pin: boolean[] = Array(N).fill(false);
    const ev: boolean[] = Array(N).fill(false);
    let used = 0;
    // 1) 참조된 것부터 VRAM에 올림
    for (let i = 0; i < N; i++) {
      if (refd[i] && used < budget) {
        nextLoc[i] = 'vram';
        if (loc[i] !== 'vram') pin[i] = true; // page-in 발생
        used++;
      }
    }
    // 2) 비참조인데 이전에 VRAM이던 것 → evict 표시
    for (let i = 0; i < N; i++) {
      if (nextLoc[i] === 'sys' && loc[i] === 'vram') ev[i] = true;
    }
    setLoc(nextLoc);
    setPagedIn(pin);
    setEvicted(ev);
    setSubmitted(true);
  };

  const toggleRef = (i: number) => {
    setRefd((r) => r.map((v, j) => (j === i ? !v : v)));
    setSubmitted(false);
    setPagedIn(Array(N).fill(false));
    setEvicted(Array(N).fill(false));
  };

  const draw = useMemo(
    () => (d: DrawCtx) => {
      const { ctx, w, h, theme } = d;
      const narrow = w < 460;
      const colGap = narrow ? 14 : 24;
      const padX = Math.max(10, w * 0.03);
      const colW = (w - padX * 2 - colGap) / 2;
      const vramX = padX;
      const sysX = padX + colW + colGap;
      const headY = 22;
      const top = 40;
      const slotH = narrow ? 26 : 28;
      const slotGap = 8;

      // 컬럼 헤더
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = monoFont(narrow ? 11 : 12.5, 'bold');
      ctx.fillStyle = COLORS.vram;
      ctx.fillText(`VRAM (device-local)  예산 ${budget}`, vramX + colW / 2, headY);
      ctx.fillStyle = COLORS.sysmem;
      ctx.fillText('system memory', sysX + colW / 2, headY);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';

      // VRAM 슬롯 윤곽(예산만큼)
      for (let s = 0; s < budget; s++) {
        const y = top + s * (slotH + slotGap);
        ctx.strokeStyle = withAlpha(COLORS.vram, 0.5);
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.strokeRect(vramX, y, colW, slotH);
        ctx.setLineDash([]);
      }

      // 각 allocation 박스를 위치에 따라 배치
      let vramRow = 0;
      let sysRow = 0;
      for (let i = 0; i < N; i++) {
        const inVram = loc[i] === 'vram';
        const x = inVram ? vramX : sysX;
        const row = inVram ? vramRow++ : sysRow++;
        const y = top + row * (slotH + slotGap);
        const isRef = refd[i];
        const base = inVram ? COLORS.vram : COLORS.sysmem;
        // 참조 안 된 건 흐리게
        box(ctx, x, y, colW, slotH, base, '', theme, { alpha: isRef ? 0.22 : 0.1 });
        // 이름 + 상태 점
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = monoFont(narrow ? 10 : 11, 'bold');
        ctx.fillStyle = isRef ? theme.text : theme.muted;
        ctx.fillText(ALLOC_NAMES[i], x + 10, y + slotH / 2);
        // 참조 마크
        ctx.font = monoFont(9);
        ctx.fillStyle = isRef ? COLORS.gpu : theme.muted;
        ctx.textAlign = 'right';
        ctx.fillText(isRef ? '● 참조' : '○', x + colW - 8, y + slotH / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        // page-in / evict 강조 화살표(가운데 통로)
        if (submitted && pagedIn[i]) {
          drawArrow(ctx, sysX - 4, y + slotH / 2, vramX + colW + 4, y + slotH / 2, COLORS.gpu, 2, 7);
        } else if (submitted && evicted[i]) {
          drawArrow(ctx, vramX + colW + 4, y + slotH / 2, sysX - 4, y + slotH / 2, theme.muted, 1.6, 6);
        }
      }

      // 하단 상태줄
      const statusY = h - 16;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = monoFont(narrow ? 10 : 11, 'bold');
      if (!submitted) {
        ctx.fillStyle = theme.muted;
        ctx.fillText('"프레임 제출"을 누르면 VidMm이 참조 allocation을 resident로 만든다', w / 2, statusY);
      } else if (overBudget) {
        ctx.fillStyle = COLORS.era1;
        ctx.fillText(
          `참조 ${refCount} > VRAM 예산 ${budget} — 다 못 올림. 매 프레임 paging thrash`,
          w / 2,
          statusY,
        );
      } else {
        ctx.fillStyle = COLORS.vram;
        ctx.fillText('참조된 allocation이 모두 VRAM에 resident — 스케줄 가능', w / 2, statusY);
      }
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    },
    [refd, loc, budget, submitted, pagedIn, evicted, overBudget, refCount],
  );

  const { ref } = useCanvas2d(draw, [refd, loc, budget, submitted, pagedIn, evicted]);

  return (
    <figure className="demo">
      <canvas ref={ref} className="demo-canvas" style={{ height: 320, display: 'block' }} />
      <ControlPanel>
        <Slider
          label="VRAM 예산 (resident 슬롯)"
          value={budget}
          min={1}
          max={N}
          step={1}
          onChange={(v) => {
            setBudget(v);
            setSubmitted(false);
            setPagedIn(Array(N).fill(false));
            setEvicted(Array(N).fill(false));
          }}
        />
        <button type="button" className="wgs-btn" onClick={submit}>
          프레임 제출 (VidMm 패스)
        </button>
      </ControlPanel>
      <ControlPanel>
        {ALLOC_NAMES.map((name, i) => (
          <ToggleControl
            key={name}
            label={`${name} 참조`}
            checked={refd[i]}
            onChange={() => toggleRef(i)}
          />
        ))}
      </ControlPanel>
      <figcaption>
        WDDM 2.0의 residency는 <strong>per-device 목록</strong>입니다. UMD가 "이번 프레임에 이
        allocation들을 쓴다"고 device residency list에 올리면, <strong>VidMm</strong>이 제출된 work를
        GPU에 스케줄하기 <em>전에</em> 그 allocation들이 전부 <span style={{ color: COLORS.vram }}>VRAM
        </span>에 <strong>resident</strong>가 되도록 보장합니다 — 비어 있으면
        <span style={{ color: COLORS.sysmem }}> system memory</span>에서 page-in하고, 자리가
        부족하면 참조 안 되는 것을 evict합니다. 참조 allocation을 토글하고 VRAM 예산을 줄여 보세요.
        참조 수가 예산을 넘으면 한 프레임에 다 올릴 수 없어, 매 프레임 page-in/out이 반복되는
        <strong> paging thrash</strong>가 일어납니다(대형 씬의 hitch 원인). DX12의 <code>MakeResident</code>/
        <code>Evict</code>는 이 결정을 앱이 직접 쥐려는 API입니다.
      </figcaption>
      <WgsButtonStyles />
    </figure>
  );
}

function WgsButtonStyles() {
  return (
    <style>{`
      .wgs-btn {
        min-height: 44px;
        padding: 0 1rem;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text);
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
      }
      .wgs-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
      .wgs-btn:disabled { opacity: 0.45; cursor: default; }
    `}</style>
  );
}
