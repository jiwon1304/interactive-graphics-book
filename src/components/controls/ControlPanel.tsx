import type { ReactNode } from 'react';
import styles from './controls.module.css';

/**
 * 데모 아래에 컨트롤들을 배치하는 반응형 컨테이너.
 * flex-wrap으로 좁은 화면에서 자동 줄바꿈되며, 색은 전역 테마 변수를 따릅니다.
 * <Canvas> 밖(DOM)에서 사용하세요.
 */
interface ControlPanelProps {
  children: ReactNode;
  /** 외부에서 추가 클래스를 붙일 수 있도록 */
  className?: string;
}

export default function ControlPanel({ children, className }: ControlPanelProps) {
  return <div className={`${styles.panel} ${className ?? ''}`.trim()}>{children}</div>;
}
