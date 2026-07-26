import type { SupabaseClient } from "@supabase/supabase-js";

import { mapBorrowerRow, type BorrowerRow } from "@/lib/borrowers/types";
import { nextOpenInstallment, type ScheduleLite } from "@/lib/collector/desk";
import { renderAndStore, type RenderedDocumentResult } from "@/lib/documents/render-store";

import {
  COMPANY_NAME,
  addDays,
  daysBetween,
  formatDate,
  formatMoney,
  joinAddress,
  pesosInWords,
} from "./shared";

/** The escalation ladder. One template body serves all three via `isFinal`. */
export type DemandStage = "first_reminder" | "second_demand" | "final_demand";

const STAGE_LABEL: Record<DemandStage, string> = {
  first_reminder: "FIRST REMINDER",
  second_demand: "SECOND DEMAND",
  final_demand: "FINAL DEMAND",
};

export function isDemandStage(value: string): value is DemandStage {
  return value === "first_reminder" || value === "second_demand" || value === "final_demand";
}

export type DemandLetterInput = {
  borrowerName: string;
  address: string;
  loanAccountNo: string;
  /** Unpaid principal+interest balance. */
  outstandingBalance: number;
  /** Accrued penalties / charges. */
  penaltyAmount: number;
  daysPastDue: number;
  /** The installment due date that triggered the demand (MM/DD/YYYY). */
  dueDate: string;
  /** Deadline to settle (MM/DD/YYYY). */
  paymentDeadline: string;
  demandStage: DemandStage;
  todayDate: string;
};

/**
 * Pure merge-context builder for the demand_letter template. Kept side-effect
 * free so the amount math + stage/flag mapping are unit-testable without a DB.
 */
export function buildDemandLetterContext(
  input: DemandLetterInput,
): Record<string, unknown> {
  const totalAmountDue = input.outstandingBalance + input.penaltyAmount;
  return {
    companyName: COMPANY_NAME,
    borrowerName: input.borrowerName,
    address: input.address,
    loanAccountNo: input.loanAccountNo,
    demandStage: STAGE_LABEL[input.demandStage],
    outstandingBalance: formatMoney(input.outstandingBalance),
    penaltyAmount: formatMoney(input.penaltyAmount),
    totalAmountDue: formatMoney(totalAmountDue),
    amountInWords: pesosInWords(totalAmountDue),
    daysPastDue: String(input.daysPastDue),
    dueDate: input.dueDate,
    paymentDeadline: input.paymentDeadline,
    todayDate: input.todayDate,
    isFinal: input.demandStage === "final_demand",
  };
}

type MasterlistScheduleRow = ScheduleLite;

/**
 * Generate a demand letter for a masterlist account and store it as a
 * rendered_documents row (module = collection). Append-mode: each demand in the
 * series is preserved (the collector may issue reminder → demand → final).
 */
export async function generateDemandLetter(
  supabase: SupabaseClient,
  params: {
    masterlistId: string;
    demandStage: DemandStage;
    actorId: string;
    /** Days the borrower is given to settle (deadline = today + this). */
    deadlineDays?: number;
  },
): Promise<RenderedDocumentResult> {
  const { masterlistId, demandStage, actorId, deadlineDays = 15 } = params;

  const { data: account, error } = await supabase
    .from("masterlist")
    .select(
      `
      id, loan_application_id, loan_account_no, borrower_name, outstanding_balance,
      borrowers (*),
      amortization_schedules ( installment_no, due_date, amount_due, status, penalty_amount )
      `,
    )
    .eq("id", masterlistId)
    .single();

  if (error || !account) {
    throw new Error(error?.message ?? "Masterlist account not found");
  }

  const applicationId = account.loan_application_id as string;
  if (!applicationId) {
    throw new Error("Account is not linked to a loan application");
  }

  const borrowerRaw = account.borrowers;
  const borrowerRow = (Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw) as
    | BorrowerRow
    | null;
  const address = borrowerRow ? joinAddress(mapBorrowerRow(borrowerRow).presentAddress) : "";

  const schedules = (
    Array.isArray(account.amortization_schedules) ? account.amortization_schedules : []
  ) as MasterlistScheduleRow[];

  const nextOpen = nextOpenInstallment(schedules);
  const today = new Date();
  const daysPastDue = nextOpen ? daysBetween(nextOpen.due_date, today) : 0;

  // Penalties accrued across all still-open installments.
  const penaltyAmount = schedules
    .filter((s) => !["paid", "rolled"].includes(String(s.status).toLowerCase()))
    .reduce((sum, s) => sum + Number(s.penalty_amount ?? 0), 0);

  const context = buildDemandLetterContext({
    borrowerName: account.borrower_name as string,
    address,
    loanAccountNo: (account.loan_account_no as string) ?? "",
    outstandingBalance: Number(account.outstanding_balance ?? 0),
    penaltyAmount,
    daysPastDue,
    dueDate: nextOpen ? formatDate(nextOpen.due_date) : "",
    paymentDeadline: formatDate(addDays(today, deadlineDays)),
    demandStage,
    todayDate: formatDate(today),
  });

  return renderAndStore(supabase, {
    slug: "demand_letter",
    module: "collection",
    applicationId,
    context,
    actorId,
  });
}
