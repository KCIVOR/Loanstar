"use client";

import type { ReactNode } from "react";

import { Badge } from "./Badge";
import { cn } from "./cn";

export function FileDropzone({
  hint = "PDF, JPG, PNG, DOC up to 10MB",
  accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx",
  disabled = false,
  onFiles,
  className = "",
}: {
  hint?: string;
  accept?: string;
  disabled?: boolean;
  onFiles?: (files: FileList) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center transition-colors hover:border-gold-400/50",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      <span className="text-sm font-semibold text-ink">Drop file or click to upload</span>
      <span className="mt-1 text-xs text-ink-faint">{hint}</span>
      <input
        type="file"
        className="sr-only"
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files?.length) onFiles?.(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

const statusBadge: Record<
  "confirmed" | "uploaded" | "missing" | "required" | "optional" | "complete" | "incomplete",
  { variant: "success" | "info" | "neutral" | "warning" | "danger"; label: string }
> = {
  confirmed: { variant: "success", label: "Confirmed" },
  uploaded: { variant: "info", label: "Uploaded" },
  missing: { variant: "neutral", label: "Upload" },
  required: { variant: "warning", label: "Required" },
  optional: { variant: "neutral", label: "Optional" },
  complete: { variant: "success", label: "Complete" },
  incomplete: { variant: "danger", label: "Incomplete" },
};

export function DocumentRow({
  title,
  status,
  subtitle,
  action,
  className = "",
}: {
  title: string;
  status: keyof typeof statusBadge;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  const badge = statusBadge[status];
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3",
        className
      )}
    >
      <div className="min-w-0">
        <span className="text-sm font-medium text-ink">{title}</span>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-ink-faint">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {action}
      </div>
    </div>
  );
}
