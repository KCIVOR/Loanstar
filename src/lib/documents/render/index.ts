import { createHash } from "node:crypto";

import { mergeTemplate, type RenderContext } from "./merge";
import { htmlToPdf } from "./pdf";

export type { RenderContext } from "./merge";
export { mergeTemplate } from "./merge";
export { htmlToPdf } from "./pdf";

/**
 * Render a document template (HTML body with {{tokens}}, data-repeat, data-if)
 * against a data context, producing a deterministic PDF.
 *
 * This is the sole document renderer: every generated document (release docs +
 * the Phase 6 documents) flows through here. The legacy hardcoded
 * `renderDocumentPdf`/`simple-pdf.ts` was retired in Phase 7.
 */
export async function renderTemplateToPdf(
  templateHtml: string,
  context: RenderContext,
): Promise<Uint8Array> {
  const merged = mergeTemplate(templateHtml, context);
  return htmlToPdf(merged);
}

/** sha256 of the rendered bytes — same content-hash contract as the LRA flow. */
export function hashPdf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
