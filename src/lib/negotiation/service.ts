import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

import { appendStatusHistory } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { getActiveComputation, persistComputation } from "@/lib/csa/computation";
import type { InputMode } from "@/lib/computation/types";
import { createServiceClient } from "@/lib/supabase/server";

export type NegotiationRecord = {
  id: string;
  loanApplicationId: string;
  approvedAmount: number | null;
  currentAmount: number | null;
  lastCounterAmount: number | null;
  lastCounterBy: string | null;
  activeComputationId: string | null;
  status: string;
  disclosedAt: string | null;
  notes: string | null;
};

export type NegotiationMessage = {
  id: string;
  loanApplicationId: string;
  authorId: string;
  authorRole: "borrower" | "committee";
  kind: "message" | "offer" | "accept";
  body: string | null;
  amount: number | null;
  createdAt: string;
};

export function mapNegotiationMessageRow(
  row: Record<string, unknown>,
): NegotiationMessage {
  return {
    id: row.id as string,
    loanApplicationId: row.loan_application_id as string,
    authorId: row.author_id as string,
    authorRole: row.author_role as "borrower" | "committee",
    kind: row.kind as "message" | "offer",
    body: (row.body as string) ?? null,
    amount: row.amount != null ? Number(row.amount) : null,
    createdAt: row.created_at as string,
  };
}

export async function listNegotiationMessages(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<NegotiationMessage[]> {
  const { data, error } = await supabase
    .from("negotiation_messages")
    .select("*")
    .eq("loan_application_id", applicationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapNegotiationMessageRow);
}

/** `profiles` RLS only allows reading your own row (or auth_admin), so a
 * viewer's session client can't resolve the OTHER party's display name —
 * same gap fixed for CIG's CSA-intake summary. Batch-resolve via the service
 * client instead. */
export async function withAuthorNames(
  messages: NegotiationMessage[],
): Promise<(NegotiationMessage & { authorName: string | null })[]> {
  if (messages.length === 0) return [];

  const ids = [...new Set(messages.map((m) => m.authorId))];
  const service = createServiceClient();
  const { data: profiles } = await service
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]),
  );

  return messages.map((m) => ({ ...m, authorName: nameById.get(m.authorId) ?? null }));
}

export async function postNegotiationMessage(
  supabase: SupabaseClient,
  applicationId: string,
  authorId: string,
  authorRole: "borrower" | "committee",
  body: string,
): Promise<NegotiationMessage> {
  const { data, error } = await supabase
    .from("negotiation_messages")
    .insert({
      loan_application_id: applicationId,
      author_id: authorId,
      author_role: authorRole,
      kind: "message",
      body,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapNegotiationMessageRow(data);
}

/** System-logged entry alongside an amount-bearing negotiation event
 * (counter-offer, override, or acceptance), with an optional note explaining
 * it — same feed as postNegotiationMessage so the log reads as one
 * continuous conversation. "offer" = proposing a new number; "accept" =
 * agreeing to a number without changing it (borrower signing disclosed
 * terms, or Committee accepting the borrower's counter-offer). */
async function logOfferMessage(
  supabase: SupabaseClient,
  applicationId: string,
  authorId: string,
  authorRole: "borrower" | "committee",
  amount: number,
  body?: string,
  kind: "offer" | "accept" = "offer",
): Promise<void> {
  const { error } = await supabase.from("negotiation_messages").insert({
    loan_application_id: applicationId,
    author_id: authorId,
    author_role: authorRole,
    kind,
    amount,
    body: body?.trim() ? body.trim() : null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/** Public entry point for logging a plain acceptance (no amount change) —
 * used by the borrower's own "sign disclosed terms" action, called directly
 * from the API route rather than through recordCounterOffer/override. */
export async function logAcceptance(
  supabase: SupabaseClient,
  applicationId: string,
  authorId: string,
  authorRole: "borrower" | "committee",
  amount: number,
  body?: string,
): Promise<void> {
  await logOfferMessage(supabase, applicationId, authorId, authorRole, amount, body, "accept");
}

export function mapNegotiationRow(row: Record<string, unknown>): NegotiationRecord {
  return {
    id: row.id as string,
    loanApplicationId: row.loan_application_id as string,
    approvedAmount:
      row.approved_amount != null ? Number(row.approved_amount) : null,
    currentAmount: row.current_amount != null ? Number(row.current_amount) : null,
    lastCounterAmount:
      row.last_counter_amount != null ? Number(row.last_counter_amount) : null,
    lastCounterBy: (row.last_counter_by as string) ?? null,
    activeComputationId: (row.active_computation_id as string) ?? null,
    status: row.status as string,
    disclosedAt: (row.disclosed_at as string) ?? null,
    notes: (row.notes as string) ?? null,
  };
}

export async function getNegotiation(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<NegotiationRecord | null> {
  const { data, error } = await supabase
    .from("negotiations")
    .select("*")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapNegotiationRow(data) : null;
}

export async function discloseTerms(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
  notes?: string,
  statusNote = "CSA disclosed approved terms",
) {
  const negotiation = await getNegotiation(supabase, applicationId);
  if (!negotiation) {
    throw new Error("No negotiation record — application must be approved first");
  }

  const now = new Date().toISOString();

  // Intake-era signatures must not count as post-approval acceptance.
  // Borrower confirms again after CSA discloses committee-approved terms.
  //
  // Privileged clear: computations_update RLS requires signed_at IS NULL and
  // CSA-editable application statuses, so the CSA user client silently no-ops
  // on already-signed rows after approval. Same pattern as queueForLra.
  const admin = createServiceClient();
  const clearPayload = {
    signed_at: null,
    signed_by: null,
    signature_hash: null,
    witnessed_by: null,
  };
  const { error: clearError } = negotiation.activeComputationId
    ? await admin
        .from("computations")
        .update(clearPayload)
        .eq("id", negotiation.activeComputationId)
    : await admin
        .from("computations")
        .update(clearPayload)
        .eq("loan_application_id", applicationId)
        .eq("is_active", true);

  if (clearError) {
    throw new Error(clearError.message);
  }

  const { error: negotiationError } = await admin
    .from("negotiations")
    .update({
      disclosed_at: now,
      disclosed_by: actorId,
      status: "awaiting_signature",
      notes: notes ?? negotiation.notes,
      updated_at: now,
    })
    .eq("loan_application_id", applicationId);

  if (negotiationError) {
    throw new Error(negotiationError.message);
  }

  await appendStatusHistory(admin, applicationId, "awaiting_confirmation", {
    actorId,
    note: statusNote,
  });

  return getNegotiation(supabase, applicationId);
}

export async function recordCounterOffer(
  supabase: SupabaseClient,
  applicationId: string,
  amount: number,
  counterBy: "borrower" | "csa",
  actorId: string,
  message?: string,
) {
  const negotiation = await getNegotiation(supabase, applicationId);
  if (!negotiation) {
    throw new Error("Negotiation not found");
  }

  if (
    counterBy === "borrower" &&
    negotiation.status !== "awaiting_signature" &&
    negotiation.status !== "negotiating"
  ) {
    throw new Error(
      "Counter-offer is only available after CSA discloses approved terms",
    );
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("negotiations")
    .update({
      last_counter_amount: amount,
      last_counter_by: counterBy,
      current_amount: amount,
      status: "negotiating",
      updated_at: now,
    })
    .eq("loan_application_id", applicationId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await appendStatusHistory(supabase, applicationId, "negotiating_terms", {
    actorId,
    note: `Counter-offer: ${amount.toFixed(2)} by ${counterBy}`,
  });

  if (counterBy === "borrower") {
    await logOfferMessage(supabase, applicationId, actorId, "borrower", amount, message);
  }

  return getNegotiation(supabase, applicationId);
}

type OverrideInput = {
  amount: number;
  inputMode: InputMode;
  terms: number;
  addonMonths?: number;
  loanTypeId?: string;
};

/** Shared by both committee override paths: resolve the loan type, persist a new computation snapshot, and clear any prior signature since the amount changed. */
async function persistOverrideComputation(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
  input: OverrideInput,
) {
  const { data: existingComp } = await supabase
    .from("computations")
    .select("loan_type_id, pf_rate, interest_rate, security_fee_rate, terms, addon_months, input_mode")
    .eq("loan_application_id", applicationId)
    .eq("is_active", true)
    .maybeSingle();

  let loanType: {
    id: string;
    name: string;
    pf_rate: number;
    interest_rate: number;
  };

  if (input.loanTypeId) {
    const { data, error } = await supabase
      .from("loan_types")
      .select("id, name, pf_rate, interest_rate")
      .eq("id", input.loanTypeId)
      .single();
    if (error || !data) throw new Error("Invalid loan type");
    loanType = data;
  } else if (existingComp?.loan_type_id) {
    const { data, error } = await supabase
      .from("loan_types")
      .select("id, name, pf_rate, interest_rate")
      .eq("id", existingComp.loan_type_id)
      .single();
    if (error || !data) throw new Error("Loan type not found");
    loanType = data;
  } else {
    throw new Error("Loan type required for override");
  }

  const { data: appRow } = await supabase
    .from("loan_applications")
    .select("segment")
    .eq("id", applicationId)
    .maybeSingle();
  const segment = appRow?.segment === "sme" ? "sme" : "seafarer";

  const saved = await persistComputation(supabase, {
    loanApplicationId: applicationId,
    segment,
    loanTypeId: loanType.id,
    loanTypeName: loanType.name,
    inputMode: input.inputMode,
    amount: input.amount,
    terms: input.terms,
    addonMonths:
      input.addonMonths ??
      existingComp?.addon_months ??
      (segment === "sme" ? 0 : 2),
    pfRate: Number(loanType.pf_rate),
    interestRate: Number(loanType.interest_rate),
    securityFeeRate:
      segment === "sme"
        ? 0
        : existingComp?.security_fee_rate != null
          ? Number(existingComp.security_fee_rate)
          : Number(loanType.interest_rate),
    computedBy: actorId,
  });

  // Clear signature on new snapshot — borrower must re-sign
  await supabase
    .from("computations")
    .update({
      signed_at: null,
      signed_by: null,
      signature_hash: null,
    })
    .eq("id", saved.computation.id);

  return saved;
}

export async function committeeOverrideAmount(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
  input: OverrideInput,
  message?: string,
) {
  const saved = await persistOverrideComputation(supabase, applicationId, actorId, input);

  const now = new Date().toISOString();

  await supabase
    .from("negotiations")
    .update({
      current_amount: saved.computation.netReleased,
      active_computation_id: saved.computation.id,
      status: "awaiting_signature",
      updated_at: now,
    })
    .eq("loan_application_id", applicationId);

  await appendStatusHistory(supabase, applicationId, "awaiting_confirmation", {
    actorId,
    note: `Committee override — new amount ${saved.computation.netReleased.toFixed(2)}`,
  });

  await logOfferMessage(
    supabase,
    applicationId,
    actorId,
    "committee",
    saved.computation.netReleased,
    message,
  );

  return saved;
}

/**
 * Committee adjusting the amount before the initial decision — status is
 * still for_approval, so there's no negotiation record yet and no status
 * change. discloseTerms() clears the signature again after Approve regardless,
 * so this just keeps the displayed "signed" state honest in the meantime.
 */
export async function committeeAdjustPreDecision(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
  input: OverrideInput,
) {
  return persistOverrideComputation(supabase, applicationId, actorId, input);
}

export async function queueForLra(
  _supabase: SupabaseClient,
  applicationId: string,
  computationId: string,
  actorId: string,
  note = "Borrower signed computation — queued for LRA",
) {
  // Privileged workflow side-effects: borrowers can sign via borrower_portal,
  // but release_queue upsert + status → lra_pending are blocked by RLS for
  // that role (insert-only on queue; applications WITH CHECK only allows
  // CSA-editable statuses). Use service role after ownership was already
  // verified by the caller.
  const admin = createServiceClient();

  const { error: queueError } = await admin.from("release_queue").upsert(
    {
      loan_application_id: applicationId,
      computation_id: computationId,
      queued_at: new Date().toISOString(),
      queued_by: actorId,
    },
    { onConflict: "loan_application_id" },
  );

  if (queueError) {
    throw new Error(queueError.message);
  }

  const { error: negotiationError } = await admin
    .from("negotiations")
    .update({
      status: "signed",
      updated_at: new Date().toISOString(),
    })
    .eq("loan_application_id", applicationId);

  if (negotiationError) {
    throw new Error(negotiationError.message);
  }

  await appendStatusHistory(admin, applicationId, "lra_pending", {
    actorId,
    note,
  });
}

/**
 * CSA in-branch witness-sign — covers a borrower who has no portal account
 * (or is simply on-site and it's faster than handing them the portal).
 * Mirrors the borrower's own sign action in
 * api/borrower/applications/[id]/computation/route.ts, but `signed_by` still
 * records the borrower (their linked user_id, or null for a walk-in) — the
 * CSA staffer performing the witness action is recorded separately in
 * `witnessed_by`, never in `signed_by`. Same two checkpoints as the borrower
 * path: intake-stage first signature (no negotiation row yet) and
 * post-disclosure signature (negotiation.status === "awaiting_signature",
 * which also queues the file for LRA).
 */
export async function witnessSignComputation(
  supabase: SupabaseClient,
  applicationId: string,
  witnessedById: string,
) {
  const negotiation = await getNegotiation(supabase, applicationId);

  if (negotiation && negotiation.status !== "awaiting_signature") {
    throw new Error("Approved terms must be disclosed before you can sign");
  }

  const computation = await getActiveComputation(supabase, applicationId);
  if (!computation) {
    throw new Error("No computation available to sign");
  }

  const admin = createServiceClient();

  if (computation.signedAt) {
    // Same stale-signature situation the borrower route guards against: RLS
    // can leave signed_at set from an intake-era signature while negotiation
    // has since moved back to awaiting_signature after disclose. Clear and
    // continue rather than reject.
    if (negotiation?.status === "awaiting_signature") {
      const { error: clearError } = await admin
        .from("computations")
        .update({ signed_at: null, signed_by: null, signature_hash: null, witnessed_by: null })
        .eq("id", computation.id);
      if (clearError) {
        throw new Error(clearError.message);
      }
    } else {
      throw new Error("Computation already signed");
    }
  }

  const { data: appRow } = await supabase
    .from("loan_applications")
    .select("borrowers ( user_id )")
    .eq("id", applicationId)
    .single();
  const borrowerRaw = appRow?.borrowers;
  const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;

  const signatureHash = createHash("sha256")
    .update(JSON.stringify(computation))
    .digest("hex");
  const signedAt = new Date().toISOString();

  const { error: updateError } = await admin
    .from("computations")
    .update({
      signed_at: signedAt,
      signed_by: (borrower?.user_id as string | null) ?? null,
      witnessed_by: witnessedById,
      signature_hash: signatureHash,
    })
    .eq("id", computation.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (negotiation && negotiation.status === "awaiting_signature") {
    await queueForLra(
      supabase,
      applicationId,
      computation.id,
      witnessedById,
      "CSA witness-signed computation in-branch — queued for LRA",
    );
  }

  await writeAuditEvent({
    actorId: witnessedById,
    moduleSlug: "computation",
    action: "execute_trigger",
    entityType: "computation",
    entityId: computation.id,
    afterData: {
      applicationId,
      signatureHash,
      trigger: "csa_witness_sign_computation",
    },
  });

  return { signedAt, witnessedBy: witnessedById };
}

/**
 * Committee accepts the borrower's counter-offer as-is — Committee is the
 * final approver here, not the borrower: no separate borrower e-signature is
 * collected for this recalculated computation. The acceptance itself is
 * logged (negotiation_messages "offer" entry + status_history note) so
 * there's still an audit trail of who accepted what and when, even though
 * there's no signatureHash the way a borrower's own sign produces.
 * Reuses the borrower's own inputMode/terms from the last active computation
 * — the borrower only ever proposes a target net-release number, not a full
 * recalculated breakdown, so Committee doesn't need to re-supply anything.
 */
export async function committeeAcceptCounterOffer(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
) {
  const negotiation = await getNegotiation(supabase, applicationId);
  if (!negotiation || negotiation.lastCounterAmount == null) {
    throw new Error("No borrower counter-offer to accept");
  }

  const { data: existingComp, error: existingCompError } = await supabase
    .from("computations")
    .select("input_mode, terms, loan_type_id")
    .eq("loan_application_id", applicationId)
    .eq("is_active", true)
    .maybeSingle();

  if (existingCompError || !existingComp || !existingComp.loan_type_id) {
    throw new Error("No active computation to base acceptance on");
  }

  const saved = await persistOverrideComputation(supabase, applicationId, actorId, {
    amount: negotiation.lastCounterAmount,
    inputMode: existingComp.input_mode as InputMode,
    terms: Number(existingComp.terms),
    loanTypeId: existingComp.loan_type_id as string,
  });

  const { error: negotiationUpdateError } = await supabase
    .from("negotiations")
    .update({
      current_amount: saved.computation.netReleased,
      active_computation_id: saved.computation.id,
      updated_at: new Date().toISOString(),
    })
    .eq("loan_application_id", applicationId);

  if (negotiationUpdateError) {
    throw new Error(negotiationUpdateError.message);
  }

  await logAcceptance(
    supabase,
    applicationId,
    actorId,
    "committee",
    saved.computation.netReleased,
    "Accepted the borrower's counter-offer — proceeding without a separate borrower signature.",
  );

  await queueForLra(
    supabase,
    applicationId,
    saved.computation.id,
    actorId,
    `Committee accepted borrower's counter-offer (₱${saved.computation.netReleased.toFixed(2)}) — queued for LRA, no separate borrower signature`,
  );

  return saved;
}

export async function completeRevision(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
  expectedRoute: "csa" | "cig",
) {
  const { data: app, error } = await supabase
    .from("loan_applications")
    .select("status")
    .eq("id", applicationId)
    .single();

  if (error || !app || app.status !== "for_revision") {
    throw new Error("Application is not awaiting revision");
  }

  const { data: notice } = await supabase
    .from("revisit_notices")
    .select("id, route_to")
    .eq("loan_application_id", applicationId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!notice || notice.route_to !== expectedRoute) {
    throw new Error("No open revisit notice for this route");
  }

  await supabase
    .from("revisit_notices")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", notice.id);

  await appendStatusHistory(supabase, applicationId, "for_approval", {
    actorId,
    note: "Revision complete — returned to Committee",
  });

  return { status: "for_approval" };
}
