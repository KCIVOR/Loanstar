import { createHash } from "node:crypto";

import { htmlToPdfViaGotenberg } from "./gotenberg";
import { mergeTemplate, type RenderContext } from "./merge";
import { htmlToPdf } from "./pdf";

export type { RenderContext } from "./merge";
export { mergeTemplate } from "./merge";
export { htmlToPdf } from "./pdf";
export { htmlToPdfViaGotenberg, RenderEngineError } from "./gotenberg";
export { PRINT_CSS } from "./print-styles";

/**
 * `pdfmake`  — pure-JS, in-process (legacy default, byte-deterministic via
 *              Standard-14 fonts).
 * `chromium` — headless Chromium via a Gotenberg service; the editor preview and
 *              the PDF then share one rendering engine (true WYSIWYG). Selected
 *              per call, or globally via `DOC_RENDER_ENGINE`.
 */
export type RenderEngine = "pdfmake" | "chromium";

function resolveEngine(explicit?: RenderEngine): RenderEngine {
  if (explicit) return explicit;
  const env = process.env.DOC_RENDER_ENGINE;
  return env === "chromium" ? "chromium" : "pdfmake";
}

/**
 * Render a document template (HTML body with {{tokens}}, data-repeat, data-if)
 * against a data context, producing a deterministic PDF.
 *
 * This is the sole document renderer: every generated document flows through
 * here. The `opts.engine` parameter is additive and backward-compatible — every
 * existing 2-arg call site keeps the previous (`pdfmake`) behaviour.
 */
export async function renderTemplateToPdf(
  templateHtml: string,
  context: RenderContext,
  opts?: { engine?: RenderEngine },
): Promise<Uint8Array> {
  const merged = mergeTemplate(templateHtml, context);
  return resolveEngine(opts?.engine) === "chromium"
    ? htmlToPdfViaGotenberg(merged)
    : htmlToPdf(merged);
}

/** sha256 of the rendered bytes — same content-hash contract as the LRA flow. */
export function hashPdf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
