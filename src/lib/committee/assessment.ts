import type { SupabaseClient } from "@supabase/supabase-js";

export type CommitteeAssessment = {
  id: string;
  loanApplicationId: string;
  characterNotes: string | null;
  capacityNotes: string | null;
  capitalNotes: string | null;
  conditionsNotes: string | null;
  updatedBy: string | null;
  updatedAt: string;
};

function mapRow(row: Record<string, unknown>): CommitteeAssessment {
  return {
    id: row.id as string,
    loanApplicationId: row.loan_application_id as string,
    characterNotes: (row.character_notes as string) ?? null,
    capacityNotes: (row.capacity_notes as string) ?? null,
    capitalNotes: (row.capital_notes as string) ?? null,
    conditionsNotes: (row.conditions_notes as string) ?? null,
    updatedBy: (row.updated_by as string) ?? null,
    updatedAt: row.updated_at as string,
  };
}

/** The 4 Cs — Character, Capacity, Capital, Conditions — informal deliberation notes, not a decision gate. */
export async function getCommitteeAssessment(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<CommitteeAssessment | null> {
  const { data, error } = await supabase
    .from("committee_assessments")
    .select("*")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapRow(data) : null;
}

export type AssessmentPatch = Partial<{
  characterNotes: string | null;
  capacityNotes: string | null;
  capitalNotes: string | null;
  conditionsNotes: string | null;
}>;

export async function saveCommitteeAssessment(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
  patch: AssessmentPatch,
): Promise<CommitteeAssessment> {
  const row: Record<string, unknown> = {
    loan_application_id: applicationId,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  };
  if (patch.characterNotes !== undefined) row.character_notes = patch.characterNotes;
  if (patch.capacityNotes !== undefined) row.capacity_notes = patch.capacityNotes;
  if (patch.capitalNotes !== undefined) row.capital_notes = patch.capitalNotes;
  if (patch.conditionsNotes !== undefined) row.conditions_notes = patch.conditionsNotes;

  const { data, error } = await supabase
    .from("committee_assessments")
    .upsert(row, { onConflict: "loan_application_id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to save assessment: ${error.message}`);
  }

  return mapRow(data);
}
