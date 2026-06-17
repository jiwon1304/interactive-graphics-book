import styles from './controls.module.css';

/**
 * 라벨 + 드롭다운 선택.
 * 제네릭 T로 value 타입을 좁혀 onChange가 정확한 유니온 타입을 받습니다.
 * <Canvas> 밖(DOM)에서 사용하세요.
 */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectControlProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
}

export default function SelectControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectControlProps<T>) {
  return (
    <label className={styles.control}>
      <span className={styles.label}>{label}</span>
      <select
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
