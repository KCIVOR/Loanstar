import htmlToPdfmake from "html-to-pdfmake";
import { JSDOM } from "jsdom";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

import { makeDeterministic } from "./deterministic";
import { getPrinter } from "./fonts";

// `makeDeterministic` moved to ./deterministic (shared with the Gotenberg path);
// behaviour for pdfmake output is byte-identical to the previous inline version.
export { makeDeterministic } from "./deterministic";

/**
 * Post-process pdfmake content: give every table an explicit equal-width column
 * spec (`['*', …]`) unless it already has one, so tables span the full page
 * width instead of shrinking to their content — matching what the Visual editor
 * shows (`table { width: 100% }`).
 *
 * pdfmake reads column widths at `node.table.widths`, so the array must be
 * written there, NOT as a sibling of `node.table` (an earlier version wrote
 * `node.widths`, which pdfmake silently ignores — the whole effect was a no-op).
 */
function injectTableWidths(node: unknown): void {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    node.forEach(injectTableWidths);
    return;
  }

  const obj = node as Record<string, unknown>;

  if (obj.table && typeof obj.table === "object") {
    const tableObj = obj.table as Record<string, unknown>;
    const body = tableObj.body;
    if (
      !Array.isArray(tableObj.widths) &&
      Array.isArray(body) &&
      body.length > 0 &&
      Array.isArray(body[0])
    ) {
      // html-to-pdfmake pads colspan rows with filler cells, so the first row's
      // length is the true grid column count.
      const columnCount = (body[0] as unknown[]).length;
      if (columnCount > 0) {
        tableObj.widths = Array(columnCount).fill("*"); // '*' = equal-width
      }
    }
  }

  // Recurse into child nodes (covers tables nested inside table cells).
  Object.values(obj).forEach(injectTableWidths);
}

/**
 * Render an HTML string (already merged — no template tokens) to a deterministic
 * PDF byte array using pdfmake. Pure JS, no headless browser: safe on serverless.
 */
export function htmlToPdf(
  html: string,
  customDefaultStyles?: Record<string, unknown>,
): Promise<Uint8Array> {
  const { window } = new JSDOM("");
  const content = htmlToPdfmake(html, {
    window,
    // Merges over html-to-pdfmake's built-in per-tag defaults (undefined = leave
    // them untouched, i.e. the legacy byte-for-byte path).
    defaultStyles: customDefaultStyles,
  });

  // Shared-defaults path only: force tables to full page width. The legacy path
  // is left completely untouched so previously generated/signed PDFs still hash
  // identically.
  if (customDefaultStyles) {
    injectTableWidths(content);
  }

  const docDefinition: TDocumentDefinitions = {
    content: content as TDocumentDefinitions["content"],
    pageSize: "A4",
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: "Helvetica", fontSize: 10 },
  };

  const pdfDoc = getPrinter().createPdfKitDocument(docDefinition);

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () =>
      resolve(new Uint8Array(makeDeterministic(Buffer.concat(chunks)))),
    );
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
}
