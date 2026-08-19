import type { CmInspection, RemInspection } from "@/lib/cig/collateral-inspection";

export type CommitteeCollateralType = "none" | "car_refinancing" | "real_estate";

export function resolveCommitteeCollateralType(
  value: string | null | undefined,
): CommitteeCollateralType {
  return value === "car_refinancing" || value === "real_estate" ? value : "none";
}

export function mapCommitteeCollateralInspections(row: {
  cm_inspection?: unknown | null;
  rem_inspection?: unknown | null;
}): {
  cmInspection: CmInspection | null;
  remInspection: RemInspection | null;
} {
  return {
    cmInspection: (row.cm_inspection as CmInspection) ?? null,
    remInspection: (row.rem_inspection as RemInspection) ?? null,
  };
}
