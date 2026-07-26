import type { SupabaseClient } from "@supabase/supabase-js";

import { readyReleaseBlocker, type ReleasePath } from "./constants";

export const EMPLOYMENT_CONTRACT_SLUG = "contract";
export const EMPLOYMENT_CONTRACT_MISSING_ERROR =
  "Employment contract must be uploaded before release";
export const EMPLOYMENT_CONTRACT_BLOCKER = "Pending: employment contract";

/** Intake-stage slugs LRA may upload late (narrow exception). */
export const LRA_INTAKE_UPLOAD_ALLOWLIST = [EMPLOYMENT_CONTRACT_SLUG] as const;

export function isEmploymentContractStatus(
  status: string | null | undefined,
): boolean {
  return status === "uploaded" || status === "confirmed";
}

export function assertEmploymentContractForRelease(present: boolean): void {
  if (!present) {
    throw new Error(EMPLOYMENT_CONTRACT_MISSING_ERROR);
  }
}

export function releaseBlockerForReadyRelease(
  path: ReleasePath | null,
  hasContract: boolean,
): string {
  if (!hasContract) return EMPLOYMENT_CONTRACT_BLOCKER;
  return readyReleaseBlocker(path);
}

export function assertLraIntakeUploadAllowed(
  stage: string,
  documentTypeSlug: string,
): void {
  if (stage !== "intake") return;
  if (
    !(LRA_INTAKE_UPLOAD_ALLOWLIST as readonly string[]).includes(
      documentTypeSlug,
    )
  ) {
    throw new Error(
      `LRA may only upload the employment contract (slug '${EMPLOYMENT_CONTRACT_SLUG}') at intake stage`,
    );
  }
}

/**
 * True when the application has an intake-stage employment contract
 * in uploaded or confirmed status.
 */
export async function hasEmploymentContractUploaded(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<boolean> {
  const { data: docType, error: typeError } = await supabase
    .from("document_types")
    .select("id")
    .eq("slug", EMPLOYMENT_CONTRACT_SLUG)
    .maybeSingle();

  if (typeError) {
    throw new Error(typeError.message);
  }
  if (!docType?.id) {
    return false;
  }

  const { data, error } = await supabase
    .from("documents")
    .select("status")
    .eq("loan_application_id", applicationId)
    .eq("document_type_id", docType.id)
    .eq("stage", "intake")
    .in("status", ["uploaded", "confirmed"])
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return isEmploymentContractStatus(data?.status as string | undefined);
}
