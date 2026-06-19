import { useRef, useState } from 'react';
import { ControlPanel, ToggleControl, Slider } from '../../controls';
import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { usePointerDrag } from './usePointerDrag';
import {
  COLORS,
  withAlpha,
  monoFont,
  mortonEncode,
  linearEncode,
  pointerToCanvas,
} from './mbr2d';

// MortonSwizzle (I, 과정):
// 8×8 텍셀 격자. linear(row-major) 주소 vs Morton(Z-order) 주소.
// 한 캐시 라인 = 연속한 LINE 개 주소. 텍스처 블록(footprint)을 끌면, 그 블록의
// 텍셀들이 몇 개의 서로 다른 캐시 라인에 걸치는지를 색으로 보이고 카운트한다.
// linear에서는 세로로 이웃한 텍셀이 주소상 한 행(=GRID칸)만큼 떨어져 라인이 흩어지고,
// Morton에서는 2D 이웃이 주소상으로도 가까워 적은 라인에 모인다 → 캐시 적중↑.

const BITS = 3; // 좌표당 3비트 → 8×8
const GRID = 1 << BITS; // 8
const LINE = 4; // 캐시 라인당 주소 수

// 캐시 라인 색(라인 index에 따라 순환).
const LINE_COLORS = [
  COLORS.compute,
  COLORS.bandwidth,
  COLORS.good,
  COLORS.accent2,
  COLORS.cache,
  COLORS.bad,
] as const;

export default function MortonSwizzle() {
  const [morton, setMorton] = useState(false);
  const [block, setBlock] = useState(3); // footprint 한 변(텍셀)
  // footprint 좌상단 위치(텍셀).
  const [ox, setOx] = useState(2);
  const [oy, setOy] = useState(2);

  const addrOf = (x: number, y: number): number =>
    morton ? mortonEncode(x, y, BITS) : linearEncode(x, y, GRID);

  // footprint 내 텍셀이 닿는 캐시 라인 집합.
  const lines = new Set<number>();
  const blk = Math.min(block, GRID);
  const bx = Math.min(ox, GRID - blk);
  const by = Math.min(oy, GRID - blk);
  for (let y = by; y < by + blk; y++) {
    for (let x = bx; x < bx + blk; x++) {
      lines.add(Math.floor(addrOf(x, y) / LINE));
    }
  }
  const touched = lines.size;
  const texels = blk * blk;
  // "이상적" = ceil(texels/LINE). 라인이 많을수록 같은 데이터에 더 많은 fetch.
  const ideal = Math.ceil(texels / LINE);

  // 라인 → 색 index 매핑(보이는 라인만 압축해 색 부여).
  const lineList = Array.from(lines).sort((a, b) => a - b);
  const lineColor = (line: number): string =>
    LINE_COLORS[lineList.indexOf(line) % LINE_COLORS.length];

  const geomRef = useRef({ gx: 0, gy: 0, cell: 0 });

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 14;
    const headerH = 22;
    const avail = Math.min(w - pad * 2, h - pad * 2 - headerH);
    const cell = Math.floor(avail / GRID);
    const gx = pad;
    const gy = pad + headerH;
    geomRef.current = { gx, gy, cell };

    // 헤더
    ctx.font = monoFont(11, 'bold');
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(morton ? 'Morton (Z-order) 주소' : 'linear (row-major) 주소', gx, pad + 12);

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const px = gx + x * cell;
        const py = gy + y * cell;
        const line = Math.floor(addrOf(x, y) / LINE);
        const inBlock = x >= bx && x < bx + blk && y >= by && y < by + blk;

        // 배경: 블록 안 텍셀은 그 라인 색, 밖은 표면색.
        ctx.fillStyle = inBlock ? withAlpha(lineColor(line), 0.85) : theme.surface;
        ctx.fillRect(px, py, cell - 1, cell - 1);
        ctx.strokeStyle = withAlpha(theme.border, 0.8);
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
      }
    }

    // Z-order/선형 주소 순서를 잇는 곡선(접근 순서 = 메모리 배치).
    ctx.strokeStyle = withAlpha(theme.muted, 0.45);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let first = true;
    const order: Array<{ a: number; x: number; y: number }> = [];
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) order.push({ a: addrOf(x, y), x, y });
    order.sort((p, q) => p.a - q.a);
    for (const o of order) {
      const cx = gx + o.x * cell + cell / 2;
      const cy = gy + o.y * cell + cell / 2;
      if (first) {
        ctx.moveTo(cx, cy);
        first = false;
      } else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // 블록 외곽
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 2.2;
    ctx.strokeRect(gx + bx * cell, gy + by * cell, blk * cell, blk * cell);
  };

  const { ref, redraw } = useCanvas2d(draw, [morton, block, ox, oy]);

  // 드래그로 블록 이동.
  const moveTo = (px: number, py: number) => {
    const { gx, gy, cell } = geomRef.current;
    if (cell <= 0) return;
    const nx = Math.floor((px - gx) / cell);
    const ny = Math.floor((py - gy) / cell);
    setOx(Math.max(0, Math.min(GRID - blk, nx - Math.floor(blk / 2))));
    setOy(Math.max(0, Math.min(GRID - blk, ny - Math.floor(blk / 2))));
  };
  usePointerDrag(ref, {
    onDown: (e, canvas) => {
      const p = pointerToCanvas(e, canvas);
      moveTo(p.x, p.y);
    },
    onMove: (e, canvas) => {
      const p = pointerToCanvas(e, canvas);
      moveTo(p.x, p.y);
      redraw();
    },
  });

  return (
    <figure className="demo">
      <canvas
        ref={ref}
        className="demo-canvas"
        style={{ height: 300, display: 'block', touchAction: 'none', cursor: 'pointer' }}
      />
      <ControlPanel>
        <ToggleControl label="Morton (Z-order) swizzle" checked={morton} onChange={setMorton} />
        <Slider label="footprint 크기" value={block} min={2} max={4} step={1} unit="²" onChange={setBlock} />
      </ControlPanel>
      <figcaption>
        8×8 텍셀 격자입니다. 가는 회색 선은 메모리에 텍셀이 놓인 순서(주소 순)입니다 — linear에서는
        한 행씩 훑는 뱀, Morton에서는 ㄹ자(Z)가 재귀로 접히는 곡선입니다. 굵은 사각형이 한 번의
        2D 접근(footprint)이고, 그 안 텍셀은 자신이 속한 <strong>캐시 라인</strong>(연속 {LINE}개
        주소 = 한 색)으로 칠해집니다. footprint를 끌어 옮겨 보세요. 지금 {blk}×{blk}={texels}개
        텍셀이 <strong>{touched}개</strong>의 캐시 라인에 걸쳐 있습니다(이상적으로는 {ideal}개면
        충분).{' '}
        {morton ? (
          <>
            Morton에서는 2D로 이웃한 텍셀이 주소상으로도 모여 있어, 한 footprint가{' '}
            <strong style={{ color: COLORS.good }}>적은 라인</strong>에 담깁니다 — 한 번 끌어온 라인이
            이웃 텍셀까지 덮어 캐시 적중률이 오릅니다.
          </>
        ) : (
          <>
            linear에서는 세로로 이웃한 텍셀이 주소상 한 행({GRID}칸)만큼 떨어져, 작은 2D 블록도{' '}
            <strong style={{ color: COLORS.bad }}>여러 라인</strong>에 흩어집니다. 각 라인은
            footprint가 안 쓰는 가로 이웃까지 끌어와 — 그만큼 대역폭을 낭비합니다. Morton을 켜고 같은
            블록을 다시 보세요.
          </>
        )}
      </figcaption>
    </figure>
  );
}
