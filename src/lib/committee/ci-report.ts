import {
  normalizeCmInspection,
  normalizeRemInspection,
  type CmInspection,
  type RemInspection,
} from "@/lib/cig/collateral-inspection";

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
    cmInspection: row.cm_inspection != null ? normalizeCmInspection(row.cm_inspection) : null,
    remInspection: row.rem_inspection != null ? normalizeRemInspection(row.rem_inspection) : null,
  };
}
