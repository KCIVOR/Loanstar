import PdfPrinterImport from "pdfmake";
import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

/** Minimal shape of the PDFKit document stream pdfmake returns server-side. */
export type PdfKitDocument = {
  on(event: "data", cb: (chunk: Buffer) => void): PdfKitDocument;
  on(event: "end", cb: () => void): PdfKitDocument;
  on(event: "error", cb: (err: Error) => void): PdfKitDocument;
  end(): void;
};

type PdfPrinterInstance = {
  createPdfKitDocument(def: TDocumentDefinitions): PdfKitDocument;
};

// @types/pdfmake types the browser `pdfMake` object, not the Node `PdfPrinter`
// constructor, so we re-type the default export through `unknown`.
type PdfPrinterCtor = new (fonts: TFontDictionary) => PdfPrinterInstance;
const PdfPrinter = PdfPrinterImport as unknown as PdfPrinterCtor;

/**
 * Standard-14 PDF fonts (Helvetica). pdfkit uses built-in AFM metrics for these
 * and does NOT embed or subset them — which is what makes output fully
 * deterministic. (Embedded/subset fonts carry process-order-dependent subset
 * state, so identical input can yield different bytes; standard fonts don't.)
 * Bonus: PDFs are ~6x smaller. Latin-1 coverage is sufficient for these forms.
 */
const fonts: TFontDictionary = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

/**
 * A fresh printer per render (not memoized) — cheap for standard fonts and keeps
 * each document fully isolated.
 */
export function getPrinter(): PdfPrinterInstance {
  return new PdfPrinter(fonts);
}
