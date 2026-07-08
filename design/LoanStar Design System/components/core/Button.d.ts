import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** Visual style. One primary CTA per view; secondary for alternatives; ghost for cancel/tertiary. */
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  /** Shows inline spinner and disables interaction. */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}
