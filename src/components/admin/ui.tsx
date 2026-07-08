import type { ReactNode } from "react";

export { Badge } from "./Badge";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.5px] text-neutral-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  variant = "base",
  className = "",
}: {
  children: ReactNode;
  variant?: "base" | "highlight" | "warning" | "danger" | "gradient";
  className?: string;
}) {
  const variants: Record<string, string> = {
    base: "bg-white border border-neutral-200 shadow-sm",
    highlight: "bg-primary-50 border border-primary-200 border-l-4 border-l-primary-600",
    warning: "bg-warning-50 border border-warning-200 border-l-4 border-l-warning-600",
    danger: "bg-danger-50 border border-danger-200 border-l-4 border-l-danger-600",
    gradient: "bg-gradient-to-br from-primary-900 to-primary-600 text-white",
  };
  return (
    <div
      className={`rounded-md p-6 ${variants[variant] ?? variants.base} ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  const variants: Record<string, string> = {
    primary: "bg-primary-600 text-white hover:bg-primary-700",
    secondary: "bg-primary-50 text-primary-600 hover:bg-primary-100",
    outline: "border border-primary-600 text-primary-600 hover:bg-primary-50",
    ghost: "text-neutral-500 hover:bg-neutral-100",
    danger: "bg-danger-600 text-white hover:bg-danger-700",
    success: "bg-success-600 text-white hover:bg-success-700",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3.5 text-xs",
    md: "h-10 px-5 text-sm",
    lg: "h-12 px-7 text-[15px]",
  };
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded-sm font-semibold tracking-[0.01em] transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-300 disabled:hover:bg-neutral-100 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />
      ) : null}
      {children}
    </button>
  );
}

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-10 w-full rounded-sm border border-neutral-300 bg-white px-3.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-600 focus:outline-none focus:ring-[3px] focus:ring-primary-600/10 ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-10 w-full rounded-sm border border-neutral-300 bg-white px-3.5 text-sm text-neutral-900 focus:border-primary-600 focus:outline-none focus:ring-[3px] focus:ring-primary-600/10 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-sm border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-600 focus:outline-none focus:ring-[3px] focus:ring-primary-600/10 ${className}`}
      rows={3}
      {...props}
    />
  );
}

export function Label({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[13px] font-medium text-neutral-700"
    >
      {children}
    </label>
  );
}

export function Alert({
  children,
  variant = "error",
}: {
  children: ReactNode;
  variant?: "error" | "success" | "warning" | "info";
}) {
  const styles: Record<string, { bg: string; border: string; dot: string; text: string }> = {
    success: { bg: "bg-success-50", border: "border-success-200", dot: "bg-[#065F46]", text: "text-success-700" },
    warning: { bg: "bg-warning-50", border: "border-warning-200", dot: "bg-[#92400E]", text: "text-warning-700" },
    error: { bg: "bg-danger-50", border: "border-danger-200", dot: "bg-[#991B1B]", text: "text-danger-600" },
    info: { bg: "bg-info-50", border: "border-info-200", dot: "bg-[#0C4A6E]", text: "text-info-700" },
  };
  const v = styles[variant] ?? styles.error;
  return (
    <div className={`flex items-start gap-3 rounded-md border px-4 py-3.5 ${v.bg} ${v.border}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${v.dot}`} />
      <div className={`text-[13px] leading-relaxed ${v.text}`}>{children}</div>
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10">
      <div className="w-full max-w-lg rounded-lg border border-neutral-200 bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm px-2 py-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  loading = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
        {message ? (
          <p className="mt-2 text-sm text-neutral-600">{message}</p>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2.5 py-12 text-sm text-neutral-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary-100 border-t-primary-600" />
      Loading…
    </div>
  );
}

export function Table({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
      <table className="min-w-full divide-y divide-neutral-100 text-sm">
        {children}
      </table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="bg-neutral-50 px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-neutral-500">
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={`border-b border-neutral-50 px-4 py-3 text-neutral-700 ${className}`}>
      {children}
    </td>
  );
}
