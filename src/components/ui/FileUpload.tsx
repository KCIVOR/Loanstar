"use client";

import type { ReactNode } from "react";

import { Badge } from "./Badge";
import { cn } from "./cn";

/* Meridian §17 dropzone — dashed frame, navy icon tile, teal browse hint. */
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
    <label className={cn("dropzone block", disabled && "pointer-events-none opacity-60", className)}>
      <span className="ic" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
      </span>
      <b>
        Drop files here or <em>browse</em>
      </b>
      <span>{hint}</span>
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

/* Meridian §17 file row — type tile, name + meta, status/action on the right. */
export function DocumentRow({
  title,
  status,
  subtitle,
  action,
  fileType,
  className = "",
}: {
  title: string;
  status: keyof typeof statusBadge;
  subtitle?: string;
  action?: ReactNode;
  fileType?: string;
  className?: string;
}) {
  const badge = statusBadge[status];
  const isImage = /jpe?g|png|img/i.test(fileType ?? "");
  return (
    <div className={cn("file-row !max-w-none", className)}>
      <span className={cn("fic", isImage && "img")}>{(fileType ?? "DOC").toUpperCase().slice(0, 3)}</span>
      <div className="fm min-w-0">
        <b className="truncate">{title}</b>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      <div className="sp">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {action}
      </div>
    </div>
  );
}
