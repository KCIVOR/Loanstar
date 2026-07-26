export function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function paymentStatusVariant(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "teal" {
  if (status === "confirmed") return "success";
  if (status === "posted") return "teal";
  if (status === "rejected") return "danger";
  if (status.includes("pending")) return "warning";
  return "neutral";
}

export function agingVariant(
  bucket: string,
): "success" | "warning" | "danger" | "neutral" {
  const b = bucket.toLowerCase();
  if (b.includes("91") || b.includes("120") || b.includes("180")) return "danger";
  if (b === "current") return "success";
  return "warning";
}

export function dcrStatusVariant(
  status: string,
): "success" | "warning" | "neutral" | "teal" | "danger" {
  const s = status.toLowerCase();
  if (s === "reconciled" || s === "posted") return "success";
  if (s === "submitted") return "teal";
  if (s === "draft") return "warning";
  if (s === "rejected") return "danger";
  return "neutral";
}

export function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Recent = last N days; All = no date cut. */
export function isWithinRecentDays(iso: string, days: number, now = new Date()) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return t >= cutoff;
}
