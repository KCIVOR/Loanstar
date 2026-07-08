import type { ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export interface ToastProps {
  message: string;
  variant?: "default" | "warning";
}

export interface ProgressBarProps {
  label: string;
  value: number;
  total?: number;
  color?: string;
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export interface SkeletonProps {
  width?: number | string;
  height?: number;
}
