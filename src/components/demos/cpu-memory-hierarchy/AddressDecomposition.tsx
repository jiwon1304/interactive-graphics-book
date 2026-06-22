import { useEffect, useRef } from 'react';

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return {
    text: cs.getPropertyValue('--text').trim() || '#222',
    muted: cs.getPropertyValue('--muted').trim() || '#888',
    border: cs.getPropertyValue('--border').trim() || '#ccc',
    accent: cs.getPropertyValue('--accent').trim() || '#4f9dde',
    surface: cs.getPropertyValue('--surface').trim() || '#fff',
  };
}

// 예시 캐시: 32 KB, 8-way, 64B 라인.
//   라인 = 64B → offset = 6 bit
//   라인 수 = 32768 / 64 = 512, 8-way → set 수 = 512 / 8 = 64 → index = 6 bit
//   tag = 나머지 상위 비트
// 주소를 32-bit 물리주소로 가정 → tag = 32 - 6 - 6 = 20 bit
const TAG = 20;
const INDEX = 6;
const OFFSET = 6;

/**
 * 물리 주소가 tag | index | offset 으로 쪼개지는 그림(정적) +
 * 그 index가 가리키는 set(8-way) 한 줄을 도식화.
 * 예시: 32KB, 8-way, 64B line.
 */
export default function AddressDecomposition() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const col = readColors(canvas);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 560;
      const cssH = 300;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.textBaseline = 'middle';

      // ---- 1) 주소 막대 ----
      const x0 = 14;
      const barW = cssW - x0 * 2;
      const barY = 44;
      const barH = 40;
      const total = TAG + INDEX + OFFSET;
      const fields = [
        { label: 'tag', bits: TAG, fill: false },
        { label: 'index', bits: INDEX, fill: true },
        { label: 'offset', bits: OFFSET, fill: false },
      ];
      ctx.textAlign = 'left';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillStyle = col.text;
      ctx.fillText('물리 주소 (예: 32-bit)', x0, 22);

      let cx = x0;
      fields.forEach((f) => {
        const w = (f.bits / total) * barW;
        ctx.fillStyle = f.fill ? col.accent : col.surface;
        ctx.strokeStyle = col.accent;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.rect(cx, barY, w, barH);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = f.fill ? col.surface : col.text;
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(f.label, cx + w / 2, barY + barH / 2 - 7);
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = f.fill ? col.surface : col.muted;
        ctx.fillText(`${f.bits} bit`, cx + w / 2, barY + barH / 2 + 9);
        cx += w;
      });

      // index → set 화살표
      const idxCenter = x0 + (TAG / total) * barW + ((INDEX / total) * barW) / 2;
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(idxCenter, barY + barH + 2);
      ctx.lineTo(idxCenter, barY + barH + 26);
      ctx.stroke();
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.moveTo(idxCenter, barY + barH + 32);
      ctx.lineTo(idxCenter - 5, barY + barH + 24);
      ctx.lineTo(idxCenter + 5, barY + barH + 24);
      ctx.fill();

      // ---- 2) set(8-way) 한 줄 ----
      const WAYS = 8;
      const setY = barY + barH + 54;
      const setLabelW = 56;
      const wgap = 6;
      const wW = Math.max(28, (barW - setLabelW - (WAYS - 1) * wgap) / WAYS);
      const wH = 50;
      ctx.textAlign = 'left';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = col.text;
      ctx.fillText('set #N', x0, setY + wH / 2);
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = col.muted;
      ctx.fillText('(8-way)', x0, setY + wH / 2 + 14);

      for (let w = 0; w < WAYS; w++) {
        const wx = x0 + setLabelW + w * (wW + wgap);
        ctx.fillStyle = col.surface;
        ctx.strokeStyle = col.border;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.rect(wx, setY, wW, wH);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = col.muted;
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`way ${w}`, wx + wW / 2, setY + 12);
        ctx.fillText('tag+data', wx + wW / 2, setY + wH - 12);
      }
      // 설명: tag 비교
      ctx.textAlign = 'left';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = col.muted;
      ctx.fillText(
        'index가 set 하나를 고르고, 그 안 8개 way의 tag를 동시에 비교 → 일치하면 hit',
        x0,
        setY + wH + 22,
      );
      ctx.fillText(
        '예시 캐시: 32 KB · 8-way · 64 B 라인  →  512 라인 / 8 = 64 set (index 6 bit)',
        x0,
        setY + wH + 40,
      );
    };

    draw();
    const ro = new ResizeObserver(draw);
    if (ref.current) ro.observe(ref.current);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <figure className="demo">
      <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block' }} />
      <figcaption>
        하드웨어는 주소를 <strong>tag | index | offset</strong> 세 토막으로 본다고 약속합니다.
        offset(하위 6 bit)은 라인 안 byte 위치(64B=2⁶), index(다음 6 bit)는 64개 set 중 하나,
        tag(나머지 상위 비트)는 그 set 안에서 어느 라인인지 식별합니다. index로 set 하나를 고른 뒤
        그 안 8개 way의 tag를 <strong>병렬로</strong> 비교해 하나라도 맞으면 hit입니다. 이 구조
        때문에 <strong>큰 2의 거듭제곱 stride</strong>로 접근하면 주소들의 index가 같아져 한 set에
        몰리고, 8개를 넘기면 서로를 쫓아내는 conflict 절벽이 생깁니다.
      </figcaption>
    </figure>
  );
}
