import { useCanvas2d, type DrawCtx } from './useCanvas2d';
import { COLORS, withAlpha, monoFont, mortonEncode, linearEncode } from './mbr2d';

// MortonSwizzle (정적): 8×8 텍셀 격자 두 장을 세로로 쌓아 비교.
// 위 = linear(row-major) 주소, 아래 = Morton(Z-order) 주소. 같은 3×3 footprint를 둘 다에 올려,
// 그 블록이 몇 개의 캐시 라인에 걸치는지를 색으로 보이고 카운트한다.
// linear는 세로 이웃이 멀어 라인이 흩어지고, Morton은 2D 이웃이 주소상으로도 모여 적은 라인에 담긴다.

const BITS = 3; // 좌표당 3비트 → 8×8
const GRID = 1 << BITS; // 8
const LINE = 4; // 캐시 라인당 주소 수
const BLK = 3; // footprint 한 변(텍셀)
const OX = 2; // footprint 좌상단
const OY = 2;

const LINE_COLORS = [
  COLORS.compute,
  COLORS.bandwidth,
  COLORS.good,
  COLORS.accent2,
  COLORS.cache,
  COLORS.bad,
] as const;

function addrOf(morton: boolean, x: number, y: number): number {
  return morton ? mortonEncode(x, y, BITS) : linearEncode(x, y, GRID);
}

function linesTouched(morton: boolean): number {
  const lines = new Set<number>();
  for (let y = OY; y < OY + BLK; y++)
    for (let x = OX; x < OX + BLK; x++) lines.add(Math.floor(addrOf(morton, x, y) / LINE));
  return lines.size;
}

export default function MortonSwizzle() {
  const linLines = linesTouched(false);
  const morLines = linesTouched(true);
  const ideal = Math.ceil((BLK * BLK) / LINE);

  const draw = (d: DrawCtx) => {
    const { ctx, w, h, theme } = d;
    const pad = 12;
    const headerH = 20;
    const gap = 16;
    // 두 격자를 세로로 쌓는다.
    const cell = Math.floor(
      Math.min((w - pad * 2) / GRID, (h - pad * 2 - headerH * 2 - gap) / (GRID * 2)),
    );
    const gridPx = cell * GRID;
    const gx = (w - gridPx) / 2;

    const drawGrid = (morton: boolean, gy: number, title: string) => {
      // 그 격자에서 footprint가 닿는 라인 → 색 index.
      const lines = new Set<number>();
      for (let y = OY; y < OY + BLK; y++)
        for (let x = OX; x < OX + BLK; x++) lines.add(Math.floor(addrOf(morton, x, y) / LINE));
      const lineList = Array.from(lines).sort((a, b) => a - b);
      const lineColor = (line: number): string =>
        LINE_COLORS[lineList.indexOf(line) % LINE_COLORS.length];

      ctx.font = monoFont(12, 'bold');
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(title, gx, gy - 6);

      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const px = gx + x * cell;
          const py = gy + y * cell;
          const line = Math.floor(addrOf(morton, x, y) / LINE);
          const inBlock = x >= OX && x < OX + BLK && y >= OY && y < OY + BLK;
          ctx.fillStyle = inBlock ? withAlpha(lineColor(line), 0.85) : theme.surface;
          ctx.fillRect(px, py, cell - 1, cell - 1);
          ctx.strokeStyle = withAlpha(theme.border, 0.8);
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
        }
      }

      // 주소 순서를 잇는 곡선.
      ctx.strokeStyle = withAlpha(theme.muted, 0.45);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const order: Array<{ a: number; x: number; y: number }> = [];
      for (let y = 0; y < GRID; y++)
        for (let x = 0; x < GRID; x++) order.push({ a: addrOf(morton, x, y), x, y });
      order.sort((p, q) => p.a - q.a);
      order.forEach((o, i) => {
        const cx = gx + o.x * cell + cell / 2;
        const cy = gy + o.y * cell + cell / 2;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();

      // 블록 외곽
      ctx.strokeStyle = theme.text;
      ctx.lineWidth = 2.2;
      ctx.strokeRect(gx + OX * cell, gy + OY * cell, BLK * cell, BLK * cell);

      // 라인 수 라벨
      ctx.font = monoFont(11, 'bold');
      ctx.fillStyle = lines.size <= ideal ? COLORS.good : COLORS.bad;
      ctx.textAlign = 'left';
      ctx.fillText(`${lines.size}개 캐시 라인`, gx + gridPx + 8, gy + gridPx / 2);
    };

    let y = pad + headerH;
    drawGrid(false, y, 'linear (row-major)');
    y += gridPx + headerH + gap;
    drawGrid(true, y, 'Morton (Z-order)');
  };

  const { ref } = useCanvas2d(draw, []);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 420, display: 'block' }} />
      </div>
      <figcaption>
        같은 8×8 텍셀과 같은 3×3 footprint(굵은 사각형)를 두 주소 배치에 올린 비교입니다. 가는 회색
        선은 메모리에 텍셀이 놓인 순서(주소 순)로, <strong>linear</strong>는 한 행씩 훑는 뱀,{' '}
        <strong>Morton</strong>은 ㄹ자(Z)가 재귀로 접히는 곡선입니다. footprint 안 텍셀은 자신이 속한{' '}
        <strong>캐시 라인</strong>(연속 {LINE}개 주소 = 한 색)으로 칠해집니다. 3×3={BLK * BLK}개
        텍셀은 이상적으로 {ideal}개 라인이면 충분한데, linear에서는 세로로 이웃한 텍셀이 주소상 한
        행({GRID}칸)만큼 떨어져{' '}
        <strong style={{ color: COLORS.bad }}>{linLines}개 라인</strong>에 흩어집니다 — 각 라인은
        footprint가 안 쓰는 가로 이웃까지 끌어와 대역폭을 낭비합니다. Morton에서는 2D로 이웃한 텍셀이
        주소상으로도 모여{' '}
        <strong style={{ color: COLORS.good }}>{morLines}개 라인</strong>에 담겨, 한 번 끌어온 라인이
        이웃 텍셀까지 덮으니 캐시 적중률이 오릅니다.
      </figcaption>
    </figure>
  );
}
