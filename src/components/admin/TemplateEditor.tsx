"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  Button,
  SegmentedControl,
  Spinner,
  Textarea,
} from "@/components/ui";
import {
  FIELD_COLLECTIONS,
  FIELD_FLAGS,
  FIELD_GROUPS,
} from "@/lib/documents/templates/fields";

type Mode = "visual" | "source";

/** Editor-only chips are stored as bare `<span data-merge>` — strip the
 *  contenteditable attribute so it never reaches the stored/rendered body. */
function cleanBody(html: string): string {
  return html.replace(/\scontenteditable="[^"]*"/gi, "");
}

function chipHtml(key: string): string {
  return `<span class="merge-chip" data-merge="${key}" contenteditable="false">{{${key}}}</span>&nbsp;`;
}

function repeatTableHtml(collectionKey: string, fieldKeys: string[]): string {
  const headCells = fieldKeys.map((k) => `<th>${k}</th>`).join("");
  const bodyCells = fieldKeys.map((k) => `<td>{{${k}}}</td>`).join("");
  return (
    `<table><tbody>` +
    `<tr>${headCells}</tr>` +
    `<tr data-repeat="${collectionKey}">${bodyCells}</tr>` +
    `</tbody></table><p></p>`
  );
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

  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastSelection = useRef<Range | null>(null);

  // Seed the visual editor once on mount.
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = initialBody;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Read the current body from whichever surface is active. */
  const readBody = useCallback((): string => {
    if (mode === "source") return cleanBody(source);
    return cleanBody(editorRef.current?.innerHTML ?? "");
  }, [mode, source]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === "source") {
      setSource(cleanBody(editorRef.current?.innerHTML ?? ""));
    } else if (editorRef.current) {
      editorRef.current.innerHTML = source;
    }
    setMode(next);
  }

  function rememberSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      lastSelection.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && lastSelection.current) {
      sel.removeAllRanges();
      sel.addRange(lastSelection.current);
    }
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function formatBlock(tag: string) {
    exec("formatBlock", tag);
  }

  function insertHtmlAtCursor(html: string) {
    if (mode === "source") {
      setSource((prev) => prev + html);
      return;
    }
    restoreSelection();
    document.execCommand("insertHTML", false, html);
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
        const msg = await res.json().catch(() => ({}));
        throw new Error((msg as { error?: string }).error ?? "Preview failed");
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

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="doc-template-editor grid gap-4 lg:grid-cols-[1fr_320px]">
      <style>{`
        .doc-template-editor .merge-chip {
          background: var(--accent-soft, #e1e7ec);
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 4px;
          padding: 0 4px;
          font-size: 0.85em;
          font-family: ui-monospace, monospace;
          white-space: nowrap;
          user-select: all;
        }
        .doc-template-editor .visual-surface { min-height: 460px; }
        .doc-template-editor .visual-surface :is(table){border-collapse:collapse;width:100%;}
        .doc-template-editor .visual-surface :is(th,td){border:1px solid #d5d5d5;padding:4px 6px;font-size:13px;text-align:left;}
        .doc-template-editor .visual-surface :is(h1){font-size:20px;font-weight:600;margin:8px 0;}
        .doc-template-editor .visual-surface :is(h2){font-size:16px;font-weight:600;margin:8px 0;}
        .doc-template-editor .visual-surface [data-repeat]{outline:1px dashed #9aa5b1;}
      `}</style>

      <div className="flex flex-col gap-3">
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
            <Button variant="ghost" onClick={() => void runPreview()} loading={previewing}>
              Preview PDF
            </Button>
            <Button onClick={() => void onSaveDraft(readBody())} loading={saving}>
              Save draft
            </Button>
          </div>
        </div>

        {mode === "visual" ? (
          <>
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface-2 p-1.5">
              <ToolButton label="B" title="Bold" onClick={() => exec("bold")} bold />
              <ToolButton label="I" title="Italic" onClick={() => exec("italic")} italic />
              <ToolButton label="U" title="Underline" onClick={() => exec("underline")} underline />
              <Divider />
              <ToolButton label="H1" title="Heading 1" onClick={() => formatBlock("h1")} />
              <ToolButton label="H2" title="Heading 2" onClick={() => formatBlock("h2")} />
              <ToolButton label="¶" title="Paragraph" onClick={() => formatBlock("p")} />
              <Divider />
              <ToolButton label="• List" title="Bullet list" onClick={() => exec("insertUnorderedList")} />
              <ToolButton label="1. List" title="Numbered list" onClick={() => exec("insertOrderedList")} />
              <Divider />
              <ToolButton label="⟸" title="Align left" onClick={() => exec("justifyLeft")} />
              <ToolButton label="⟺" title="Align center" onClick={() => exec("justifyCenter")} />
              <ToolButton label="⟹" title="Align right" onClick={() => exec("justifyRight")} />
            </div>
            <div
              ref={editorRef}
              className="visual-surface rounded-lg border border-line bg-white p-4 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent/40"
              contentEditable
              suppressContentEditableWarning
              onMouseUp={rememberSelection}
              onKeyUp={rememberSelection}
              role="textbox"
              aria-multiline
              aria-label="Template body (visual editor)"
            />
          </>
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

      {/* Field palette */}
      <aside className="flex flex-col gap-4 rounded-lg border border-line bg-surface-2 p-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Insert field
          </p>
          <p className="mt-1 text-xs text-ink-400">
            Click to insert a merge field at the cursor. Fields are filled when
            the document is generated.
          </p>
        </div>
        {FIELD_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 text-xs font-semibold text-ink-700">{group.label}</p>
            <div className="flex flex-wrap gap-1">
              {group.fields.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  title={field.key}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertHtmlAtCursor(chipHtml(field.key))}
                  className="rounded border border-line bg-white px-1.5 py-0.5 text-xs text-ink-700 hover:border-accent hover:text-accent"
                >
                  {field.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div>
          <p className="mb-1 text-xs font-semibold text-ink-700">Repeating tables</p>
          <div className="flex flex-col gap-1">
            {FIELD_COLLECTIONS.map((col) => (
              <button
                key={col.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  insertHtmlAtCursor(
                    repeatTableHtml(col.key, col.fields.map((f) => f.key)),
                  )
                }
                className="rounded border border-line bg-white px-2 py-1 text-left text-xs text-ink-700 hover:border-accent hover:text-accent"
              >
                {col.label} table
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold text-ink-700">Conditionals</p>
          <div className="flex flex-wrap gap-1">
            {FIELD_FLAGS.map((flag) => (
              <button
                key={flag.key}
                type="button"
                title={`Show only when ${flag.key} is true`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  insertHtmlAtCursor(
                    `<span data-if="${flag.key}">shown when ${flag.label}</span>`,
                  )
                }
                className="rounded border border-line bg-white px-1.5 py-0.5 text-xs text-ink-700 hover:border-accent hover:text-accent"
              >
                if {flag.label}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function ToolButton({
  label,
  title,
  onClick,
  bold,
  italic,
  underline,
}: {
  label: string;
  title: string;
  onClick: () => void;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="min-w-[28px] rounded px-2 py-1 text-xs text-ink-700 hover:bg-white"
      style={{
        fontWeight: bold ? 700 : undefined,
        fontStyle: italic ? "italic" : undefined,
        textDecoration: underline ? "underline" : undefined,
      }}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-line" aria-hidden />;
}
