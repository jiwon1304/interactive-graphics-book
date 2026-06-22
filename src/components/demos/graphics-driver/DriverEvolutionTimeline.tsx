import { useEffect, useRef, useState } from 'react';
import { ControlPanel, Slider } from '../../controls';

const W = 560;
const H = 200;

interface Era {
  year: string;
  name: string;
  desc: string;
  appShare: number; // 앱이 직접 관리하는(explicit) 비중 0..1
}

const ERAS: Era[] = [
  {
    year: '~1995',
    name: '고정 기능 파이프라인',
    desc: '셰이더가 없다. 드라이버는 고정 파이프라인 상태(조명·텍스처 결합 등)를 HW 레지스터로 매핑. Glide·초기 OpenGL/Direct3D. 하드웨어마다 드라이버가 제각각.',
    appShare: 0.05,
  },
  {
    year: '~2001',
    name: '프로그래머블 셰이더 등장',
    desc: 'GeForce3·DirectX 8/9. 정점/픽셀 셰이더가 생기며 드라이버가 셰이더(어셈블리→HLSL/GLSL)를 컴파일하기 시작 → 드라이버가 컴파일러를 품기 시작한다.',
    appShare: 0.1,
  },
  {
    year: '~2006',
    name: '통합 셰이더 + WDDM',
    desc: 'GeForce 8800·D3D10·Windows Vista. 통합 셰이더 코어. WDDM이 메모리 관리·스케줄링을 OS로 옮기고 UMD/KMD 분리를 공식화(드라이버 크래시 복구=TDR).',
    appShare: 0.15,
  },
  {
    year: '~2011',
    name: '두꺼운 드라이버 전성기 (DX11/GL)',
    desc: 'draw 시점 상태 검증·셰이더 패치·멀티스레딩·앱별 최적화("game ready" 프로파일)까지 드라이버가 떠안는다. 드로우콜 CPU 오버헤드가 크고, 같은 GPU도 드라이버 최적화로 성능이 갈린다.',
    appShare: 0.2,
  },
  {
    year: '2013–16',
    name: 'explicit·저오버헤드 API',
    desc: 'Mantle(2013)→DirectX 12·Vulkan(2015–16). PSO 사전 컴파일·명령 버퍼 직접 기록·레지던시 관리가 앱으로 이동. 드라이버는 얇아지고 드로우콜이 싸진다(대신 책임은 앱).',
    appShare: 0.8,
  },
  {
    year: '2018+',
    name: '현대',
    desc: '레이트레이싱·메시 셰이더 파이프라인, 어디서나 셰이더/PSO 캐시, 드라이버 측 업스케일링(DLSS/FSR), 성숙한 오픈소스 Mesa(RADV·NIR·ACO)와 번역 계층(DXVK·VKD3D-Proton·Zink).',
    appShare: 0.85,
  },
];

function cssVar(n: string, fb: string) {
  if (typeof window === 'undefined') return fb;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb;
}

export default function DriverEvolutionTimeline() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [idx, setIdx] = useState(3);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const text = cssVar('--text', '#222');
    const muted = cssVar('--muted', '#888');
    const accent = cssVar('--accent', '#3b82f6');
    const border = cssVar('--border', '#ccc');
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    // 타임라인 축
    const x0 = 40;
    const x1 = W - 40;
    const ty = 50;
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, ty);
    ctx.lineTo(x1, ty);
    ctx.stroke();

    ERAS.forEach((e, i) => {
      const x = x0 + ((x1 - x0) * i) / (ERAS.length - 1);
      const isSel = i === idx;
      ctx.fillStyle = isSel ? accent : muted;
      ctx.beginPath();
      ctx.arc(x, ty, isSel ? 8 : 5, 0, 7);
      ctx.fill();
      ctx.fillStyle = isSel ? text : muted;
      ctx.font = isSel ? '12px system-ui, sans-serif' : '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(e.year, x, ty - 18);
    });

    // 선택 era의 "앱이 직접 관리하는 비중" 막대
    const e = ERAS[idx];
    const by = 92;
    const bw = W - 80;
    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('일을 누가 하나', 40, by - 10);
    ctx.fillStyle = cssVar('--surface', '#eee');
    ctx.fillRect(40, by, bw, 22);
    ctx.fillStyle = accent;
    ctx.fillRect(40, by, bw * e.appShare, 22);
    ctx.fillStyle = '#fff';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    if (e.appShare > 0.18) ctx.fillText('앱(explicit)', 46, by + 11);
    ctx.fillStyle = text;
    ctx.textAlign = 'right';
    ctx.fillText('드라이버', 40 + bw - 6, by + 11);

    // 제목
    ctx.fillStyle = text;
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${e.year} · ${e.name}`, 40, 145);
  }, [idx]);

  return (
    <figure className="demo">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
        <canvas ref={ref} width={W} height={H} style={{ width: '100%', maxWidth: 560, height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }} />
      </div>

      <ControlPanel>
        <Slider label="시대" value={idx} min={0} max={ERAS.length - 1} step={1} onChange={setIdx} />
        <p style={{ margin: 0, color: 'var(--text)', fontSize: '0.86rem', lineHeight: 1.55 }}>
          {ERAS[idx].desc}
        </p>
      </ControlPanel>

      <figcaption>
        <strong>직접 해보세요:</strong> 슬라이더로 시대를 옮기며 드라이버의 역할이 어떻게 바뀌었는지
        보세요. 셰이더가 생기며 드라이버는 <strong>컴파일러를 품었고</strong>, DX11 시대에 가장
        <strong>두꺼워졌다가</strong>(드로우콜마다 검증·패치), explicit API(DX12/Vulkan) 이후 그 일이
        앱으로 넘어가 다시 <strong>얇아졌습니다</strong>. WDDM(2006)은 메모리·스케줄링을 OS로 끌어올렸고요.
      </figcaption>
    </figure>
  );
}
