/** The three live loan books plus the unfiltered view. Keep this list in one
 *  place so Accounts, Collections, Past due and LoanBot cannot drift. */
export const REPORT_SEGMENTS = ["all", "seafarer", "sme", "individual"] as const;
export type ReportSegment = (typeof REPORT_SEGMENTS)[number];
export type LoanSegment = Exclude<ReportSegment, "all">;

export const REPORT_COLLATERALS = ["all", "none", "car_refinancing", "real_estate"] as const;
export type ReportCollateral = (typeof REPORT_COLLATERALS)[number];
export type CollateralType = Exclude<ReportCollateral, "all">;

export const SEGMENT_CHIPS: Array<{ id: ReportSegment; label: string }> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
  { id: "individual", label: "Individual" },
];

export const COLLATERAL_CHIPS: Array<{ id: ReportCollateral; label: string }> = [
  { id: "all", label: "All collateral" },
  { id: "none", label: "Clean" },
  { id: "car_refinancing", label: "Car refi" },
  { id: "real_estate", label: "Real estate" },
];

export function isReportSegment(value: string | null | undefined): value is ReportSegment {
  return typeof value === "string" && (REPORT_SEGMENTS as readonly string[]).includes(value);
}

export function isReportCollateral(value: string | null | undefined): value is ReportCollateral {
  return typeof value === "string" && (REPORT_COLLATERALS as readonly string[]).includes(value);
}

export function parseReportSegment(
  value: string | null | undefined,
  fallback: ReportSegment = "all",
): ReportSegment {
  return isReportSegment(value) ? value : fallback;
}

export function parseReportCollateral(
  value: string | null | undefined,
  fallback: ReportCollateral = "all",
): ReportCollateral {
  return isReportCollateral(value) ? value : fallback;
}

export function asLoanSegment(value: unknown): LoanSegment | null {
  if (value === "seafarer" || value === "sme" || value === "individual") return value;
  return null;
}

export function asCollateralType(value: unknown): CollateralType {
  if (value === "car_refinancing" || value === "real_estate") return value;
  return "none";
}

export function segmentLabel(segment: string | null | undefined): string {
  if (segment === "sme") return "SME";
  if (segment === "seafarer") return "Seafarer";
  if (segment === "individual") return "Individual";
  if (segment === "mixed") return "Mixed";
  if (segment === "Unassigned") return "Unassigned";
  return segment?.trim() ? segment : "—";
}

export function collateralLabel(type: string | null | undefined): string {
  if (type === "car_refinancing") return "Car refinancing";
  if (type === "real_estate") return "Real estate";
  if (type === "none" || !type) return "Clean";
  return type;
}

export function segmentBadgeVariant(
  segment: string | null | undefined,
): "navy" | "teal" | "warning" | "neutral" {
  if (segment === "sme") return "navy";
  if (segment === "seafarer") return "teal";
  if (segment === "individual") return "warning";
  return "neutral";
}
