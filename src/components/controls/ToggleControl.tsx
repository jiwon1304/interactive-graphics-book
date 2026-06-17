import styles from './controls.module.css';

/**
 * 라벨 + 체크박스(켜기/끄기) 스위치.
 * <Canvas> 밖(DOM)에서 사용하세요.
 */
interface ToggleControlProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function ToggleControl({ label, checked, onChange }: ToggleControlProps) {
  return (
    <label className={`${styles.control} ${styles.toggle}`}>
      <input
        className={styles.checkbox}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
