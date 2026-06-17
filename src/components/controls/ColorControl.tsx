import styles from './controls.module.css';

/**
 * 라벨 + 색상 선택 입력.
 * value는 '#rrggbb' 형식의 16진수 색상.
 * <Canvas> 밖(DOM)에서 사용하세요.
 */
interface ColorControlProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export default function ColorControl({ label, value, onChange }: ColorControlProps) {
  return (
    <label className={styles.control}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.color}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
