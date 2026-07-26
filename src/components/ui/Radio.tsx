"use client";

import { cn } from "./cn";

/* Meridian §05 radio — teal ring when selected. */
export function Radio({
  name,
  value,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}) {
  const inputId = id ?? `radio-${name}-${value}`;
  return (
    <label htmlFor={inputId} className={cn("radio", disabled && "opacity-60")}>
      <input
        id={inputId}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <span>
        <b>{label}</b>
        {description ? <span>{description}</span> : null}
      </span>
    </label>
  );
}
