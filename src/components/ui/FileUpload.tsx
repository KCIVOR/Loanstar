"use client";

import { Badge } from "./Badge";

export function FileDropzone({
  hint = "PDF, JPG, PNG, DOC up to 10MB",
  onFiles,
}: {
  hint?: string;
  onFiles?: (files: FileList) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center hover:border-gold-400/50">
      <span className="text-sm font-semibold text-ink">Drop file or click to upload</span>
      <span className="mt-1 text-xs text-ink-faint">{hint}</span>
      <input
        type="file"
        className="sr-only"
        onChange={(e) => e.target.files && onFiles?.(e.target.files)}
      />
    </label>
  );
}

export function DocumentRow({
  title,
  status,
}: {
  title: string;
  status: "confirmed" | "uploaded" | "missing";
}) {
  const variant =
    status === "confirmed" ? "success" : status === "uploaded" ? "info" : "neutral";
  const label =
    status === "confirmed" ? "Confirmed" : status === "uploaded" ? "Uploaded" : "Upload";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <span className="text-sm text-ink">{title}</span>
      <Badge variant={variant}>{label}</Badge>
    </div>
  );
}
