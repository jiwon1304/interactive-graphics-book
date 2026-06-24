/**
 * 위젯 4 — 디퍼드 파이프라인 정적 도식(DOM 박스).
 * 1차 패스(지오메트리 → G-buffer MRT) → 2차 패스(라이팅, 화면공간)의 데이터 흐름을
 * 모바일 세로 스택으로 보여준다. 인터랙션 없이 "한 상태"를 그린 정적 figure.
 */
const channelStyle = (bg: string): React.CSSProperties => ({
  flex: '1 1 0',
  minWidth: 0,
  padding: '6px 4px',
  borderRadius: 6,
  background: bg,
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  textAlign: 'center',
  overflowWrap: 'anywhere',
});

const boxStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--surface)',
  padding: 12,
};

const arrow: React.CSSProperties = {
  textAlign: 'center',
  color: 'var(--muted)',
  fontSize: 20,
  lineHeight: 1,
  margin: '2px 0',
};

export default function PipelineDiagram() {
  return (
    <figure className="demo">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          maxWidth: 380,
          margin: '0 auto',
          fontFamily: 'system-ui, sans-serif',
          color: 'var(--text)',
        }}
      >
        <div style={boxStyle}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>1차 패스 — 지오메트리</div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>
            모든 오브젝트를 한 번 래스터화. 조명 계산은 없음.
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <div style={channelStyle('#c0563f')}>albedo</div>
            <div style={channelStyle('#3f72c0')}>normal</div>
            <div style={channelStyle('#4f9d5f')}>depth</div>
            <div style={channelStyle('#9d7f3f')}>material</div>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 6, textAlign: 'center' }}>
            G-buffer (MRT, 화면 해상도 × 여러 채널)
          </div>
        </div>

        <div style={arrow}>↓</div>

        <div style={boxStyle}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>2차 패스 — 라이팅 (화면공간)</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            화면을 덮는 사각형 위에서 각 픽셀의 G-buffer 값을 읽어, 광원 N개를 더한다. 지오메트리는
            다시 그리지 않음.
          </div>
          <div
            style={{
              marginTop: 8,
              padding: '6px 8px',
              borderRadius: 6,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            for 픽셀: for 광원 N → 색 누적
          </div>
        </div>

        <div style={arrow}>↓</div>

        <div style={{ ...boxStyle, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>
          최종 프레임
        </div>
      </div>
      <figcaption>
        디퍼드의 두 패스. 1차 패스는 지오메트리를 한 번 훑어 화면 픽셀마다 albedo·normal·depth·
        material을 G-buffer(여러 render target)에 기록합니다 — 여기엔 조명이 전혀 없습니다. 2차
        패스는 화면을 덮는 사각형 하나를 그리며 픽셀마다 G-buffer를 읽고 광원들을 더합니다. 조명이
        오브젝트가 아니라 <strong>화면 픽셀</strong> 단위로 풀린다는 것이 핵심입니다.
      </figcaption>
    </figure>
  );
}
