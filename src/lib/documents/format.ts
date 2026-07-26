/** Peso money formatting shared across document generation (2 decimals). */
export function formatMoney(value: number): string {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
