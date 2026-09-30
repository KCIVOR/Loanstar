/**
 * Browser-side file parsing for the legacy import dry run.
 * .xlsx/.xlsm via exceljs (reads cell values only; VBA is never executed),
 * .csv via the local RFC-4180 parser.
 */
import { parseCsv } from "./csv";
import type { CellValue } from "./normalize";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function cellToValue(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellToValue(o.result);
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
    }
    if ("text" in o) return cellToValue(o.text);
    if ("error" in o) return null;
  }
  return String(v);
}

/** Trim trailing blank rows and trailing all-blank columns. */
export function trimGrid(rows: CellValue[][]): CellValue[][] {
  let last = rows.length;
  while (last > 0 && rows[last - 1].every((v) => v === null || v === "")) last--;
  const kept = rows.slice(0, last);
  let width = 0;
  for (const r of kept) {
    for (let c = r.length - 1; c >= width; c--) {
      if (r[c] !== null && r[c] !== "") {
        width = c + 1;
        break;
      }
    }
  }
  return kept.map((r) => {
    const out = r.slice(0, width);
    while (out.length < width) out.push(null);
    return out;
  });
}

export type LoadedWorkbook = {
  sheetNames: string[];
  /** Reads one sheet on demand (only the selected sheet is materialized). */
  readSheet: (name: string) => CellValue[][];
};

export async function parseLegacyFile(file: File): Promise<LoadedWorkbook> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    const rows = trimGrid(
      parseCsv(await file.text()).map((r) => r.map((c) => (c.trim() === "" ? null : c))),
    );
    return { sheetNames: ["CSV"], readSheet: () => rows };
  }
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) {
    throw new Error("Unsupported file type. Use .xlsx, .xlsm or .csv.");
  }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const cache = new Map<string, CellValue[][]>();
  return {
    sheetNames: wb.worksheets.map((ws) => ws.name),
    readSheet: (name) => {
      const hit = cache.get(name);
      if (hit) return hit;
      const ws = wb.getWorksheet(name);
      if (!ws) return [];
      const rows: CellValue[][] = [];
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const cells: CellValue[] = [];
        row.eachCell({ includeEmpty: false }, (cell, col) => {
          cells[col - 1] = cellToValue(cell.value);
        });
        for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
        rows[rowNumber - 1] = cells;
      });
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      const grid = trimGrid(rows);
      cache.set(name, grid);
      return grid;
    },
  };
}
