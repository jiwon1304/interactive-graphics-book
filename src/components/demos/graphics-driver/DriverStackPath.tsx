import { useEffect, useRef, useState } from 'react';
import { ControlPanel, ToggleControl } from '../../controls';

const W = 560;
const H = 340;

interface Layer {
  key: string;
  name: string;
  thick: string;
  thin: string;
}

const LAYERS: Layer[] = [
  {
    key: 'app',
    name: '애플리케이션 + API 런타임 (D3D / GL / Vulkan)',
    thick: '앱이 그리기 명령을 호출. 런타임이 인자를 검증하고 드라이버로 넘긴다.',
    thin: '앱이 직접 명령 버퍼를 기록하고 PSO를 미리 만든다. 검증은 개발용 레이어로 분리(런타임 얇음).',
  },
  {
    key: 'umd',
    name: 'UMD — 유저 모드 드라이버 (앱 프로세스 안)',
    thick:
      'API 호출을 GPU 명령으로 변환 + draw 시점에 상태 검증·셰이더 컴파일/패치까지 수행 → CPU 부담이 크다. 멀티스레딩·앱별 최적화도 드라이버 몫. (크래시해도 앱만 죽는다)',
    thin: '얇다. 미리 만든 PSO를 참조해 명령 버퍼를 GPU 포맷으로 바꿔주는 정도. 무거운 컴파일·검증은 앱/사전 단계로 빠짐.',
  },
  {
    key: 'kmd',
    name: 'KMD — 커널 모드 드라이버',
    thick: '명령 버퍼를 GPU에 제출, GPU 스케줄러와 상호작용, VRAM 레지던시·페이징, 모드 설정. (커널 권한 — 크래시 = TDR/블루스크린)',
    thin: '역할은 같다 — 제출·스케줄링·메모리 관리. explicit API에서도 커널 작업은 OS/드라이버 몫. (WDDM 챕터 참고)',
  },
  {
    key: 'gpu',
    name: 'GPU',
    thick: '받은 명령을 실행.',
    thin: '받은 명령을 실행.',
  },
];

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

export default function DriverStackPath() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [thin, setThin] = useState(false);
  const [sel, setSel] = useState(1); // 기본 UMD 선택
  const selRef = useRef(sel);
  selRef.current = sel;
  const thinRef = useRef(thin);
  thinRef.current = thin;

  // 레이어 클릭(드래그 아님 → iOS에서 click 안전)
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const onClick = (e: MouseEvent) => {
      const r = c.getBoundingClientRect();
      const y = ((e.clientY - r.top) / r.height) * H;
      const bandH = H / LAYERS.length;
      setSel(Math.max(0, Math.min(LAYERS.length - 1, Math.floor(y / bandH))));
    };
    c.addEventListener('click', onClick);
    return () => c.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let t0 = performance.now();
    const loop = (now: number) => {
      const t = ((now - t0) / 2200) % 1; // 0..1 드로우콜 진행
      draw(ctx, t, selRef.current, thinRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function draw(ctx: CanvasRenderingContext2D, t: number, selected: number, isThin: boolean) {
    const muted = cssVar('--muted', '#888');
    const accent = cssVar('--accent', '#3b82f6');
    const text = cssVar('--text', '#222');
    const border = cssVar('--border', '#ccc');
    ctx.clearRect(0, 0, W, H);
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const bandH = H / LAYERS.length;

    LAYERS.forEach((L, i) => {
      const y = i * bandH;
      const isSel = i === selected;
      ctx.fillStyle = isSel ? accent : cssVar('--surface', '#f0f2f7');
      ctx.globalAlpha = isSel ? 0.18 : 1;
      ctx.fillRect(0, y + 2, W, bandH - 4);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isSel ? accent : border;
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(1, y + 2, W - 2, bandH - 4);
      ctx.fillStyle = text;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(L.name, 14, y + 20);

      // 무거운 작업 배지(셰이더 컴파일·상태 검증)의 위치
      ctx.font = '11px system-ui, sans-serif';
      let badge = '';
      if (!isThin && L.key === 'umd') badge = '⚙ 셰이더 컴파일 + 상태 검증 (draw 시점, 무거움)';
      if (isThin && L.key === 'app') badge = '⚙ PSO 사전 컴파일 (앱이 미리)';
      if (isThin && L.key === 'umd') badge = '얇음 — 명령 버퍼를 GPU 포맷으로 변환';
      if (badge) {
        ctx.fillStyle = !isThin && L.key === 'umd' ? '#e0564b' : '#2e9e5b';
        ctx.fillText(badge, 14, y + bandH - 14);
      }
    });

    // 드로우콜 토큰이 위→아래로 흐름
    const ty = 12 + t * (H - 24);
    ctx.fillStyle = '#f0a500';
    ctx.beginPath();
    ctx.arc(W - 40, ty, 7, 0, 7);
    ctx.fill();
    ctx.fillStyle = muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('draw call', W - 52, ty);
  }

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{ width: '100%', maxWidth: 560, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
        />
      </div>

      <ControlPanel>
        <ToggleControl label="explicit API (얇은 드라이버: D3D12 / Vulkan)" checked={thin} onChange={setThin} />
        <p style={{ margin: 0, color: 'var(--text)', fontSize: '0.86rem', lineHeight: 1.5 }}>
          <strong>{LAYERS[sel].name}</strong>
          <br />
          {thin ? LAYERS[sel].thin : LAYERS[sel].thick}
        </p>
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 레이어를 눌러 각 층이 하는 일을 보세요. 주황 점은 드로우콜이
        앱 → <strong>UMD(유저 모드 드라이버)</strong> → <strong>KMD(커널 모드 드라이버)</strong> → GPU로
        내려가는 길입니다. 토글을 끄면(<em>두꺼운 드라이버</em>, D3D11/OpenGL) UMD가 draw 시점에 상태
        검증·셰이더 컴파일까지 떠안아 CPU 부담이 큽니다. 켜면(<em>explicit API</em>) 그 무거운 일이
        앱의 <strong>PSO 사전 컴파일</strong>로 옮겨가고 드라이버는 얇아집니다 — 드로우콜이 싸지는 대신
        책임이 앱으로 넘어옵니다.
      </figcaption>
    </figure>
  );
}
