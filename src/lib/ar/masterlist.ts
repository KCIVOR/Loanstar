import type { SupabaseClient } from "@supabase/supabase-js";

import { appendStatusHistory } from "@/lib/applications/status";
import { getActiveComputation } from "@/lib/csa/computation";
import { mapBorrowerRow } from "@/lib/borrowers/types";
import { generateAmortizationSchedule } from "@/lib/ar/schedule";

export async function initializeArAccount(
  supabase: SupabaseClient,
  loanApplicationId: string,
  releaseFileId: string,
  actorId?: string,
) {
  const { data: existing } = await supabase
    .from("masterlist")
    .select("id")
    .eq("loan_application_id", loanApplicationId)
    .maybeSingle();

  if (existing) {
    return { masterlistId: existing.id as string, created: false };
  }

  const { data: app } = await supabase
    .from("loan_applications")
    .select(
      `
      id,
      application_no,
      borrower_id,
      borrowers (*)
    `,
    )
    .eq("id", loanApplicationId)
    .single();

  if (!app?.borrower_id) {
    throw new Error("Application not found");
  }

  const { data: releaseFile } = await supabase
    .from("release_files")
    .select("*")
    .eq("id", releaseFileId)
    .single();

  const computation = await getActiveComputation(supabase, loanApplicationId);
  if (!computation) {
    throw new Error("Computation not found for AR initialization");
  }

  const borrowerRaw = app.borrowers;
  const borrowerRow = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
  const borrower = borrowerRow ? mapBorrowerRow(borrowerRow) : null;

  const manningAgency =
    (borrower?.manningAgency as { name?: string } | null)?.name ?? null;
  const vesselName =
    (borrower?.picWork as { vessel?: string } | null)?.vessel ?? null;

  const releaseDate =
    computation.releaseDate ?? new Date().toISOString().slice(0, 10);

  const { data: masterlist, error: mlError } = await supabase
    .from("masterlist")
    .insert({
      loan_application_id: loanApplicationId,
      borrower_id: app.borrower_id,
      release_file_id: releaseFileId,
      computation_id: computation.id,
      loan_account_no: app.application_no,
      borrower_no: borrower?.borrowerNo ?? "",
      borrower_name: borrower
        ? `${borrower.firstName} ${borrower.lastName}`.trim()
        : "Unknown",
      loan_amount: computation.principal,
      principal: computation.principal,
      total_loan: computation.totalLoan,
      net_released: computation.netReleased,
      monthly_amortization: computation.monthlyAmortization,
      terms: computation.terms,
      first_payment_date: computation.firstPaymentDate,
      release_date: releaseDate,
      loan_type_name: computation.loanTypeName,
      manning_agency: manningAgency,
      vessel_name: vesselName,
      coverage_ratio: computation.coverageRatio,
      release_path: releaseFile?.release_path ?? null,
      atm_bank_name: releaseFile?.atm_bank_name ?? null,
      atm_card_last4: releaseFile?.atm_card_last4 ?? null,
      outstanding_balance: computation.totalLoan,
      aging_bucket: "current",
      account_status: "active",
    })
    .select("id")
    .single();

  if (mlError || !masterlist) {
    throw new Error(mlError?.message ?? "Failed to create masterlist record");
  }

  const schedule = generateAmortizationSchedule({
    terms: computation.terms,
    monthlyAmortization: computation.monthlyAmortization,
    releaseDate,
    addonMonths: computation.addonMonths,
    dueDay: computation.dueDay ?? 10,
  });

  const { error: schedError } = await supabase.from("amortization_schedules").insert(
    schedule.map((row) => ({
      masterlist_id: masterlist.id,
      installment_no: row.installmentNo,
      due_date: row.dueDate,
      amount_due: row.amountDue,
      status: "pending",
    })),
  );

  if (schedError) {
    throw new Error(schedError.message);
  }

  await supabase.from("assignments").insert({
    masterlist_id: masterlist.id,
  });

  await supabase
    .from("ar_queue")
    .update({
      processed_at: new Date().toISOString(),
      masterlist_id: masterlist.id,
    })
    .eq("loan_application_id", loanApplicationId);

  await appendStatusHistory(supabase, loanApplicationId, "loan_active", {
    actorId,
    note: "Loan active — AR masterlist created",
  });

  return { masterlistId: masterlist.id as string, created: true };
}

export async function assignMasterlist(
  supabase: SupabaseClient,
  masterlistId: string,
  input: {
    portfolioId?: string | null;
    collectorUserId?: string | null;
    assignedBy: string;
  },
) {
  if (input.portfolioId) {
    const { error } = await supabase
      .from("masterlist")
      .update({ portfolio_id: input.portfolioId })
      .eq("id", masterlistId);

    if (error) throw new Error(error.message);
  }

  if (input.collectorUserId !== undefined) {
    const { error } = await supabase
      .from("assignments")
      .update({
        collector_user_id: input.collectorUserId,
        assigned_by: input.assignedBy,
        assigned_at: new Date().toISOString(),
      })
      .eq("masterlist_id", masterlistId);

    if (error) throw new Error(error.message);
  }
}

export async function assignRemedial(
  supabase: SupabaseClient,
  masterlistId: string,
  remedialUserId: string,
  confirmedBy: string,
) {
  const { data: assignment } = await supabase
    .from("assignments")
    .select("collector_user_id")
    .eq("masterlist_id", masterlistId)
    .single();

  await supabase
    .from("masterlist")
    .update({
      remedial_flag: true,
      account_status: "remedial",
      aging_bucket: "91+",
    })
    .eq("id", masterlistId);

  await supabase
    .from("assignments")
    .update({
      remedial_user_id: remedialUserId,
      remedial_assigned_at: new Date().toISOString(),
    })
    .eq("masterlist_id", masterlistId);

  await supabase.from("remedial_turnovers").insert({
    masterlist_id: masterlistId,
    from_collector_id: assignment?.collector_user_id ?? null,
    to_remedial_user_id: remedialUserId,
    confirmed_by: confirmedBy,
    confirmed_at: new Date().toISOString(),
    turnover_reason: "aging_91_plus",
  });
}

export function masterlistToExportRow(row: Record<string, unknown>) {
  return {
    loan_account_no: row.loan_account_no,
    borrower_no: row.borrower_no,
    borrower_name: row.borrower_name,
    principal: row.principal,
    total_loan: row.total_loan,
    net_released: row.net_released,
    monthly_amortization: row.monthly_amortization,
    terms: row.terms,
    first_payment_date: row.first_payment_date,
    release_date: row.release_date,
    loan_type_name: row.loan_type_name,
    manning_agency: row.manning_agency,
    vessel_name: row.vessel_name,
    outstanding_balance: row.outstanding_balance,
    aging_bucket: row.aging_bucket,
    account_status: row.account_status,
    release_path: row.release_path,
    atm_bank_name: row.atm_bank_name,
    atm_card_last4: row.atm_card_last4,
  };
}

export function masterlistToCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(masterlistToExportRow(rows[0]!));
  const lines = [
    headers.join(","),
    ...rows.map((row) => {
      const mapped = masterlistToExportRow(row);
      return headers
        .map((h) => {
          const val = mapped[h as keyof typeof mapped];
          const str = val == null ? "" : String(val);
          return str.includes(",") ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(",");
    }),
  ];
  return lines.join("\n");
}
