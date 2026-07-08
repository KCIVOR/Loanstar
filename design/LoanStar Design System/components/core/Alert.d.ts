import type { ReactNode } from "react";

export interface AlertProps {
  variant?: "success" | "warning" | "error" | "info";
  title?: string;
  children: ReactNode;
}
