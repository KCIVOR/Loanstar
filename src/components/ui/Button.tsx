import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

const variants = {
  primary:
    "bg-gradient-to-br from-gold-300 to-gold-400 text-navy-900 shadow-[0_4px_14px_rgba(217,168,85,0.3)] hover:from-gold-300 hover:to-gold-300",
  secondary:
    "border border-gold-400/40 bg-gold-400/10 text-gold-600 hover:bg-gold-400/16",
  outline:
    "border border-neutral-300 bg-transparent text-ink hover:bg-neutral-50",
  ghost: "text-ink-muted hover:bg-neutral-100",
  danger: "bg-danger text-white hover:opacity-90",
  success: "bg-success text-white hover:opacity-90",
} as const;

const sizes = {
  sm: "h-8 rounded-md px-3.5 text-xs",
  md: "h-10 rounded-lg px-5 text-sm",
  lg: "h-12 rounded-lg px-7 text-[15px]",
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  children?: ReactNode;
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-bold tracking-[0.01em] transition-all duration-150",
        "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none disabled:hover:bg-neutral-100",
        sizes[size],
        variants[variant],
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-navy-900/35 border-t-navy-900" />
      ) : null}
      {children}
    </button>
  );
}
