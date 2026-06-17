import styles from './controls.module.css';

/**
 * 라벨 + 실시간 값 표시 + range 입력.
 * <Canvas> 밖(DOM)에서 사용하세요.
 */
interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** 기본 0.01 */
  step?: number;
  onChange: (value: number) => void;
  /** 값 뒤에 붙는 단위 (예: '°', 'x') */
  unit?: string;
  /** 표시 형식을 직접 지정 (지정 시 unit보다 우선) */
  format?: (value: number) => string;
}

export default function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  unit = '',
  format,
}: SliderProps) {
  const readout = format ? format(value) : `${value}${unit}`;
  return (
    <label className={styles.control}>
      <span className={styles.label}>
        {label}
        <span className={styles.value}>{readout}</span>
      </span>
      <input
        className={styles.range}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
