/**
 * Review-step helpers for the legacy import wizard: in-place cell fixes,
 * row exclusion, and the blank system template. Pure; writes nothing.
 */
import { toCsv } from "./csv";
import { type ColumnMapping, type LegacySegment, FIELD_BY_KEY, fieldsForSegment } from "./fields";
import type { CellValue } from "./normalize";
import type { InputRow, RowResult } from "./validate";

/** rowNumber → (column index → replacement value). */
export type CellOverrides = Record<number, Record<number, string>>;

export function applyOverrides(row: InputRow, overrides: CellOverrides): InputRow {
  const fix = overrides[row.rowNumber];
  if (!fix) return row;
  const cells: CellValue[] = [...row.cells];
  for (const [idx, value] of Object.entries(fix)) {
    const i = Number(idx);
    while (cells.length <= i) cells.push(null);
    cells[i] = value.trim() === "" ? null : value;
  }
  return { rowNumber: row.rowNumber, cells };
}

/** Mapped columns whose field label is named in a row's errors/warnings. */
export function flaggedColumns(result: RowResult, mapping: readonly ColumnMapping[]): Set<number> {
  const issues = [...result.errors, ...result.warnings];
  const out = new Set<number>();
  for (const m of mapping) {
    if (!m.target) continue;
    const label = FIELD_BY_KEY.get(m.target)?.label ?? m.target;
    if (issues.some((e) => e.includes(label))) out.add(m.index);
  }
  return out;
}

/** Replace re-checked rows' raw (pre file-wide duplicate pass) results by row number. */
export function mergeResults(base: readonly RowResult[], updates: readonly RowResult[]): RowResult[] {
  const byRow = new Map(updates.map((r) => [r.rowNumber, r]));
  return base.map((r) => byRow.get(r.rowNumber) ?? r);
}

/** Header-only CSV of the segment's system fields (header row 1). */
export function templateCsv(segment: LegacySegment): string {
  return toCsv([fieldsForSegment(segment).map((f) => f.label)]);
}
