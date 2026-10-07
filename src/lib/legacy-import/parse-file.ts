/**
 * Browser-side file parsing for the legacy import dry run.
 * Excel files are opened by the authenticated server route; CSV remains local.
 */
import { parseCsv } from "./csv";
import type { CellValue } from "./normalize";
import { trimGrid } from "./workbook-grid";

export { cellToValue, trimGrid } from "./workbook-grid";

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
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch("/api/admin/legacy-import/parse", { method: "POST", body: formData });
  const payload = (await response.json().catch(() => null)) as
    | { error?: string; sheetNames?: string[]; sheets?: Record<string, CellValue[][]> }
    | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Unable to read the uploaded workbook.");
  }
  if (!payload?.sheetNames || !payload.sheets) {
    throw new Error("The workbook could not be read.");
  }
  return {
    sheetNames: payload.sheetNames,
    readSheet: (name) => payload.sheets?.[name] ?? [],
  };
}
