/** Shared ledger display helpers — no currency symbol (matches AR/borrower tables). */

export function formatLedgerMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatLedgerDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatLedgerMoneyCell(value: number | null | undefined) {
  if (value == null) return "—";
  if (value === 0) return "—";
  return formatLedgerMoney(value);
}

export function formatLedgerDateCell(value: string | null | undefined) {
  if (!value) return "—";
  return formatLedgerDate(value);
}

export function formatLedgerTextCell(value: string | null | undefined) {
  if (!value) return "—";
  return value;
}
