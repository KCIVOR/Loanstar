import { mergeTemplate, type RenderContext } from "./merge";

type HTMLtoDOCX = (
  html: string,
  headerHTML?: string | null,
  opts?: Record<string, unknown>,
  footerHTML?: string | null,
) => Promise<ArrayBuffer | Uint8Array>;

/**
 * Template / document → `.docx` (an editable Word copy). Pure JS via
 * `html-to-docx`, serverless-safe. Fidelity is "good enough to edit", NOT
 * print-exact — the Chromium PDF stays the canonical output.
 *
 *   opts.merge omitted → keep the {{tokens}} (a copy of the *template*).
 *   opts.merge = context → the *filled* document.
 */
export async function renderTemplateToDocx(
  templateHtml: string,
  opts?: { merge?: RenderContext },
): Promise<Uint8Array> {
  const html = opts?.merge
    ? mergeTemplate(templateHtml, opts.merge)
    : templateHtml;

  const mod = (await import("html-to-docx")) as unknown as
    | HTMLtoDOCX
    | { default: HTMLtoDOCX };
  const HTMLtoDOCX = typeof mod === "function" ? mod : mod.default;

  const out = await HTMLtoDOCX(
    `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`,
    null,
    { table: { row: { cantSplit: true } }, footer: false, pageNumber: false },
    null,
  );
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}
