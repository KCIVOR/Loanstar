import type { SupabaseClient } from "@supabase/supabase-js";

import { appendStatusHistory } from "@/lib/applications/status";
import { persistComputation } from "@/lib/csa/computation";
import type { InputMode } from "@/lib/computation/types";

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
) {
  const negotiation = await getNegotiation(supabase, applicationId);
  if (!negotiation) {
    throw new Error("No negotiation record — application must be approved first");
  }

  const now = new Date().toISOString();

  await supabase
    .from("negotiations")
    .update({
      disclosed_at: now,
      disclosed_by: actorId,
      status: "awaiting_signature",
      notes: notes ?? negotiation.notes,
      updated_at: now,
    })
    .eq("loan_application_id", applicationId);

  await appendStatusHistory(supabase, applicationId, "awaiting_confirmation", {
    actorId,
    note: "CSA disclosed approved terms",
  });

  return getNegotiation(supabase, applicationId);
}

export async function recordCounterOffer(
  supabase: SupabaseClient,
  applicationId: string,
  amount: number,
  counterBy: "borrower" | "csa",
  actorId: string,
) {
  const negotiation = await getNegotiation(supabase, applicationId);
  if (!negotiation) {
    throw new Error("Negotiation not found");
  }

  const now = new Date().toISOString();

  await supabase
    .from("negotiations")
    .update({
      last_counter_amount: amount,
      last_counter_by: counterBy,
      current_amount: amount,
      status: "negotiating",
      updated_at: now,
    })
    .eq("loan_application_id", applicationId);

  await appendStatusHistory(supabase, applicationId, "negotiating_terms", {
    actorId,
    note: `Counter-offer: ${amount.toFixed(2)} by ${counterBy}`,
  });

  return getNegotiation(supabase, applicationId);
}

export async function committeeOverrideAmount(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
  input: {
    amount: number;
    inputMode: InputMode;
    terms: number;
    addonMonths?: number;
    loanTypeId?: string;
  },
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

  const saved = await persistComputation(supabase, {
    loanApplicationId: applicationId,
    loanTypeId: loanType.id,
    loanTypeName: loanType.name,
    inputMode: input.inputMode,
    amount: input.amount,
    terms: input.terms,
    addonMonths: input.addonMonths ?? existingComp?.addon_months ?? 2,
    pfRate: Number(loanType.pf_rate),
    interestRate: Number(loanType.interest_rate),
    securityFeeRate:
      existingComp?.security_fee_rate != null
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

  return saved;
}

export async function queueForLra(
  supabase: SupabaseClient,
  applicationId: string,
  computationId: string,
  actorId: string,
) {
  const { error: queueError } = await supabase.from("release_queue").upsert(
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

  await supabase
    .from("negotiations")
    .update({
      status: "signed",
      updated_at: new Date().toISOString(),
    })
    .eq("loan_application_id", applicationId);

  await appendStatusHistory(supabase, applicationId, "lra_pending", {
    actorId,
    note: "Borrower signed computation — queued for LRA",
  });
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
