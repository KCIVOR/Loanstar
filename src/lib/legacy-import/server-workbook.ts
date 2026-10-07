import ExcelJS from "exceljs";
import JSZip from "jszip";

import type { CellValue } from "./normalize";
import { cellToValue, trimGrid } from "./workbook-grid";

export type ParsedWorkbook = {
  sheetNames: string[];
  sheets: Record<string, CellValue[][]>;
};

/**
 * Some valid SpreadsheetML writers use `x:` element prefixes. ExcelJS 4.4
 * does not recognize those element names, although Excel opens the file.
 * Normalize just those element names as a fallback before asking ExcelJS to
 * parse the workbook again. Relationship attributes such as `r:id` remain
 * untouched.
 */
async function normalizeSpreadsheetMlPrefixes(content: ArrayBuffer): Promise<ArrayBuffer | null> {
  const zip = await JSZip.loadAsync(content);
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  if (!workbookXml || !/<\/?x:/.test(workbookXml)) return null;

  await Promise.all(
    Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name.endsWith(".xml"))
      .map(async (entry) => {
        const xml = await entry.async("string");
        zip.file(entry.name, xml.replace(/<(\/?)(?:x:)/g, "<$1"));
      }),
  );
  await Promise.all(
    Object.values(zip.files)
      .filter((entry) => entry.name.startsWith("xl/worksheets/_rels/") && entry.name.endsWith(".rels"))
      .map(async (entry) => {
        const relationships = await entry.async("string");
        zip.file(entry.name, relationships.replaceAll('Target="/xl/tables/', 'Target="../tables/'));
      }),
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

async function loadWorkbook(content: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(content);
    return workbook;
  } catch (originalError) {
    const normalizedContent = await normalizeSpreadsheetMlPrefixes(content).catch(() => null);
    if (!normalizedContent) throw originalError;

    const normalizedWorkbook = new ExcelJS.Workbook();
    await normalizedWorkbook.xlsx.load(normalizedContent);
    console.info("Legacy import normalized SpreadsheetML namespace prefixes before parsing");
    return normalizedWorkbook;
  }
}

/**
 * Opens an Excel workbook on the server. Keeping ExcelJS out of the browser
 * avoids the unreliable browser bundle path that caused uploads to fail.
 */
export async function parseLegacyWorkbook(
  fileName: string,
  content: ArrayBuffer,
): Promise<ParsedWorkbook> {
  if (!/\.xlsx$|\.xlsm$/i.test(fileName)) {
    throw new Error("Unsupported file type. Use .xlsx or .xlsm.");
  }

  try {
    const workbook = await loadWorkbook(content);
    const sheets: Record<string, CellValue[][]> = {};

    for (const worksheet of workbook.worksheets) {
      const rows: CellValue[][] = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const cells: CellValue[] = [];
        row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
          cells[columnNumber - 1] = cellToValue(cell.value);
        });
        for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
        rows[rowNumber - 1] = cells;
      });
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      sheets[worksheet.name] = trimGrid(rows);
    }

    return { sheetNames: workbook.worksheets.map((worksheet) => worksheet.name), sheets };
  } catch (error) {
    const signature = Array.from(new Uint8Array(content).slice(0, 4))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");
    console.error("Legacy import workbook parsing failed", {
      fileName,
      byteLength: content.byteLength,
      zipSignature: signature,
      error,
    });
    throw new Error("Unable to read this workbook. Please upload a valid .xlsx or .xlsm file.");
  }
}
