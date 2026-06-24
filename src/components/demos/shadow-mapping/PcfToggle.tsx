import { useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider, SelectControl, type SelectOption } from '../../controls';
import ShadowConfig, { type ShadowKind } from './ShadowConfig';
import ShadowScene from './ShadowScene';

const KIND_OPTIONS: ReadonlyArray<SelectOption<ShadowKind>> = [
  { value: 'hard', label: 'Hard (단일 비교)' },
  { value: 'soft', label: 'PCF Soft (이웃 평균)' },
];

// mapSize는 2의 거듭제곱으로 스냅
const SIZES = [256, 512, 1024, 2048];

export default function PcfToggle() {
  const [kind, setKind] = useState<ShadowKind>('soft');
  const [sizeIdx, setSizeIdx] = useState(1); // 512
  const mapSize = SIZES[sizeIdx];

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[4, 3, 5]}>
        <ShadowConfig kind={kind} />
        <ShadowScene bias={-0.0006} normalBias={0.02} mapSize={mapSize} lightAngle={25} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>
      <ControlPanel>
        <SelectControl label="필터링" value={kind} options={KIND_OPTIONS} onChange={setKind} />
        <Slider
          label="depth map 해상도"
          value={sizeIdx}
          min={0}
          max={SIZES.length - 1}
          step={1}
          onChange={(v) => setSizeIdx(Math.round(v))}
          format={() => `${mapSize}×${mapSize}`}
        />
      </ControlPanel>
      <figcaption>
        Hard는 그림자 경계에서 한 점만 비교해 계단처럼 들쭉날쭉하다(특히 해상도가 낮을 때).
        PCF Soft는 경계 주변 여러 texel을 비교해 그림자에 든 비율을 평균하므로 경계가 부드럽다.
        해상도를 256으로 낮추면 그림자가 거칠어지고, 2048로 올리면 선명해지지만 메모리·대역폭을 더 쓴다.
        같은 해상도에서 Hard↔Soft를 토글해 경계의 차이를 직접 비교해 보세요.
      </figcaption>
    </figure>
  );
}
