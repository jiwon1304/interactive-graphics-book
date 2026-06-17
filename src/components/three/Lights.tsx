/**
 * 데모 공용 조명 세트.
 * 매 데모마다 ambient + directional을 반복하지 않도록 표준 3점 조명(주광/보조광)을 묶었습니다.
 * 반드시 <Canvas> 내부에서 사용하세요.
 */
interface StandardLightsProps {
  /** 전체 밝기 배율 (모든 조명 강도에 곱해짐) */
  intensity?: number;
}

export default function StandardLights({ intensity = 1 }: StandardLightsProps) {
  return (
    <>
      {/* 전역 환경광: 그림자 영역이 완전히 검게 죽지 않도록 */}
      <ambientLight intensity={0.6 * intensity} />
      {/* 주광(key): 형태와 음영을 만드는 메인 조명 */}
      <directionalLight position={[5, 5, 5]} intensity={1.2 * intensity} />
      {/* 보조광(fill): 반대편에서 약하게 비춰 대비를 완화 */}
      <directionalLight position={[-4, 2, -3]} intensity={0.4 * intensity} />
    </>
  );
}
