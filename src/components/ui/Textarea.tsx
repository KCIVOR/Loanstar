import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export function Textarea({
  className = "",
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "w-full rounded-lg border border-neutral-300 bg-[#FBFBFD] px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-gold-400 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-gold-400/20 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:bg-neutral-100 disabled:text-neutral-400",
        className
      )}
      {...props}
    />
  );
}
