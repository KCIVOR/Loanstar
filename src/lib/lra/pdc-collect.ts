import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReleaseFileStatus, ReleasePath } from "./constants";

export const PDC_PHYSICAL_COLLECT_BLOCKER =
  "Pending: physical PDCs not yet collected";

export const PDC_COLLECT_PATH_ERROR =
  "Physical PDC collection only applies to the With PDC path";

export const PDC_COLLECT_STATUS_ERROR =
  "Physical PDCs can only be confirmed after all release documents are signed";

export const PDC_COLLECT_EMPTY_ERROR =
  "Encode at least one PDC check before confirming physical collection";

export const PDC_COLLECT_ALREADY_ERROR =
  "Physical PDCs were already confirmed collected";

export const PDC_COLLECT_CLOSE_ERROR =
  "Confirm physical PDCs collected before closing and transmitting to Accounting";

/** Statuses after signing is complete (docs witnessed → awaiting briefing). */
export const PDC_COLLECT_ALLOWED_STATUSES: readonly ReleaseFileStatus[] = [
  "awaiting_briefing",
  "ready_release",
  "released",
] as const;

export type PdcCollectContext = {
  releasePaths: ReleasePath[] | string[] | null;
  status: ReleaseFileStatus | string;
  pdcCheckCount: number;
  pdcCollectedAt: string | null;
};

export function isPostSignForPdcCollect(
  status: ReleaseFileStatus | string,
): boolean {
  return (PDC_COLLECT_ALLOWED_STATUSES as readonly string[]).includes(status);
}

export function canConfirmPdcCollection(ctx: PdcCollectContext): boolean {
  if (!ctx.releasePaths?.includes("with_pdc")) return false;
  if (!isPostSignForPdcCollect(ctx.status)) return false;
  if (ctx.pdcCheckCount < 1) return false;
  if (ctx.pdcCollectedAt) return false;
  return true;
}

export function assertCanConfirmPdcCollection(ctx: PdcCollectContext): void {
  if (!ctx.releasePaths?.includes("with_pdc")) {
    throw new Error(PDC_COLLECT_PATH_ERROR);
  }
  if (!isPostSignForPdcCollect(ctx.status)) {
    throw new Error(PDC_COLLECT_STATUS_ERROR);
  }
  if (ctx.pdcCheckCount < 1) {
    throw new Error(PDC_COLLECT_EMPTY_ERROR);
  }
  if (ctx.pdcCollectedAt) {
    throw new Error(PDC_COLLECT_ALREADY_ERROR);
  }
}

export function closeRequiresPdcCollection(
  releasePaths: ReleasePath[] | string[] | null,
): boolean {
  return releasePaths?.includes("with_pdc") ?? false;
}

export function assertPdcCollectedForClose(input: {
  releasePaths: ReleasePath[] | string[] | null;
  pdcCollectedAt: string | null;
}): void {
  if (!closeRequiresPdcCollection(input.releasePaths)) return;
  if (!input.pdcCollectedAt) {
    throw new Error(PDC_COLLECT_CLOSE_ERROR);
  }
}

/**
 * Soft blocker only when the next LRA action is close (`released`) and
 * physical PDCs are still outstanding — avoids overwriting briefing /
 * employment-contract blockers earlier in the pipeline.
 */
export function maybePdcCollectBlocker(input: {
  releasePaths: ReleasePath[] | string[] | null;
  status: ReleaseFileStatus | string;
  pdcCollectedAt: string | null;
}): string | null {
  if (!input.releasePaths?.includes("with_pdc")) return null;
  if (input.status !== "released") return null;
  if (input.pdcCollectedAt) return null;
  return PDC_PHYSICAL_COLLECT_BLOCKER;
}

/**
 * Confirm physical PDCs were collected from the borrower.
 * Encode remains a separate earlier step — this only records collection.
 */
export async function confirmPdcCollected(
  supabase: SupabaseClient,
  releaseFileId: string,
  actorId: string,
) {
  const { data: file, error: fileError } = await supabase
    .from("release_files")
    .select(
      "id, loan_application_id, release_paths, status, pdc_collected_at, pdc_collected_by",
    )
    .eq("id", releaseFileId)
    .single();

  if (fileError || !file) {
    throw new Error("Release file not found");
  }

  const { count, error: countError } = await supabase
    .from("pdc_checks")
    .select("id", { count: "exact", head: true })
    .eq("release_file_id", releaseFileId);

  if (countError) {
    throw new Error(countError.message);
  }

  assertCanConfirmPdcCollection({
    releasePaths: (file.release_paths as string[] | null) ?? null,
    status: file.status as string,
    pdcCheckCount: count ?? 0,
    pdcCollectedAt: (file.pdc_collected_at as string | null) ?? null,
  });

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("release_files")
    .update({
      pdc_collected_at: now,
      pdc_collected_by: actorId,
      updated_at: now,
    })
    .eq("id", releaseFileId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  // Clear the close-stage pending blocker when collection completes at released.
  if (file.status === "released") {
    await supabase
      .from("loan_applications")
      .update({ blocker: "Released" })
      .eq("id", file.loan_application_id)
      .eq("blocker", PDC_PHYSICAL_COLLECT_BLOCKER);
  }

  return {
    pdcCollectedAt: now,
    pdcCollectedBy: actorId,
    releaseFileId,
    loanApplicationId: file.loan_application_id as string,
  };
}
