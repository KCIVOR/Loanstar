/** Pure value normalizers for legacy import cells. */

export type CellValue = string | number | boolean | null;

export type Parsed<T> = { ok: true; value: T | null } | { ok: false; error: string };

export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export function isBlankRow(cells: readonly unknown[]): boolean {
  return cells.every(isBlank);
}

/**
 * Strict number parse: accepts numbers, "1,234.50", "₱1,234", "12%", "(500)".
 * Rejects anything with other text, e.g. "300,000.00/10,300,000.00".
 */
export function parseNumber(v: CellValue): Parsed<number> {
  if (isBlank(v)) return { ok: true, value: null };
  if (typeof v === "number") {
    return Number.isFinite(v) ? { ok: true, value: v } : { ok: false, error: "not a finite number" };
  }
  if (typeof v === "boolean") return { ok: false, error: "expected a number" };
  let s = String(v).trim().replace(/^(php|₱)\s*/i, "").replace(/%$/, "").trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$|^-?\.\d+$/.test(s)) {
    return { ok: false, error: `not a number: "${String(v)}"` };
  }
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return { ok: false, error: `not a number: "${String(v)}"` };
  return { ok: true, value: negative ? -n : n };
}

export function parseInteger(v: CellValue): Parsed<number> {
  const r = parseNumber(v);
  if (!r.ok || r.value === null) return r;
  if (!Number.isInteger(r.value)) return { ok: false, error: `not a whole number: "${String(v)}"` };
  return r;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoIfValid(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Excel serial day (1900 system) → ISO date. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const ms = Math.round((Math.floor(serial) - 25569) * 86400000);
  const dt = new Date(ms);
  return isoIfValid(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Accepts ISO (YYYY-MM-DD[...]), MM/DD/YYYY, M-D-YY, and Excel serials. */
export function parseDate(v: CellValue): Parsed<string> {
  if (isBlank(v)) return { ok: true, value: null };
  if (typeof v === "number") {
    // Plausible Excel serial range: 1900-01-01 .. ~2173.
    const iso = v >= 1 && v < 100000 ? excelSerialToIso(v) : null;
    return iso ? { ok: true, value: iso } : { ok: false, error: `not a date: ${v}` };
  }
  if (typeof v === "boolean") return { ok: false, error: "expected a date" };
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) {
    const iso = isoIfValid(+m[1], +m[2], +m[3]);
    return iso ? { ok: true, value: iso } : { ok: false, error: `invalid date: "${s}"` };
  }
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) y += y < 50 ? 2000 : 1900;
    const iso = isoIfValid(y, +m[1], +m[2]);
    return iso ? { ok: true, value: iso } : { ok: false, error: `invalid date (expected MM/DD/YYYY): "${s}"` };
  }
  if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
  return { ok: false, error: `not a date: "${s}"` };
}

export function parseBoolean(v: CellValue): Parsed<boolean> {
  if (isBlank(v)) return { ok: true, value: null };
  if (typeof v === "boolean") return { ok: true, value: v };
  const s = String(v).trim().toLowerCase();
  if (["y", "yes", "true", "1"].includes(s)) return { ok: true, value: true };
  if (["n", "no", "false", "0"].includes(s)) return { ok: true, value: false };
  return { ok: false, error: `not yes/no: "${String(v)}"` };
}

/** "FRESH NNO BRONZE" → false (is_reloan), "RELOAN ..." → true. */
export function parseLoanEntryType(v: CellValue): Parsed<boolean> {
  if (isBlank(v)) return { ok: true, value: null };
  const s = String(v).trim().toUpperCase();
  if (s.startsWith("FRESH")) return { ok: true, value: false };
  if (s.startsWith("RELOAN") || s.startsWith("RE-LOAN") || s.startsWith("RE LOAN")) {
    return { ok: true, value: true };
  }
  return { ok: false, error: `unknown loan entry type: "${String(v)}" (expected FRESH… or RELOAN…)` };
}

/** SEAMAN / SEAFARER / ALLOTTEE → seafarer; SME / BUSINESS / CORPORATE → sme. */
export function parseBorrowerType(v: CellValue): Parsed<"seafarer" | "sme"> {
  if (isBlank(v)) return { ok: true, value: null };
  const s = String(v).trim().toUpperCase();
  if (/^(SEAMAN|SEAMEN|SEAFARER|ALLOTTEE|ALLOTEE|SF)\b/.test(s)) return { ok: true, value: "seafarer" };
  if (/^(SME|BUSINESS|CORPORATE|CORPORATION|SOLE PROP)/.test(s)) return { ok: true, value: "sme" };
  return { ok: false, error: `unknown borrower type: "${String(v)}"` };
}

/** Last 4 digits of a card number, or error if fewer than 4 digits. */
export function parseCardLast4(v: CellValue): Parsed<string> {
  if (isBlank(v)) return { ok: true, value: null };
  const digits = String(v).replace(/\D/g, "");
  if (digits.length < 4) return { ok: false, error: `card number has fewer than 4 digits: "${String(v)}"` };
  return { ok: true, value: digits.slice(-4) };
}

export function cleanText(v: CellValue): string | null {
  if (isBlank(v)) return null;
  return String(v).trim().replace(/\s+/g, " ");
}

/**
 * "DELA CRUZ, JUAN P." → last "DELA CRUZ", first "JUAN P."; otherwise the last
 * token is the last name ("Juan Dela Cruz" → first "Juan Dela", last "Cruz").
 * Company names (single token) put everything in last_name and first_name.
 */
export function splitFullName(v: CellValue): { first: string; last: string } | null {
  const s = cleanText(v);
  if (!s) return null;
  if (s.includes(",")) {
    const [last, ...rest] = s.split(",");
    const first = rest.join(",").trim();
    if (last.trim() && first) return { first, last: last.trim() };
  }
  const parts = s.split(" ");
  if (parts.length === 1) return { first: s, last: s };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}
