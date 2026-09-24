"use client";

import { useEffect, useRef, useState } from "react";

import { Alert, Badge, Button, Spinner } from "@/components/ui";

/**
 * Docx-format sibling of TemplateEditor.tsx — the "Upload a Word file as
 * template" flow. There's no WYSIWYG surface here: the source of truth is
 * the actual uploaded .docx (with {{field}} / {{#field}}...{{/field}} tags
 * inserted directly in Word), not an editable HTML body, so "editing" means
 * re-uploading a new file rather than typing in a browser editor. Uploading
 * saves the draft in one step (the upload route both stores the file and
 * upserts the draft row) — there's no separate Save action.
 */
export function DocxTemplateEditor({
  templateId,
  currentVersionId,
  currentVersionNo,
  onUploaded,
}: {
  templateId: string;
  /** The draft or published version currently shown, if any (null for a
   * brand-new template with no docx uploaded yet). */
  currentVersionId: string | null;
  currentVersionNo: number | null;
  onUploaded: () => void | Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loadingDownloadUrl, setLoadingDownloadUrl] = useState(false);

  useEffect(() => {
    setDownloadUrl(null);
  }, [currentVersionId]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFileChosen(file: File) {
    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/document-templates/${templateId}/docx-draft`, {
        method: "PUT",
        body: form,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Upload failed");
      }
      setUploadMessage("Draft saved from uploaded file");
      await onUploaded();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function runPreview() {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/admin/document-templates/${templateId}/docx-preview`, {
        method: "POST",
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Preview failed");
      }
      const blob = await res.blob();
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function loadDownloadUrl() {
    setLoadingDownloadUrl(true);
    try {
      const url = currentVersionId
        ? `/api/admin/document-templates/${templateId}/docx-download?versionId=${currentVersionId}`
        : `/api/admin/document-templates/${templateId}/docx-download`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as { signedUrl: string };
      setDownloadUrl(data.signedUrl);
    } finally {
      setLoadingDownloadUrl(false);
    }
  }

  return (
    <div className="doc-template-editor flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <Badge variant="neutral">.docx template</Badge>
          {currentVersionNo ? (
            <span>
              Current file: <span className="mono">v{currentVersionNo}</span>
            </span>
          ) : (
            <span>No file uploaded yet</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentVersionId ? (
            downloadUrl ? (
              <a
                href={downloadUrl}
                download
                className="text-sm text-accent underline underline-offset-2"
              >
                Download current .docx
              </a>
            ) : (
              <Button
                variant="ghost"
                onClick={() => void loadDownloadUrl()}
                loading={loadingDownloadUrl}
              >
                Get download link
              </Button>
            )
          ) : null}
          {currentVersionId ? (
            <Button variant="ghost" onClick={() => void runPreview()} loading={previewing}>
              Preview PDF
            </Button>
          ) : null}
          <Button
            onClick={() => fileInputRef.current?.click()}
            loading={uploading}
          >
            {currentVersionId ? "Upload replacement" : "Upload .docx"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileChosen(file);
            }}
          />
        </div>
      </div>

      <p className="text-xs text-ink-500">
        Insert <span className="mono">{"{{fieldName}}"}</span> tags directly in the
        Word document, then upload it here. For a repeated section (like a list of
        vehicles) or a conditional section, wrap it in{" "}
        <span className="mono">{"{{#fieldName}}...{{/fieldName}}"}</span> using the
        same field name on both the opening and closing tag — it repeats once per
        item for a list field, or shows once if the field is a plain non-empty
        value. Uploading saves it as the working draft — publish separately once the
        preview looks right.
      </p>

      {uploadError ? <Alert>{uploadError}</Alert> : null}
      {uploadMessage ? <Alert variant="success">{uploadMessage}</Alert> : null}
      {previewError ? <p className="text-sm text-danger-600">{previewError}</p> : null}
      {previewing ? (
        <div className="flex items-center gap-2 text-sm text-ink-400">
          <Spinner size="sm" /> Rendering preview…
        </div>
      ) : null}
      {previewUrl ? (
        <object
          data={previewUrl}
          type="application/pdf"
          className="h-[600px] w-full rounded-lg border border-line"
          aria-label="PDF preview"
        >
          <a href={previewUrl} target="_blank" rel="noreferrer">
            Open preview PDF
          </a>
        </object>
      ) : null}
    </div>
  );
}
