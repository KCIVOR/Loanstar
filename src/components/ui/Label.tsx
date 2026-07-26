import type { LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/* Meridian §05 field label — 13px/600 ink-700; `required` renders the danger asterisk. */
export function Label({
  children,
  required = false,
  className = "",
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode; required?: boolean }) {
  return (
    <label
      className={cn("mb-1.5 block text-[13px] font-semibold text-ink-700", className)}
      {...props}
    >
      {children}
      {required ? <span className="text-danger"> *</span> : null}
    </label>
  );
}
