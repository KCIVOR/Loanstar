"use client";

import { cn } from "./cn";

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 text-sm",
        label ? "w-full justify-between" : "",
        checked ? "text-ink" : "text-ink-faint",
        disabled && "opacity-50"
      )}
    >
      {label ? <span>{label}</span> : null}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-block h-[18px] w-8 shrink-0 rounded-full transition-colors",
          "disabled:cursor-not-allowed",
          checked ? "bg-gold-400" : "bg-[#E4E7EF]"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all",
            checked ? "right-0.5" : "left-0.5"
          )}
        />
      </button>
    </div>
  );
}
