/**
 * Normalise a rendered PDF's non-deterministic fields so identical input yields
 * identical bytes — the reproducibility property the signing content-hash relies
 * on. Every substitution is **length-preserving** so the xref byte offsets stay
 * valid without a full rewrite.
 *
 * Handles both renderer engines:
 *   - pdfmake:  trailer `/ID` (random) + `/CreationDate` / `/ModDate` (wall clock)
 *   - Chromium via Gotenberg: the above, plus a version-bearing `/Producer`
 *     ("Skia/PDF mXXX …") and a `/Creator`.
 *
 * Extracted from `pdf.ts` unchanged (only the Producer/Creator clauses are new —
 * they no-op on pdfmake output, which carries no such strings).
 */
export function makeDeterministic(buf: Buffer): Buffer {
  let s = buf.toString("latin1");

  // 1. Zero the trailer /ID (two equal-length hex strings).
  const idMatch = s.match(/\/ID\s*\[\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\]/);
  if (idMatch) {
    const [full, id1, id2] = idMatch;
    s = s.replace(
      full,
      full
        .replace(id1, "0".repeat(id1.length))
        .replace(id2, "0".repeat(id2.length)),
    );
  }

  // 2. Pin every embedded PDF date (D:YYYYMMDDHHMMSS...) to a constant. Replacing
  //    only the 14 digits keeps the surrounding structure/length intact.
  s = s.replace(/D:\d{14}/g, "D:20000101000000");

  // 3. Chromium/Skia stamps a version-bearing /Producer and a /Creator in the
  //    Info dict. Replace the *value* in place, padded/truncated to the original
  //    length so byte offsets are untouched. No parens appear in these values.
  s = s.replace(
    /\/Producer\s*\(([^()\\]*)\)/g,
    (_m, val: string) => `/Producer (${sameLength(val, "Loanstar")})`,
  );
  s = s.replace(
    /\/Creator\s*\(([^()\\]*)\)/g,
    (_m, val: string) => `/Creator (${sameLength(val, "Loanstar")})`,
  );

  return Buffer.from(s, "latin1");
}

/** `replacement` padded with spaces / truncated to exactly `original.length`. */
function sameLength(original: string, replacement: string): string {
  if (replacement.length === original.length) return replacement;
  if (replacement.length > original.length) {
    return replacement.slice(0, original.length);
  }
  return replacement + " ".repeat(original.length - replacement.length);
}
