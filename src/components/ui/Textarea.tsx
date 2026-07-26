import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

/* Meridian §05 textarea. */
export function Textarea({
  className = "",
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn("textarea", className)} {...props} />;
}
