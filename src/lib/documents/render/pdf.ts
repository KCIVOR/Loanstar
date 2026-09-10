import htmlToPdfmake from "html-to-pdfmake";
import { JSDOM } from "jsdom";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

import { getPrinter } from "./fonts";

/**
 * pdfmake emits two non-deterministic fields: the trailer `/ID` (random) and the
 * `/CreationDate`/`/ModDate` timestamps (wall-clock, as `(D:YYYYMMDDHHMMSS…)`
 * objects). Both are normalized here — length-preservingly, so xref byte offsets
 * stay valid — so identical input produces identical bytes. That is what lets the
 * signing content-hash be reproduced and verified later.
 */
function makeDeterministic(buf: Buffer): Buffer {
  let s = buf.toString("latin1");

  // 1. Zero the trailer /ID (two equal-length hex strings).
  const idMatch = s.match(/\/ID\s*\[\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\]/);
  if (idMatch) {
    const [full, id1, id2] = idMatch;
    s = s.replace(
      full,
      full.replace(id1, "0".repeat(id1.length)).replace(id2, "0".repeat(id2.length)),
    );
  }

  // 2. Pin every embedded PDF date (D:YYYYMMDDHHMMSS...) to a constant. Replacing
  //    only the 14 digits keeps the surrounding structure/length intact.
  s = s.replace(/D:\d{14}/g, "D:20000101000000");

  return Buffer.from(s, "latin1");
}

/**
 * Post-process pdfmake content to inject equal-width columns for tables
 * that don't have explicit widths. Makes tables span full page width.
 */
function injectTableWidths(node: unknown): void {
  if (!node || typeof node !== "object") return;
  
  if (Array.isArray(node)) {
    node.forEach(injectTableWidths);
    return;
  }
  
  const obj = node as Record<string, unknown>;
  
  // If this node has a table without explicit widths, inject equal-width columns
  if (obj.table && !obj.widths) {
    const tableObj = obj.table as Record<string, unknown>;
    const body = tableObj.body;
    if (Array.isArray(body) && body.length > 0 && Array.isArray(body[0])) {
      const columnCount = body[0].length;
      obj.widths = Array(columnCount).fill('*'); // '*' means equal-width
    }
  }
  
  // Recurse into child nodes
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
    defaultStyles: customDefaultStyles, // override pdfmake's built-in defaults
    tableAutoSize: false, // Let pdfmake compute widths based on content
  });

  // Make tables full-width by injecting equal-width column specs
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
