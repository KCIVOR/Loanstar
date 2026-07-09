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
    <div className="inline-flex overflow-hidden rounded-full border border-neutral-300 text-xs font-semibold">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`px-3.5 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            value === opt.value
              ? "bg-gold-400 text-navy-900"
              : "bg-white text-ink-faint hover:text-ink-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
