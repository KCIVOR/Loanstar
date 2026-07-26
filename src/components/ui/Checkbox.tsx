"use client";

import { cn } from "./cn";

/* Meridian §05 checkbox — teal check on 18px rounded box. */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  "aria-label": ariaLabel,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label; omit for compact cells and pass `aria-label` instead. */
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
}) {
  const inputId =
    id ?? (label ? `chk-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const accessibleName = ariaLabel ?? label;
  if (!accessibleName) {
    throw new Error("Checkbox requires label or aria-label");
  }

  const input = (
    <input
      id={inputId}
      type="checkbox"
      aria-label={label ? undefined : accessibleName}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );

  if (!label) {
    return <span className={cn("check", className)}>{input}</span>;
  }

  return (
    <label htmlFor={inputId} className={cn("check", disabled && "opacity-60", className)}>
      {input}
      <span>
        <b>{label}</b>
        {description ? <span>{description}</span> : null}
      </span>
    </label>
  );
}
