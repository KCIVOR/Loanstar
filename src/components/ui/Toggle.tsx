"use client";

import { cn } from "./cn";

/* Meridian §05 toggle — 40×22 pill, teal when on. */
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
    <label className={cn("toggle", label && "w-full justify-between", disabled && "opacity-60")}>
      {label ? <span className="order-first">{label}</span> : null}
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
