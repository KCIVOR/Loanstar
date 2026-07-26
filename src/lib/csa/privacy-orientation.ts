import type { SupabaseClient } from "@supabase/supabase-js";

/** Exact missing string shown in CSA endorse readiness. */
export const PRIVACY_ORIENTATION_MISSING =
  "Data Privacy Act orientation not recorded";

export type PrivacyOrientationCompleteness = {
  complete: boolean;
  missing: string[];
};

export function assessPrivacyOrientation(
  privacyOrientationAt: string | null | undefined,
): PrivacyOrientationCompleteness {
  if (
    privacyOrientationAt == null ||
    String(privacyOrientationAt).trim().length === 0
  ) {
    return { complete: false, missing: [PRIVACY_ORIENTATION_MISSING] };
  }
  return { complete: true, missing: [] };
}

/**
 * Record that CSA gave the Data Privacy Act orientation to the client.
 * Idempotent: if already recorded, returns existing values without overwrite.
 * Caller must enforce assertCsaCanEdit / editable status.
 */
export async function recordPrivacyOrientation(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
) {
  const { data, error } = await supabase
    .from("loan_applications")
    .select("id, privacy_orientation_at, privacy_orientation_by")
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new Error("Application not found");
  }

  const existingAt = (data.privacy_orientation_at as string | null) ?? null;
  const existingBy = (data.privacy_orientation_by as string | null) ?? null;

  if (existingAt) {
    return {
      privacyOrientationAt: existingAt,
      privacyOrientationBy: existingBy,
      alreadyRecorded: true as const,
    };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("loan_applications")
    .update({
      privacy_orientation_at: now,
      privacy_orientation_by: actorId,
      updated_at: now,
    })
    .eq("id", applicationId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    privacyOrientationAt: now,
    privacyOrientationBy: actorId,
    alreadyRecorded: false as const,
  };
}
