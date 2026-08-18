import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/* Meridian §04 — navy for the primary path, teal for the money moment.
   Legacy keys kept for compatibility: success → accent (approve/release). */
const variants = {
  primary: "btn-primary",
  accent: "btn-accent",
  secondary: "btn-secondary",
  outline: "btn-outline",
  ghost: "btn-ghost",
  "ghost-inv": "btn-ghost-inv",
  danger: "btn-danger",
  "danger-soft": "btn-danger-soft",
  success: "btn-accent",
} as const;

const sizes = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  block?: boolean;
  children?: ReactNode;
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  block = false,
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
      className={cn("btn", variants[variant], sizes[size], block && "btn-block", className)}
      {...props}
    >
      {loading ? (
        <span
          className="spinner"
          style={{ width: 14, height: 14, borderWidth: 2, borderColor: "currentColor", borderTopColor: "transparent", opacity: 0.7 }}
        />
      ) : null}
      {children}
    </button>
  );
}
