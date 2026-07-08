import type { InputHTMLAttributes, CSSProperties } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  required?: boolean;
  error?: string;
  helper?: string;
  /** Leading slot, e.g. "₱" for currency fields. */
  prefix?: string;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
}

export interface SelectProps {
  label?: string;
  children: React.ReactNode;
  style?: CSSProperties;
  [key: string]: unknown;
}

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange?: (val: boolean) => void;
  disabled?: boolean;
}

export interface ToggleProps {
  checked: boolean;
  onChange?: (val: boolean) => void;
  label?: string;
  sub?: string;
}
