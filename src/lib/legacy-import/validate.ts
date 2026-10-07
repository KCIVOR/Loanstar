/** Pure row validation for the legacy import dry run. Writes nothing. */
import {
  type ColumnMapping,
  type LegacySegment,
  FIELD_BY_KEY,
  fieldsForSegment,
} from "./fields";
import {
  type CellValue,
  type Parsed,
  cleanText,
  isBlank,
  parseBoolean,
  parseBorrowerType,
  parseCardLast4,
  parseDate,
  parseInteger,
  parseLoanEntryType,
  parseNumber,
  splitFullName,
} from "./normalize";

export type InputRow = { rowNumber: number; cells: CellValue[] };

export type RowStatus = "valid" | "warning" | "error";

export type RowResult = {
  rowNumber: number;
  status: RowStatus;
  legacyBorrowerNo: string | null;
  legacyLoanNo: string | null;
  name: string | null;
  errors: string[];
  warnings: string[];
};

export type ExistingKeys = {
  borrowerNos: ReadonlySet<string>;
  loanNos: ReadonlySet<string>;
};

export const EMPTY_EXISTING: ExistingKeys = { borrowerNos: new Set(), loanNos: new Set() };

export function parseByField(key: string, v: CellValue): Parsed<unknown> {
  const f = FIELD_BY_KEY.get(key);
  if (!f) return { ok: true, value: cleanText(v) };
  if (key === "atm_card_last4") return parseCardLast4(v);
  switch (f.type) {
    case "number":
      return parseNumber(v);
    case "integer":
      return parseInteger(v);
    case "date":
      return parseDate(v);
    case "boolean":
      return parseBoolean(v);
    case "enum":
      return f.enumKind === "loan_entry_type" ? parseLoanEntryType(v) : parseBorrowerType(v);
    default:
      return { ok: true, value: cleanText(v) };
  }
}

/** Collect the legacy keys from rows (for the read-only DB existence lookup). */
export function extractLegacyKeys(
  rows: readonly InputRow[],
  mapping: readonly ColumnMapping[],
): { borrowerNos: string[]; loanNos: string[] } {
  const bIdx = mapping.find((m) => m.target === "legacy_borrower_no")?.index;
  const lIdx = mapping.find((m) => m.target === "legacy_loan_no")?.index;
  const b = new Set<string>();
  const l = new Set<string>();
  for (const r of rows) {
    if (bIdx !== undefined) {
      const v = cleanText(r.cells[bIdx] ?? null);
      if (v) b.add(v);
    }
    if (lIdx !== undefined) {
      const v = cleanText(r.cells[lIdx] ?? null);
      if (v) l.add(v);
    }
  }
  return { borrowerNos: [...b], loanNos: [...l] };
}

export function validateRow(
  row: InputRow,
  mapping: readonly ColumnMapping[],
  segment: LegacySegment,
  existing: ExistingKeys = EMPTY_EXISTING,
): RowResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const values = new Map<string, unknown>();
  const allowed = new Set(fieldsForSegment(segment).map((f) => f.key));

  for (const m of mapping) {
    if (!m.target) continue;
    if (!allowed.has(m.target)) {
      errors.push(`column ${m.index + 1} maps to "${m.target}", which is not a ${segment} field`);
      continue;
    }
    const raw = (row.cells[m.index] ?? null) as CellValue;
    const label = FIELD_BY_KEY.get(m.target)?.label ?? m.target;
    const parsed = parseByField(m.target, raw);
    if (!parsed.ok) {
      errors.push(`${label}: ${parsed.error}`);
      continue;
    }
    if (parsed.value !== null && parsed.value !== undefined) values.set(m.target, parsed.value);
  }
  const has = (k: string) => values.has(k);

  // Name (first/last are NOT NULL on borrowers)
  let name: string | null = null;
  if (has("first_name") && has("last_name")) {
    name = `${values.get("first_name")} ${values.get("last_name")}`;
  } else if (has("full_name")) {
    const split = splitFullName(values.get("full_name") as string);
    if (split) name = values.get("full_name") as string;
    else errors.push("Borrower name is empty");
  } else {
    errors.push("Borrower name is missing (need Full Name, or First + Last Name)");
  }
  if (name && /\bDUMMY\b/i.test(name)) warnings.push(`name looks like a placeholder ("${name}")`);

  for (const f of fieldsForSegment(segment)) {
    if (!f.required || has(f.key)) continue;
    // Only report as a parse-free "missing" if the column was not already an error.
    if (errors.some((e) => e.startsWith(`${f.label}:`))) continue;
    if (f.requiredPolicy === "warn") warnings.push(`${f.label} is missing (required by the system; no legacy column)`);
    else errors.push(`${f.label} is required`);
  }

  // pdc_checks: a check with any value needs date, amount and bank.
  for (const n of [1, 2] as const) {
    const keys = ["number", "bank", "account", "amount", "date"].map((p) => `check${n}_${p}`);
    if (!keys.some(has)) continue;
    for (const p of ["date", "amount", "bank"]) {
      const k = `check${n}_${p}`;
      if (!has(k) && !errors.some((e) => e.startsWith(`${FIELD_BY_KEY.get(k)!.label}:`))) {
        errors.push(`${FIELD_BY_KEY.get(k)!.label} is required when check ${n} has data`);
      }
    }
  }

  const terms = values.get("terms");
  if (typeof terms === "number" && terms <= 0) errors.push("Terms must be greater than 0");

  const bt = values.get("borrower_type");
  if (bt && bt !== segment) warnings.push(`Borrower Type is ${bt}, but this import is ${segment}`);

  const legacyBorrowerNo = (values.get("legacy_borrower_no") as string | undefined) ?? null;
  const legacyLoanNo = (values.get("legacy_loan_no") as string | undefined) ?? null;
  if (legacyLoanNo && existing.loanNos.has(legacyLoanNo)) {
    errors.push(`Legacy Loan No. "${legacyLoanNo}" already exists in the system`);
  }
  if (legacyBorrowerNo && existing.borrowerNos.has(legacyBorrowerNo)) {
    warnings.push(`Legacy Borrower No. "${legacyBorrowerNo}" already exists in the system`);
  }

  return {
    rowNumber: row.rowNumber,
    status: errors.length ? "error" : warnings.length ? "warning" : "valid",
    legacyBorrowerNo,
    legacyLoanNo,
    name,
    errors,
    warnings,
  };
}

export function validateRows(
  rows: readonly InputRow[],
  mapping: readonly ColumnMapping[],
  segment: LegacySegment,
  existing: ExistingKeys = EMPTY_EXISTING,
): RowResult[] {
  return rows.filter((r) => !r.cells.every(isBlank)).map((r) => validateRow(r, mapping, segment, existing));
}

/** File-wide pass: duplicate legacy loan numbers across all rows (mutates copies). */
export function flagDuplicateLoanNos(results: readonly RowResult[]): RowResult[] {
  const byNo = new Map<string, number[]>();
  for (const r of results) {
    if (!r.legacyLoanNo) continue;
    const list = byNo.get(r.legacyLoanNo) ?? [];
    list.push(r.rowNumber);
    byNo.set(r.legacyLoanNo, list);
  }
  return results.map((r) => {
    const rows = r.legacyLoanNo ? byNo.get(r.legacyLoanNo) : undefined;
    if (!rows || rows.length < 2) return r;
    const others = rows.filter((n) => n !== r.rowNumber).join(", ");
    return {
      ...r,
      status: "error",
      errors: [...r.errors, `Legacy Loan No. "${r.legacyLoanNo}" is duplicated in this file (also row ${others})`],
    };
  });
}

export type ValidationSummary = { total: number; valid: number; warning: number; error: number };

export function summarize(results: readonly RowResult[]): ValidationSummary {
  const s = { total: results.length, valid: 0, warning: 0, error: 0 };
  for (const r of results) s[r.status] += 1;
  return s;
}
