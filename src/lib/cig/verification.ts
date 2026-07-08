import type { SupabaseClient } from "@supabase/supabase-js";

export type VerificationRecord = {
  id: string;
  loanApplicationId: string;
  fieldCompletenessOk: boolean | null;
  fieldCompletenessNotes: string | null;
  picAllotmentAwareness: string | null;
  picPaymentReliability: string | null;
  picInterviewNotes: string | null;
  cmDepartureDate: string | null;
  cmSalary: number | null;
  cmPosition: string | null;
  cmContractStatus: string | null;
  cmNotes: string | null;
  characterReferencesNotes: string | null;
  finding: "positive" | "negative" | null;
  findingNotes: string | null;
  isComplete: boolean;
  completedAt: string | null;
  forwardedAt: string | null;
};

export type VerificationCompleteness = {
  complete: boolean;
  missing: string[];
};

export function mapVerificationRow(row: Record<string, unknown>): VerificationRecord {
  return {
    id: row.id as string,
    loanApplicationId: row.loan_application_id as string,
    fieldCompletenessOk:
      row.field_completeness_ok != null
        ? Boolean(row.field_completeness_ok)
        : null,
    fieldCompletenessNotes: (row.field_completeness_notes as string) ?? null,
    picAllotmentAwareness: (row.pic_allotment_awareness as string) ?? null,
    picPaymentReliability: (row.pic_payment_reliability as string) ?? null,
    picInterviewNotes: (row.pic_interview_notes as string) ?? null,
    cmDepartureDate: (row.cm_departure_date as string) ?? null,
    cmSalary: row.cm_salary != null ? Number(row.cm_salary) : null,
    cmPosition: (row.cm_position as string) ?? null,
    cmContractStatus: (row.cm_contract_status as string) ?? null,
    cmNotes: (row.cm_notes as string) ?? null,
    characterReferencesNotes: (row.character_references_notes as string) ?? null,
    finding: (row.finding as VerificationRecord["finding"]) ?? null,
    findingNotes: (row.finding_notes as string) ?? null,
    isComplete: Boolean(row.is_complete),
    completedAt: (row.completed_at as string) ?? null,
    forwardedAt: (row.forwarded_at as string) ?? null,
  };
}

function isFilled(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export async function getCigChecksComplete(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<{ complete: boolean; missing: string[] }> {
  const { data: mappings, error: mapError } = await supabase
    .from("stage_check_mapping")
    .select("check_type_id, check_types ( id, slug, name )")
    .eq("stage", "cig");

  if (mapError) {
    throw new Error(mapError.message);
  }

  const { data: recorded, error: recError } = await supabase
    .from("checks_recorded")
    .select("check_type_id, result")
    .eq("loan_application_id", applicationId)
    .eq("stage", "cig");

  if (recError) {
    throw new Error(recError.message);
  }

  const recordedResults = new Map(
    (recorded ?? []).map((row) => [row.check_type_id as string, row.result as string]),
  );

  const missing: string[] = [];
  for (const row of mappings ?? []) {
    const checkType = Array.isArray(row.check_types)
      ? row.check_types[0]
      : row.check_types;
    if (!checkType) continue;
    const result = recordedResults.get(
      (checkType.id ?? row.check_type_id) as string,
    );
    if (result !== "pass" && result !== "fail") {
      missing.push(`${checkType.name as string} check not recorded`);
    }
  }

  return { complete: missing.length === 0, missing };
}

export function assessVerificationCompleteness(
  verification: VerificationRecord | null,
  checksComplete: boolean,
  checksMissing: string[],
): VerificationCompleteness {
  const missing: string[] = [...checksMissing];

  if (!verification) {
    missing.push("Verification form not started");
    return { complete: false, missing };
  }

  if (verification.fieldCompletenessOk == null) {
    missing.push("Field completeness review required");
  }

  if (!isFilled(verification.picAllotmentAwareness)) {
    missing.push("PIC allotment awareness notes required");
  }
  if (!isFilled(verification.picPaymentReliability)) {
    missing.push("PIC payment reliability notes required");
  }

  if (!isFilled(verification.cmPosition)) {
    missing.push("Crewing manager position required");
  }
  if (!isFilled(verification.cmContractStatus)) {
    missing.push("Crewing manager contract status required");
  }
  if (!verification.cmDepartureDate) {
    missing.push("Crewing manager departure date required");
  }

  if (!isFilled(verification.characterReferencesNotes)) {
    missing.push("Character references notes required");
  }

  if (!verification.finding) {
    missing.push("Finding (positive/negative) required");
  }

  if (!checksComplete) {
    // checksMissing already added
  }

  return { complete: missing.length === 0, missing };
}

export async function getOrCreateVerification(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<VerificationRecord> {
  const { data: existing } = await supabase
    .from("verifications")
    .select("*")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  if (existing) {
    return mapVerificationRow(existing);
  }

  const { data, error } = await supabase
    .from("verifications")
    .insert({ loan_application_id: applicationId })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create verification: ${error.message}`);
  }

  return mapVerificationRow(data);
}
