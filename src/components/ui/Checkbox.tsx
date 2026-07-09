"use client";

import { cn } from "./cn";

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  const inputId = id ?? `chk-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 text-sm text-ink",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <input
        id={inputId}
        type="checkbox"
        className="h-4 w-4 rounded border-neutral-300 accent-gold-400 text-gold-400 focus:ring-gold-400/30"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
