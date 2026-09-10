"use client";

import { forwardRef, useImperativeHandle } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";

import { PRINT_CSS } from "@/lib/documents/render/print-styles";
import {
  FIELD_COLLECTIONS,
  FIELD_FLAGS,
  FIELD_GROUPS,
} from "@/lib/documents/templates/fields";

import { templateExtensions } from "./extensions";

export type TiptapEditorHandle = { getHTML: () => string };

const ALIGN_TYPES = ["heading", "paragraph"] as const;

function setAlign(editor: Editor, value: "left" | "center" | "right") {
  let chain = editor.chain().focus();
  for (const t of ALIGN_TYPES) {
    chain = chain.updateAttributes(t, { dataAlign: value === "left" ? null : value });
  }
  chain.run();
}

/** A toolbar button. */
function TB({
  on,
  active,
  disabled,
  label,
  title,
}: {
  on: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      disabled={disabled}
      className={`min-w-[30px] rounded px-2 py-1 text-xs ${
        active ? "bg-accent/15 text-accent" : "text-ink-700 hover:bg-white"
      } disabled:opacity-40`}
    >
      {label}
    </button>
  );
}

export const TiptapEditor = forwardRef<TiptapEditorHandle, { initialBody: string }>(
  function TiptapEditor({ initialBody }, ref) {
    const editor = useEditor({
      extensions: templateExtensions(),
      content: initialBody,
      editorProps: {
        attributes: {
          class: "tiptap-doc-surface focus:outline-none",
        },
      },
      immediatelyRender: false,
    });

    useImperativeHandle(ref, () => ({
      getHTML: () => editor?.getHTML() ?? initialBody,
    }));

    if (!editor) {
      return <div className="min-h-[460px] rounded-lg border border-line bg-white" />;
    }

    const insert = (html: string) =>
      editor.chain().focus().insertContent(html).run();

    return (
      <div className="flex flex-col gap-2">
        <style>{`
          .tiptap-doc-surface { min-height: 460px; padding: 1rem; }
          .tiptap-doc-surface [data-repeat] { outline: 1px dashed #9aa5b1; outline-offset: 3px; }
          .tiptap-doc-surface [data-if], .tiptap-doc-surface [data-unless] { background: rgba(255,214,0,.12); }
          ${PRINT_CSS}
        `}</style>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface-2 p-1.5">
          <TB label="B" title="Bold" active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()} />
          <TB label="I" title="Italic" active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()} />
          <TB label="U" title="Underline" active={editor.isActive("underline")} on={() => editor.chain().focus().toggleUnderline().run()} />
          <span className="mx-1 h-5 w-px bg-line" />
          <TB label="H1" title="Heading 1" active={editor.isActive("heading", { level: 1 })} on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
          <TB label="H2" title="Heading 2" active={editor.isActive("heading", { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
          <TB label="H3" title="Heading 3" active={editor.isActive("heading", { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
          <TB label="¶" title="Paragraph" on={() => editor.chain().focus().setParagraph().run()} />
          <span className="mx-1 h-5 w-px bg-line" />
          <TB label="• List" title="Bullet list" active={editor.isActive("bulletList")} on={() => editor.chain().focus().toggleBulletList().run()} />
          <TB label="1. List" title="Ordered list" active={editor.isActive("orderedList")} on={() => editor.chain().focus().toggleOrderedList().run()} />
          <span className="mx-1 h-5 w-px bg-line" />
          <TB label="⟸" title="Align left" on={() => setAlign(editor, "left")} />
          <TB label="⟺" title="Align center" on={() => setAlign(editor, "center")} />
          <TB label="⟹" title="Align right" on={() => setAlign(editor, "right")} />
          <span className="mx-1 h-5 w-px bg-line" />
          <TB label="Table" title="Insert 2×2 table" on={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()} />
          <TB label="+Row" title="Add row below" disabled={!editor.can().addRowAfter()} on={() => editor.chain().focus().addRowAfter().run()} />
          <TB label="+Col" title="Add column after" disabled={!editor.can().addColumnAfter()} on={() => editor.chain().focus().addColumnAfter().run()} />
          <TB label="−Row" title="Delete row" disabled={!editor.can().deleteRow()} on={() => editor.chain().focus().deleteRow().run()} />
          <TB label="−Col" title="Delete column" disabled={!editor.can().deleteColumn()} on={() => editor.chain().focus().deleteColumn().run()} />
          <span className="mx-1 h-5 w-px bg-line" />
          <TB label="HR" title="Horizontal rule" on={() => editor.chain().focus().setHorizontalRule().run()} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
          <div className="rounded-lg border border-line bg-white text-sm text-ink-900 focus-within:ring-2 focus-within:ring-accent/40">
            <EditorContent editor={editor} />
          </div>

          <aside className="flex max-h-[560px] flex-col gap-4 overflow-auto rounded-lg border border-line bg-surface-2 p-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Insert field</p>
              <p className="mt-1 text-xs text-ink-400">
                Inserts a <code>{"{{token}}"}</code> at the cursor.
              </p>
            </div>
            {FIELD_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1 text-xs font-semibold text-ink-700">{group.label}</p>
                <div className="flex flex-wrap gap-1">
                  {group.fields.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      title={f.key}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insert(`{{${f.key}}}`)}
                      className="rounded border border-line bg-white px-1.5 py-0.5 text-xs text-ink-700 hover:border-accent hover:text-accent"
                    >
                      {f.label}
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
                      insert(
                        `<table><tbody><tr>${col.fields
                          .map((f) => `<th>${f.key}</th>`)
                          .join("")}</tr><tr data-repeat="${col.key}">${col.fields
                          .map((f) => `<td>{{${f.key}}}</td>`)
                          .join("")}</tr></tbody></table><p></p>`,
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
                      insert(
                        `<div data-if="${flag.key}"><p>shown when ${flag.label}</p></div>`,
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
      </div>
    );
  },
);
