import { createHash } from "node:crypto";

import { loadDocFonts } from "./doc-font";
import type { DocRenderConnection } from "./engine-config";
import { mergeDocxTemplate, DocxTemplateMergeError } from "./docx-merge";
import { htmlToPdfViaGotenberg } from "./gotenberg";
import { officeToPdfViaGotenberg } from "./gotenberg-office";
import { buildBodyLetterhead, buildFooterHtml, getLogoAsset } from "./letterhead";
import { getLogoDataUri } from "./logo-asset";
import { mergeTemplate, type RenderContext } from "./merge";
import { htmlToPdf } from "./pdf";

export type { RenderContext } from "./merge";
export { mergeTemplate } from "./merge";
export { htmlToPdf } from "./pdf";
export { htmlToPdfViaGotenberg, RenderEngineError } from "./gotenberg";
export { officeToPdfViaGotenberg } from "./gotenberg-office";
export { mergeDocxTemplate, DocxTemplateMergeError } from "./docx-merge";
export { PRINT_CSS } from "./print-styles";
// `loadDocRenderConfig` is intentionally NOT re-exported here: it pulls in the
// Supabase service client (`next/headers`), which would poison this barrel for
// node:test + client bundles. Import it from "./engine-config" directly.
export type { ResolvedDocRenderConfig, DocRenderConnection } from "./engine-config";

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

export type RenderTemplateOptions = {
  /** Force an engine, ignoring config + env. */
  engine?: RenderEngine;
  /** Gotenberg connection (from `loadDocRenderConfig`); falls back to env. */
  connection?: DocRenderConnection;
};

/**
 * Render a document template (HTML body with {{tokens}}, data-repeat, data-if)
 * against a data context, producing a deterministic PDF.
 *
 * This is the sole document renderer: every generated document flows through
 * here. `opts` is additive and backward-compatible — every existing 2-arg call
 * site keeps the previous (`pdfmake`) behaviour. Call sites that want the
 * admin-configured engine pass `{ engine, connection }` from
 * `loadDocRenderConfig()`.
 */
export async function renderTemplateToPdf(
  templateHtml: string,
  context: RenderContext,
  opts?: RenderTemplateOptions,
): Promise<Uint8Array> {
  // `{{logoDataUri}}` — the company wordmark as a data URI, available to every
  // template (the editor's "Company logo" palette button inserts it). The caller
  // may override by supplying its own.
  const merged = mergeTemplate(templateHtml, {
    logoDataUri: getLogoDataUri(),
    ...context,
  });
  return resolveEngine(opts?.engine) === "chromium"
    ? renderViaChromium(merged, opts?.connection)
    : htmlToPdf(merged);
}

/**
 * Render a docx-format template (an uploaded .docx with {{field}} /
 * {{#loop}}...{{/loop}} tags — same tag name reused for conditionals, see
 * docx-merge.ts — inserted directly in Word) against a data context,
 * producing a PDF. See the "Upload a Word file as template" plan.
 *
 * Sibling to renderTemplateToPdf, not a replacement: an html-format template
 * still goes through mergeTemplate + Gotenberg's Chromium route; a
 * docx-format template goes through mergeDocxTemplate (docxtemplater, fills
 * tags directly in the Word XML — no HTML step, no schema ceiling) +
 * Gotenberg's LibreOffice route (officeToPdfViaGotenberg). Same context
 * shape as renderTemplateToPdf — buildReleaseTemplateContext's flat
 * Record<string, unknown> needs no changes for either path.
 */
export async function renderDocxTemplateToPdf(
  docxBytes: Buffer | Uint8Array,
  context: RenderContext,
  opts?: RenderTemplateOptions,
): Promise<Uint8Array> {
  // No `{{logoDataUri}}` injection here (unlike renderTemplateToPdf): that's
  // an HTML-only convention for the editor's "Company logo" palette button.
  // A docx template's logo is a static image already embedded in the source
  // file, not inserted via a merge token.
  const filled = mergeDocxTemplate(docxBytes, context);
  return officeToPdfViaGotenberg(filled, {
    ...(opts?.connection ? { connection: opts.connection } : {}),
  });
}

/**
 * Chromium path: add the page-number footer and document font. The centered
 * wordmark is prepended to page 1 UNLESS the template already places its own
 * logo inline (`<img class="doc-logo">` from the palette).
 */
async function renderViaChromium(
  mergedHtml: string,
  connection?: DocRenderConnection,
): Promise<Uint8Array> {
  const logo = await getLogoAsset();
  const fonts = loadDocFonts();
  const hasInlineLogo = /class="[^"]*\bdoc-logo\b/.test(mergedHtml);
  const body = hasInlineLogo
    ? mergedHtml
    : buildBodyLetterhead(Boolean(logo)) + mergedHtml;
  return htmlToPdfViaGotenberg(body, {
    // A source-faithful template may opt out of the house page-number footer.
    // The marker is local to that template; all existing documents retain it.
    ...(!/data-document-footer="none"/.test(mergedHtml)
      ? { footerHtml: buildFooterHtml() }
      : {}),
    assets: logo ? [logo] : [],
    ...(fonts.length ? { fonts } : {}),
    ...(connection ? { connection } : {}),
  });
}

/** sha256 of the rendered bytes — same content-hash contract as the LRA flow. */
export function hashPdf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
