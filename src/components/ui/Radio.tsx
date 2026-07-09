"use client";

import { cn } from "./cn";

export function Radio({
  name,
  value,
  checked,
  onChange,
  label,
  disabled = false,
  id,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  const inputId = id ?? `radio-${name}-${value}`;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 text-sm",
        checked ? "text-ink" : "text-ink-faint",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white",
          checked
            ? "border-[4.5px] border-gold-400"
            : "border-[1.5px] border-neutral-300"
        )}
        aria-hidden
      />
      <input
        id={inputId}
        type="radio"
        name={name}
        value={value}
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      {label}
    </label>
  );
}
