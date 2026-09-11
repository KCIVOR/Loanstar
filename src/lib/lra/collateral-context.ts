import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizeCmInspection,
  normalizeRemInspection,
  type CmVehicleEntry,
  type RemPropertyEntry,
} from "@/lib/cig/collateral-inspection";

/**
 * Maps the CI (Field CI Form) collateral inspection — `vehicles[]` /
 * `properties[]`, per docs/revision-plans/ci-collateral-repeatable-entries-plan.md
 * Phase 8 — into the shape the `data-repeat="vehicles"` / `data-repeat="properties"`
 * mortgage/servicing document rows expect
 * (`deed_of_chattel_mortgage`, `real_estate_mortgage`,
 * `cancellation_of_chattel_mortgage`, `cancellation_of_real_estate_mortgage`,
 * `spa_mortgage_cancellation`, `voluntary_surrender_deed_auto`,
 * `voluntary_surrender_deed_rem`).
 *
 * Deliberately a standalone module, not merged into `template-context.ts` /
 * `release-service.ts` here: this branch was cut from `develop`, which
 * predates those files gaining `vehicles`/`properties` keys on the sibling
 * `feature/gotenberg-admin-config` branch (see that plan's memory note on
 * the branch-switch gotcha). Wiring this into `buildReleaseTemplateContext`
 * is a 2-line addition once the branches merge — call
 * `buildCollateralDocumentContext` and spread its `vehicles`/`properties`
 * into the release context, replacing the hardcoded `[]`.
 */

export type DocumentVehicleRow = {
  makeYearModel: string;
  plateNo: string;
  engineNo: string;
  chassisNo: string;
  mvFileNo: string;
  crNo: string;
  registeredOwner: string;
};

export type DocumentPropertyRow = {
  location: string;
  tctNo: string;
  areaSqm: string;
  technicalDescription: string;
};

function str(value: string | null | undefined): string {
  return value ?? "";
}

/** Pure mapper — one CmVehicleEntry -> one document table row. */
export function mapVehicleEntryToDocumentRow(entry: CmVehicleEntry): DocumentVehicleRow {
  return {
    makeYearModel: str(entry.orCrDetails?.makeYearModel),
    plateNo: str(entry.orCrDetails?.plateNumber),
    engineNo: str(entry.orCrDetails?.engineNo),
    chassisNo: str(entry.orCrDetails?.chasisNo),
    mvFileNo: str(entry.orCrDetails?.mvFile),
    crNo: str(entry.orCrDetails?.crNo),
    registeredOwner: str(entry.registration?.registeredOwner),
  };
}

/** Pure mapper — one RemPropertyEntry -> one document table row. */
export function mapPropertyEntryToDocumentRow(
  entry: RemPropertyEntry,
): DocumentPropertyRow {
  return {
    location: str(entry.legalDescription?.location),
    tctNo: str(entry.legalDescription?.tctNo),
    areaSqm:
      entry.legalDescription?.areaSqm != null ? String(entry.legalDescription.areaSqm) : "",
    technicalDescription: str(entry.legalDescription?.technicalDescription),
  };
}

export type CollateralDocumentContext = {
  vehicles: DocumentVehicleRow[];
  properties: DocumentPropertyRow[];
};

/** Pure — normalizes + maps raw JSONB (either shape) straight to document rows. */
export function buildCollateralDocumentContextFromRaw(
  cmInspectionRaw: unknown,
  remInspectionRaw: unknown,
): CollateralDocumentContext {
  const cm = normalizeCmInspection(cmInspectionRaw);
  const rem = normalizeRemInspection(remInspectionRaw);
  return {
    vehicles: (cm.vehicles ?? []).map(mapVehicleEntryToDocumentRow),
    properties: (rem.properties ?? []).map(mapPropertyEntryToDocumentRow),
  };
}

/**
 * Fetches the application's CI inspection row and maps it. One row per
 * `loan_application_id` on `verifications` (no version/active concept, unlike
 * `computations` — confirmed by reading the table's real columns before
 * writing this, not assumed).
 */
export async function loadCollateralDocumentContext(
  supabase: SupabaseClient,
  loanApplicationId: string,
): Promise<CollateralDocumentContext> {
  const { data, error } = await supabase
    .from("verifications")
    .select("cm_inspection, rem_inspection")
    .eq("loan_application_id", loanApplicationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { vehicles: [], properties: [] };

  return buildCollateralDocumentContextFromRaw(data.cm_inspection, data.rem_inspection);
}
