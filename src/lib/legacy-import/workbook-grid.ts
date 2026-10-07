import type { CellValue } from "./normalize";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Converts the ExcelJS cell shapes into values safe to send to the browser. */
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
