import { useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import DemoCanvas from '../../DemoCanvas';
import { ControlPanel, Slider } from '../../controls';
import ShadowConfig from './ShadowConfig';
import ShadowScene from './ShadowScene';

export default function BiasSlider() {
  const [bias, setBias] = useState(-0.0004);
  const [lightAngle, setLightAngle] = useState(25);

  return (
    <figure className="demo">
      <DemoCanvas lights={false} cameraPosition={[4, 3, 5]}>
        <ShadowConfig kind="hard" />
        <ShadowScene bias={bias} mapSize={1024} lightAngle={lightAngle} />
        <OrbitControls enablePan={false} makeDefault />
      </DemoCanvas>
      <ControlPanel>
        <Slider
          label="shadow bias"
          value={bias}
          min={-0.005}
          max={0.005}
          step={0.0001}
          onChange={setBias}
          format={(v) => v.toFixed(4)}
        />
        <Slider label="광원 방위" value={lightAngle} min={-80} max={80} step={1} onChange={setLightAngle} unit="°" />
      </ControlPanel>
      <figcaption>
        bias를 0 근처로 두면 표면 곳곳에 줄무늬 그림자(shadow acne)가 낀다 — depth map 해상도가 유한해
        표면이 자기 자신을 그림자로 오판하기 때문이다. bias를 양으로 키우면 acne는 사라지지만, 너무
        키우면 그림자가 물체에서 떨어져 떠 보인다(peter-panning) — 발밑 접지선이 벌어지는 것을 보라.
        광원을 비스듬하게 할수록 acne가 심해져 더 큰 bias가 필요하다. 절대 정답은 없고 손으로 맞춘다.
      </figcaption>
    </figure>
  );
}
