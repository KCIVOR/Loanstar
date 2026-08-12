import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApplicationFormCompleteness } from "./application-form-completeness";
import { PRIVACY_ORIENTATION_MISSING } from "./privacy-orientation";

export const INITIAL_INTERVIEW_MISSING = "Initial interview not recorded";
export const INITIAL_INTERVIEW_NOTES_REQUIRED =
  "Initial interview notes required";
export const NCL_NOT_RECORDED = "NCL check not recorded";
export const SME_DUPLICATION_NOT_RECORDED =
  "SME duplication check not recorded";
export const INITIAL_INTERVIEW_COMPUTATION_ERROR =
  "Initial interview must be recorded before preparing the loan computation";

function screeningNotRecordedMessage(
  segment?: string | null,
): string {
  return segment === "sme" ? SME_DUPLICATION_NOT_RECORDED : NCL_NOT_RECORDED;
}

export type InitialInterviewCompleteness = {
  complete: boolean;
  missing: string[];
};

export function assessInitialInterview(input: {
  at: string | null | undefined;
  notes: string | null | undefined;
}): InitialInterviewCompleteness {
  const notesOk = Boolean(input.notes?.trim());
  const atOk = Boolean(input.at && String(input.at).trim());
  if (atOk && notesOk) {
    return { complete: true, missing: [] };
  }
  return { complete: false, missing: [INITIAL_INTERVIEW_MISSING] };
}

export type RecordInterviewPrereqContext = {
  privacyOrientationAt: string | null | undefined;
  formCompleteness: ApplicationFormCompleteness;
  nclRecorded: boolean;
  notes: string | null | undefined;
  /** Defaults to Seafarer (NCL) when omitted. */
  segment?: string | null;
};

/**
 * Pure gate for recording/confirming the initial interview.
 * Throws Error whose message is a newline-joined missing list for API 400.
 */
export function assertCanRecordInitialInterview(
  ctx: RecordInterviewPrereqContext,
): void {
  const missing: string[] = [];

  if (
    ctx.privacyOrientationAt == null ||
    String(ctx.privacyOrientationAt).trim().length === 0
  ) {
    missing.push(PRIVACY_ORIENTATION_MISSING);
  }
  if (!ctx.formCompleteness.complete) {
    missing.push(...ctx.formCompleteness.missing);
  }
  if (!ctx.nclRecorded) {
    missing.push(screeningNotRecordedMessage(ctx.segment));
  }
  if (!ctx.notes?.trim()) {
    missing.push(INITIAL_INTERVIEW_NOTES_REQUIRED);
  }

  if (missing.length > 0) {
    throw new Error(missing.join("\n"));
  }
}

export function listInterviewRecordPrerequisites(
  ctx: Omit<RecordInterviewPrereqContext, "notes">,
): string[] {
  const missing: string[] = [];
  if (
    ctx.privacyOrientationAt == null ||
    String(ctx.privacyOrientationAt).trim().length === 0
  ) {
    missing.push(PRIVACY_ORIENTATION_MISSING);
  }
  if (!ctx.formCompleteness.complete) {
    missing.push(...ctx.formCompleteness.missing);
  }
  if (!ctx.nclRecorded) {
    missing.push(screeningNotRecordedMessage(ctx.segment));
  }
  return missing;
}

export function assertInterviewRecordedForComputation(
  initialInterviewAt: string | null | undefined,
): void {
  if (
    initialInterviewAt == null ||
    String(initialInterviewAt).trim().length === 0
  ) {
    throw new Error(INITIAL_INTERVIEW_COMPUTATION_ERROR);
  }
}

/**
 * Confirm/update initial interview notes.
 * First confirm sets at/by; later editable updates change notes only.
 */
export async function recordInitialInterview(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
  notes: string,
) {
  const trimmed = notes.trim();
  if (!trimmed) {
    throw new Error(INITIAL_INTERVIEW_NOTES_REQUIRED);
  }

  const { data, error } = await supabase
    .from("loan_applications")
    .select(
      "id, initial_interview_at, initial_interview_by, initial_interview_notes",
    )
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new Error("Application not found");
  }

  const existingAt = (data.initial_interview_at as string | null) ?? null;
  const existingBy = (data.initial_interview_by as string | null) ?? null;
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = {
    initial_interview_notes: trimmed,
    updated_at: now,
  };

  if (!existingAt) {
    patch.initial_interview_at = now;
    patch.initial_interview_by = actorId;
  }

  const { error: updateError } = await supabase
    .from("loan_applications")
    .update(patch)
    .eq("id", applicationId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    initialInterviewAt: existingAt ?? now,
    initialInterviewBy: existingAt ? existingBy : actorId,
    initialInterviewNotes: trimmed,
    alreadyRecorded: Boolean(existingAt),
  };
}
