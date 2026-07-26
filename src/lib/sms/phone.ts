/**
 * Normalize PH mobile numbers to E.164 (+63…).
 * Accepts 09XXXXXXXXX, 639XXXXXXXXX, +639XXXXXXXXX.
 */
export function normalizePhMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let national: string | null = null;
  if (digits.startsWith("63") && digits.length === 12) {
    national = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    national = digits.slice(1);
  } else if (digits.length === 10 && digits.startsWith("9")) {
    national = digits;
  }

  if (!national || !/^9\d{9}$/.test(national)) {
    return null;
  }

  return `+63${national}`;
}
