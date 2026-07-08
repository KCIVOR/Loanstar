import type { SupabaseClient } from "@supabase/supabase-js";

import { appendStatusHistory } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { sendEmail } from "@/lib/email/send";
import { getApplicationForStaff } from "@/lib/csa/application";

import { computeVoteTally, type VoteRecord } from "./votes";

export type FinalAction = "approve" | "deny" | "revisit" | "hold";

export async function getCommitteeVotes(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<VoteRecord[]> {
  const { data, error } = await supabase
    .from("committee_votes")
    .select("id, voter_id, vote, voted_at")
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
  }));
}

export async function castCommitteeVote(
  supabase: SupabaseClient,
  applicationId: string,
  voterId: string,
  vote: VoteRecord["vote"],
): Promise<VoteRecord[]> {
  const { error } = await supabase.from("committee_votes").upsert(
    {
      loan_application_id: applicationId,
      voter_id: voterId,
      vote,
      voted_at: new Date().toISOString(),
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
    .select("id, status")
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    throw new Error("Application not found");
  }

  if (application.status !== "for_approval") {
    throw new Error("Application is not pending committee decision");
  }

  if (action === "revisit" && !options?.comment?.trim()) {
    throw new Error("Comment is required for Notice to Revisit");
  }

  const votes = await getCommitteeVotes(supabase, applicationId);
  const tally = computeVoteTally(votes);

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

  let newStatus: string;

  switch (action) {
    case "approve":
      newStatus = "approved";
      break;
    case "deny":
      newStatus = "denied";
      break;
    case "revisit":
      newStatus = "for_revision";
      break;
    case "hold":
      newStatus = "on_hold";
      break;
    default:
      throw new Error("Invalid action");
  }

  await appendStatusHistory(supabase, applicationId, newStatus, {
    actorId,
    note: options?.comment ?? `Committee final action: ${action}`,
  });

  await supabase
    .from("loan_applications")
    .update({
      blocker: action === "hold" ? options?.comment ?? "On hold" : null,
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
    const staffApp = await getApplicationForStaff(supabase, applicationId);
    const borrowerRaw = staffApp.borrowers;
    const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;

    if (borrower?.email) {
      try {
        await sendEmail({
          to: borrower.email as string,
          templateSlug: "application_denied",
          variables: {
            borrower_name: `${borrower.first_name} ${borrower.last_name}`,
          },
        });
      } catch {
        // Email failure should not block denial; audit still records action
      }
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

  return { status: newStatus };
}
