import type { SupabaseClient } from "@supabase/supabase-js";

import { appendStatusHistory } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { discloseTerms, witnessSignComputation } from "@/lib/negotiation/service";
import { notifyBorrowerForApplication } from "@/lib/notifications/write";

import { getCommitteeSize } from "./committee-size";
import {
  assertAllVotesCast,
  computeVoteTally,
  type VoteRecord,
} from "./votes";

export type FinalAction = "approve" | "deny" | "revisit" | "hold";

const COMMITTEE_DECISION_STATUSES = ["for_approval", "committee_hold"] as const;

export function assertFinalActionPreconditions(
  status: string,
  action: FinalAction,
  options?: { comment?: string; revisitRoute?: "csa" | "cig" },
): void {
  if (
    !(COMMITTEE_DECISION_STATUSES as readonly string[]).includes(status)
  ) {
    throw new Error("Application is not pending committee decision");
  }

  if (action === "hold" && status === "committee_hold") {
    throw new Error("Application is already on committee hold");
  }

  if (action === "revisit" && !options?.comment?.trim()) {
    throw new Error("Comment is required for Notice to Revisit");
  }

  if (action === "deny" && !options?.comment?.trim()) {
    throw new Error("Remarks are required when denying a loan");
  }

  if (action === "hold" && !options?.comment?.trim()) {
    throw new Error("Comment is required when placing a committee hold");
  }
}

export function resolveFinalActionStatus(action: FinalAction): string {
  switch (action) {
    case "approve":
      return "approved";
    case "deny":
      return "denied";
    case "revisit":
      return "for_revision";
    case "hold":
      return "committee_hold";
    default: {
      const _exhaustive: never = action;
      throw new Error(`Invalid action: ${_exhaustive}`);
    }
  }
}

export async function getCommitteeVotes(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<VoteRecord[]> {
  const { data, error } = await supabase
    .from("committee_votes")
    .select("id, voter_id, vote, voted_at, comment")
    .eq("loan_application_id", applicationId)
    .order("voted_at");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    voterId: row.voter_id as string,
    vote: row.vote as VoteRecord["vote"],
    votedAt: row.voted_at as string,
    comment: (row.comment as string) ?? null,
  }));
}

export async function castCommitteeVote(
  supabase: SupabaseClient,
  applicationId: string,
  voterId: string,
  vote: VoteRecord["vote"],
  comment?: string | null,
): Promise<VoteRecord[]> {
  const { error } = await supabase.from("committee_votes").upsert(
    {
      loan_application_id: applicationId,
      voter_id: voterId,
      vote,
      voted_at: new Date().toISOString(),
      comment: comment ?? null,
    },
    { onConflict: "loan_application_id,voter_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  return getCommitteeVotes(supabase, applicationId);
}

export async function getLatestCommitteeAction(
  supabase: SupabaseClient,
  applicationId: string,
) {
  const { data } = await supabase
    .from("committee_actions")
    .select("id, action, comment, acted_by, acted_at, votes_snapshot")
    .eq("loan_application_id", applicationId)
    .order("acted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id as string,
    action: data.action as FinalAction,
    comment: data.comment as string | null,
    actedBy: data.acted_by as string,
    actedAt: data.acted_at as string,
    votesSnapshot: data.votes_snapshot as VoteRecord[],
  };
}

export async function executeFinalAction(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
  action: FinalAction,
  options?: { comment?: string; revisitRoute?: "csa" | "cig" },
): Promise<{ status: string }> {
  const { data: application, error: appError } = await supabase
    .from("loan_applications")
    .select("id, status, segment")
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    throw new Error("Application not found");
  }

  assertFinalActionPreconditions(application.status, action, options);

  const votes = await getCommitteeVotes(supabase, applicationId);
  const committeeSize = await getCommitteeSize(
    application.segment as string | null,
  );
  assertAllVotesCast(votes, committeeSize);
  const tally = computeVoteTally(votes, committeeSize);

  const { data: actionRow, error: actionError } = await supabase
    .from("committee_actions")
    .insert({
      loan_application_id: applicationId,
      action,
      comment: options?.comment ?? null,
      acted_by: actorId,
      votes_snapshot: votes,
    })
    .select("id")
    .single();

  if (actionError) {
    throw new Error(actionError.message);
  }

  const newStatus = resolveFinalActionStatus(action);

  await appendStatusHistory(supabase, applicationId, newStatus, {
    actorId,
    note: options?.comment ?? `Committee final action: ${action}`,
  });

  await supabase
    .from("loan_applications")
    .update({
      blocker: null,
    })
    .eq("id", applicationId);

  if (action === "approve") {
    const { data: computation } = await supabase
      .from("computations")
      .select("id, net_released, input_amount")
      .eq("loan_application_id", applicationId)
      .eq("is_active", true)
      .maybeSingle();

    const approvedAmount = computation
      ? Number(computation.net_released ?? computation.input_amount)
      : null;

    await supabase.from("negotiations").upsert(
      {
        loan_application_id: applicationId,
        approved_amount: approvedAmount,
        current_amount: approvedAmount,
        active_computation_id: computation?.id ?? null,
        status: "pending_disclosure",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "loan_application_id" },
    );
  }

  if (action === "deny") {
    // Queues CIG's courtesy call. Denial email is sent on this Deny click
    // (see action route + attemptApplicationDeniedEmail) — not when CIG
    // marks the call done.
    const { error: noticeError } = await supabase
      .from("denial_notices")
      .upsert(
        {
          loan_application_id: applicationId,
          committee_action_id: actionRow.id,
          created_at: new Date().toISOString(),
          informed_at: null,
          informed_by: null,
        },
        { onConflict: "loan_application_id" },
      );

    if (noticeError) {
      throw new Error(noticeError.message);
    }
  }

  if (action === "revisit" && options?.revisitRoute) {
    await supabase.from("revisit_notices").insert({
      loan_application_id: applicationId,
      committee_action_id: actionRow.id,
      route_to: options.revisitRoute,
      comment: options.comment!,
    });
  }

  await writeAuditEvent({
    actorId,
    moduleSlug: "committee",
    action: "execute_trigger",
    entityType: "committee_action",
    entityId: actionRow.id,
    afterData: {
      applicationId,
      action,
      newStatus,
      tally,
      votes,
    },
  });

  if (action === "approve") {
    void notifyBorrowerForApplication(applicationId, {
      title: "Application approved",
      body: "The committee approved your loan application. Next steps will follow for disclosure and release.",
      link: "/borrower",
      kind: "application_approved",
      entityType: "loan_application",
      entityId: applicationId,
    });
  } else if (action === "deny") {
    void notifyBorrowerForApplication(applicationId, {
      title: "Application decision",
      body: "A decision was recorded on your loan application. Please check your email for the written notice.",
      link: "/borrower",
      kind: "application_denied",
      entityType: "loan_application",
      entityId: applicationId,
    });
  }

  return { status: newStatus };
}

/**
 * Committee-side fast track for a borrower with no portal account: approve,
 * disclose, and witness-sign in one click, instead of the normal three
 * separate actions across Committee → CSA (disclose) → borrower/CSA (sign).
 * Deliberately refuses to run when the borrower has a linked account — that
 * borrower must still see the disclosed terms and sign for themselves via
 * the normal executeFinalAction + discloseTerms + portal-sign path, which
 * this function never touches. Votes/majority still go through
 * executeFinalAction's own preconditions unchanged.
 */
export async function approveDiscloseAndWitnessSign(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
  options?: { comment?: string },
): Promise<{ status: string }> {
  const { data: application, error: appError } = await supabase
    .from("loan_applications")
    .select("borrowers ( user_id )")
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    throw new Error("Application not found");
  }

  const borrowerRaw = application.borrowers;
  const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
  if (borrower?.user_id) {
    throw new Error(
      "Borrower has a portal account — disclose and let them sign normally instead of fast-tracking.",
    );
  }

  const result = await executeFinalAction(supabase, applicationId, actorId, "approve", options);
  await discloseTerms(
    supabase,
    applicationId,
    actorId,
    undefined,
    "Committee approved and disclosed terms (no borrower account — fast-tracked)",
  );
  await witnessSignComputation(supabase, applicationId, actorId);

  return result;
}
