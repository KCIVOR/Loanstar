"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, SegmentedControl, Spinner, Textarea } from "@/components/ui";

import {
  TiptapEditor,
  type TiptapEditorHandle,
} from "./template-editor/TiptapEditor";

type Mode = "visual" | "source";

/** Belt-and-braces: the old contentEditable stored a `contenteditable` attr on
 *  chips; keep stripping it so nothing stale ever reaches a saved body. */
function cleanBody(html: string): string {
  return html.replace(/\scontenteditable="[^"]*"/gi, "");
}

export function TemplateEditor({
  initialBody,
  onSaveDraft,
  saving,
}: {
  initialBody: string;
  onSaveDraft: (body: string) => void | Promise<void>;
  saving: boolean;
}) {
  const [mode, setMode] = useState<Mode>("visual");
  const [source, setSource] = useState(initialBody);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const tiptapRef = useRef<TiptapEditorHandle | null>(null);

  /** Current body from whichever surface is active. `source` is the store of
   *  record; the Tiptap surface is seeded from it and read back on demand. */
  const readBody = useCallback((): string => {
    if (mode === "visual" && tiptapRef.current) {
      return cleanBody(tiptapRef.current.getHTML());
    }
    return cleanBody(source);
  }, [mode, source]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (mode === "visual" && tiptapRef.current) {
      // leaving the visual surface — capture its HTML into the store.
      setSource(cleanBody(tiptapRef.current.getHTML()));
    }
    setMode(next);
  }

  async function runPreview() {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/admin/document-templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: readBody() }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(msg.error ?? "Preview failed");
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

  const [downloadingDocx, setDownloadingDocx] = useState(false);
  async function downloadDocx() {
    setDownloadingDocx(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/admin/document-templates/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: readBody() }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(msg.error ?? "DOCX export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "template.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "DOCX export failed");
    } finally {
      setDownloadingDocx(false);
    }
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="doc-template-editor flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          value={mode}
          onChange={(v) => switchMode(v as Mode)}
          options={[
            { value: "visual", label: "Visual" },
            { value: "source", label: "HTML source" },
          ]}
        />
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => void downloadDocx()} loading={downloadingDocx}>
            Download .docx
          </Button>
          <Button variant="ghost" onClick={() => void runPreview()} loading={previewing}>
            Preview PDF
          </Button>
          <Button onClick={() => void onSaveDraft(readBody())} loading={saving}>
            Save draft
          </Button>
        </div>
      </div>

      {mode === "visual" ? (
        <TiptapEditor ref={tiptapRef} initialBody={source} />
      ) : (
        <Textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="min-h-[480px] font-mono text-xs"
          spellCheck={false}
          aria-label="Template body (HTML source)"
        />
      )}

      {previewError ? (
        <p className="text-sm text-danger-600">{previewError}</p>
      ) : null}
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
