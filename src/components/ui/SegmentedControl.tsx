import { cn } from "./cn";

/* Meridian §04 button group — segmented filter. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="btn-group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn("btn btn-sm", value === opt.value && "is-active")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
