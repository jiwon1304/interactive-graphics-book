import { useEffect, useMemo, useRef, useState } from 'react';
import { ControlPanel, ToggleControl } from '../../controls';
import { setupCanvas, readTheme, observeTheme, blitImage, clamp } from './tc2d';

// ---------------------------------------------------------------------------
// 그림 6 (인터랙티브): 채널 패킹 (ORM).
//
// AO·러프니스·메탈릭 — 각각 흑백(1채널) 맵 — 을 한 RGB 텍스처의 R·G·B에 끼워 넣는다.
// 채널 토글을 켜고 끄며 "패킹된 한 장에서 어느 채널이 어느 맵인지" 분해해 본다.
// 한 텍스처·한 샘플로 세 값을 동시에 읽으니 샘플러·대역폭이 1/3.
// ---------------------------------------------------------------------------

const N = 96;

// 절차적 흑백 맵 3장(외부 에셋 없이).
interface Maps {
  ao: Float32Array;
  rough: Float32Array;
  metal: Float32Array;
}
function makeMaps(): Maps {
  const ao = new Float32Array(N * N);
  const rough = new Float32Array(N * N);
  const metal = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const u = x / (N - 1);
      const v = y / (N - 1);
      // AO: 부드러운 가장자리 어두움(비네팅류) + 줄눈
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const groove = 0.5 + 0.5 * Math.cos((u * 6 + v * 2) * Math.PI * 2);
      ao[i] = clamp(0.5 + 1.6 * edge - 0.25 * groove, 0, 1);
      // 러프니스: 대각 그라데이션 + 패치
      const patch = Math.sin(u * 8) * Math.sin(v * 8);
      rough[i] = clamp(0.35 + 0.5 * v + 0.2 * patch, 0, 1);
      // 메탈릭: 가운데 원형 금속 영역(이진에 가깝게)
      const dx = u - 0.5;
      const dy = v - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      metal[i] = r < 0.28 ? 0.95 : 0.05;
    }
  }
  return { ao, rough, metal };
}

export default function ChannelPacking() {
  const maps = useMemo(() => makeMaps(), []);
  const [r, setR] = useState(true); // AO
  const [g, setG] = useState(true); // Roughness
  const [b, setB] = useState(true); // Metallic
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const run = (): void => {
      const setup = setupCanvas(canvas);
      if (!setup) return;
      const { ctx, w, h } = setup;
      const theme = readTheme(canvas);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = theme.surface;
      ctx.fillRect(0, 0, w, h);

      // 레이아웃: 위 줄에 흑백 소스 3장, 아래에 패킹된 큰 ORM 한 장.
      const pad = 12;
      const topY = 26;
      const small = Math.min((w - pad * 4) / 3, 110);
      const cols = [
        { data: maps.ao, label: 'AO → R', on: r },
        { data: maps.rough, label: 'Rough → G', on: g },
        { data: maps.metal, label: 'Metal → B', on: b },
      ];
      const totalSmall = small * 3 + pad * 2;
      const sx0 = (w - totalSmall) / 2;

      cols.forEach((c, k) => {
        const x = sx0 + k * (small + pad);
        const img = ctx.createImageData(N, N);
        for (let i = 0; i < N * N; i++) {
          const g8 = Math.round(c.data[i] * 255);
          img.data[i * 4] = g8;
          img.data[i * 4 + 1] = g8;
          img.data[i * 4 + 2] = g8;
          img.data[i * 4 + 3] = 255;
        }
        blitImage(ctx, img, x, topY, small, small);
        ctx.strokeStyle = c.on ? theme.accent : theme.border;
        ctx.lineWidth = c.on ? 2 : 1;
        ctx.strokeRect(x + 0.5, topY + 0.5, small, small);
        ctx.fillStyle = c.on ? theme.text : theme.muted;
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.label, x + small / 2, topY + small + 14);
      });

      // 아래 큰 패킹 텍스처
      const bigY = topY + small + 34;
      const big = Math.min(w - pad * 2, h - bigY - 8, 170);
      const bx = (w - big) / 2;
      const img = ctx.createImageData(N, N);
      for (let i = 0; i < N * N; i++) {
        img.data[i * 4] = r ? Math.round(maps.ao[i] * 255) : 0;
        img.data[i * 4 + 1] = g ? Math.round(maps.rough[i] * 255) : 0;
        img.data[i * 4 + 2] = b ? Math.round(maps.metal[i] * 255) : 0;
        img.data[i * 4 + 3] = 255;
      }
      blitImage(ctx, img, bx, bigY, big, big);
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, bigY + 0.5, big, big);
      ctx.fillStyle = theme.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('패킹된 ORM 텍스처 (한 장)', bx + big / 2, bigY + big + 14);
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(canvas);
    const stop = observeTheme(run);
    return () => {
      ro.disconnect();
      stop();
    };
  }, [maps, r, g, b]);

  return (
    <figure className="demo">
      <div className="demo-canvas" style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
        <canvas ref={ref} style={{ width: '100%', height: 380, display: 'block' }} />
      </div>
      <ControlPanel>
        <ToggleControl label="R = AO" checked={r} onChange={setR} />
        <ToggleControl label="G = Roughness" checked={g} onChange={setG} />
        <ToggleControl label="B = Metallic" checked={b} onChange={setB} />
      </ControlPanel>
      <figcaption>
        AO·러프니스·메탈릭은 각각 <strong>한 채널(흑백)</strong>짜리 맵이다 — RGB 텍스처 한
        장에 각자 다른 채널로 넣으면 빈 채널을 낭비하지 않는다. 위 세 흑백 맵이 아래 한 장의
        R·G·B로 합쳐진 것이 흔히 <strong>ORM</strong>이라 부르는 패킹 텍스처다. 채널을 하나씩
        꺼 보면, 아래 패킹 이미지에서 그 색 성분이 빠지며 어느 맵이 어느 채널이었는지 분해된다.
        이득은 두 가지다. 첫째, 셰이더가 <strong>한 번의 텍스처 샘플</strong>로 세 값을 동시에
        읽어 샘플러·대역폭이 1/3로 준다. 둘째, 이 패킹 텍스처를 그대로 BC7 같은 블록 포맷으로
        압축하면 앞서 본 절감이 그 위에 또 곱해진다 — 채널 패킹과 블록 압축은 서로 직교하는
        절약이라 함께 쓴다.
      </figcaption>
    </figure>
  );
}
