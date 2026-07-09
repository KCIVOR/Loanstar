"use client";

import { cn } from "./cn";

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  id,
  "aria-label": ariaLabel,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label; omit for compact cells and pass `aria-label` instead. */
  label?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
}) {
  const inputId =
    id ??
    (label
      ? `chk-${label.replace(/\s+/g, "-").toLowerCase()}`
      : undefined);
  const accessibleName = ariaLabel ?? label;
  if (!accessibleName) {
    throw new Error("Checkbox requires label or aria-label");
  }

  const input = (
    <input
      id={inputId}
      type="checkbox"
      aria-label={label ? undefined : accessibleName}
      className="h-4 w-4 rounded border-neutral-300 accent-gold-400 text-gold-400 focus:ring-gold-400/30"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );

  if (!label) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center",
          disabled && "opacity-50",
          className
        )}
      >
        {input}
      </span>
    );
  }

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 text-sm text-ink",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      {input}
      {label}
    </label>
  );
}
