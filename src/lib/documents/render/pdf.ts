import htmlToPdfmake from "html-to-pdfmake";
import { JSDOM } from "jsdom";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

import { makeDeterministic } from "./deterministic";
import { getPrinter } from "./fonts";

// `makeDeterministic` moved to ./deterministic (shared with the Gotenberg path);
// behaviour for pdfmake output is byte-identical to the previous inline version.
export { makeDeterministic } from "./deterministic";

/**
 * Render an HTML string (already merged — no template tokens) to a deterministic
 * PDF byte array using pdfmake. Pure JS, no headless browser: safe on serverless.
 */
export function htmlToPdf(html: string): Promise<Uint8Array> {
  const { window } = new JSDOM("");
  const content = htmlToPdfmake(html, { window });

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
