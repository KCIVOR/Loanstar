import type { ImportOutcome } from "./active-import";
import type { ColumnMapping, LegacySegment } from "./fields";
import type { InputRow } from "./validate";
import { normalizeHeader } from "./suggest";
import { cleanText, type CellValue } from "./normalize";

type ImportRequest = { file_name: string; segment: LegacySegment; mapping: ColumnMapping[]; rows: InputRow[]; installments: CellValue[][] };

/** Never automatically retry a write: a dropped response may already be committed. */
export async function submitImport(input: ImportRequest, send: typeof fetch = fetch,
  progress?: (outcomes: ImportOutcome[], sent: number) => void) {
  const outcomes: ImportOutcome[] = [];
  for (let offset = 0; offset < input.rows.length; offset += 25) {
    const rows = input.rows.slice(offset, offset + 25);
    const loanColumn = input.mapping.find((m) => m.target === "legacy_loan_no")?.index;
    const sheetColumn = input.installments[0]?.findIndex((value) => normalizeHeader(value) === normalizeHeader("Legacy Loan No."));
    const keys = new Set(rows.map((r) => cleanText(r.cells[loanColumn ?? -1] ?? null)));
    const installments = loanColumn != null && sheetColumn != null && sheetColumn >= 0
      ? input.installments.filter((r, i) => i === 0 || keys.has(cleanText(r[sheetColumn] ?? null))) : input.installments;
    try {
      const response = await send("/api/admin/legacy-import/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, rows, installments }),
      });
      const body = await response.json();
      if (!response.ok) return { outcomes, error: body.error ?? "Import request failed. Check Masterfile before uploading again." };
      if (!Array.isArray(body.outcomes)) throw new Error("Missing import outcomes");
      const acknowledged = new Set(body.outcomes.map((r: ImportOutcome) => r.rowNumber));
      if (body.outcomes.length !== rows.length || acknowledged.size !== rows.length ||
        rows.some((r) => !acknowledged.has(r.rowNumber)) ||
        body.outcomes.some((r: ImportOutcome) => !["imported", "failed"].includes(r.status) ||
          (r.status === "imported" && !r.masterlistId))) throw new Error("Incomplete import response");
      outcomes.push(...body.outcomes);
      progress?.([...outcomes], Math.min(offset + rows.length, input.rows.length));
    } catch {
      return { outcomes, error: "Import response was interrupted. Some loans may have been saved. Check Masterfile before uploading again; duplicate loan numbers will be rejected." };
    }
  }
  return { outcomes, error: null };
}
