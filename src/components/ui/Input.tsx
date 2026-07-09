import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

const field =
  "h-10 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-gold-400 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-gold-400/20 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:bg-neutral-100 disabled:text-neutral-400";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "bg-[#FBFBFD] focus:bg-white", className)} {...props} />;
}
