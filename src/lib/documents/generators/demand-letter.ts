import type { SupabaseClient } from "@supabase/supabase-js";

import { mapBorrowerRow, type BorrowerRow } from "@/lib/borrowers/types";
import { nextOpenInstallment, type ScheduleLite } from "@/lib/collector/desk";
import { renderAndStore, type RenderedDocumentResult } from "@/lib/documents/render-store";
import { getPublishedTemplate } from "@/lib/documents/templates/service";
import {
  countInWords,
  looseDateLong,
  pesosAndCentavosInWords,
} from "@/lib/lra/template-context";

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
  /** Date the first demand in this series was generated (long form), if any. */
  firstNoticeDate?: string;
  /** Borrower checks returned by the bank — only the dishonored-check letter lists them. */
  demandChecks?: DemandCheckRow[];
  /** Account the returned checks were drawn against, when the PDC record has it. */
  demandCheckAccountNo?: string;
  /** Company officer the letter is marked for the attention of (SME accounts). */
  attentionName?: string;
  attentionTitle?: string;
  /** Set when this copy of the letter is addressed to a co-borrower. */
  coBorrowerName?: string;
  coBorrowerAddress?: string;
};

export type DemandCheckRow = {
  bankName: string;
  checkNumber: string;
  checkDate: string;
  amount: string;
};

/** Every slug a demand letter can be stored under — used to list the series. */
export const DEMAND_LETTER_SLUGS = [
  "demand_letter",
  "demand_letter_no_pdc_sf",
  "demand_letter_dishonored_check_sf",
  "demand_letter_no_pdc_sme",
  "demand_letter_dishonored_check_sme",
  "demand_letter_dishonored_check_coborrower_sme",
] as const;

/**
 * Which template a demand uses. Each segment group has the client's own
 * letters (seafarer: SFCalculator/DL2 + SC - NO PDC; SME / Individual: the
 * "Demand Letter" set): a returned check gets the dishonored-check notice —
 * the co-borrower's copy of it when that is who the letter is for — otherwise
 * the second / final demand gets the two-notice letter. A first reminder with
 * no returned check, and any letter whose template is not published, stays on
 * the shared `demand_letter`.
 */
export function pickDemandLetterSlug(input: {
  segment: string | null;
  demandStage: DemandStage;
  hasBouncedChecks: boolean;
  publishedSlugs: ReadonlySet<string>;
  /** True for the extra copy addressed to a co-borrower. */
  forCoBorrower?: boolean;
}): (typeof DEMAND_LETTER_SLUGS)[number] {
  const suffix = input.segment === "seafarer" ? "sf" : "sme";
  if (input.segment !== "seafarer" && input.segment !== "sme" && input.segment !== "individual") {
    return "demand_letter";
  }
  if (input.hasBouncedChecks) {
    const coBorrowerSlug = "demand_letter_dishonored_check_coborrower_sme";
    if (input.forCoBorrower && suffix === "sme" && input.publishedSlugs.has(coBorrowerSlug)) {
      return coBorrowerSlug;
    }
    const dishonored = `demand_letter_dishonored_check_${suffix}` as const;
    if (input.publishedSlugs.has(dishonored)) return dishonored;
  }
  const noPdc = `demand_letter_no_pdc_${suffix}` as const;
  if (input.demandStage !== "first_reminder" && input.publishedSlugs.has(noPdc)) {
    return noPdc;
  }
  return "demand_letter";
}

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

    // Seafarer letters (SC - NO PDC / DL2) spell each figure out and date the
    // letter long-form. The reason a check was returned is not recorded
    // anywhere, so it stays a blank for the collector to write in.
    todayDateLong: looseDateLong(input.todayDate),
    outstandingBalanceInWords: pesosAndCentavosInWords(input.outstandingBalance),
    penaltyAmountInWords: pesosAndCentavosInWords(input.penaltyAmount),
    totalAmountDueInWords: pesosAndCentavosInWords(totalAmountDue),
    monthsPastDue: countInWords(Math.max(1, Math.floor(input.daysPastDue / 30))),
    firstNoticeDate: input.firstNoticeDate ?? "",
    demandChecks: input.demandChecks ?? [],
    demandCheckAccountNo: input.demandCheckAccountNo ?? "",
    demandReason: "",
    attentionName: input.attentionName ?? "",
    attentionTitle: input.attentionTitle ?? "",
    coBorrowerName: input.coBorrowerName ?? "",
    coBorrowerAddress: input.coBorrowerAddress ?? "",
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
      id, loan_application_id, release_file_id, segment, loan_account_no, borrower_name, outstanding_balance,
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
  const profile = borrowerRow ? mapBorrowerRow(borrowerRow) : null;
  const segment = (account.segment as string | null) ?? null;
  // An SME letter goes to the company at its office, marked for the attention
  // of its officer — the account row itself only carries the person's name.
  const business = segment === "sme" ? profile?.businessInfo : undefined;
  const addressee = business?.companyName?.trim() || (account.borrower_name as string);
  const address =
    (business?.officeAddress ?? business?.companyAddress ?? "").trim() ||
    (profile ? joinAddress(profile.presentAddress) : "");
  const officer = business?.companyOfficers?.[0];

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

  const bounced = await loadBouncedChecks(
    supabase,
    masterlistId,
    (account.release_file_id as string | null) ?? null,
  );

  const publishedSlugs = new Set<string>();
  for (const candidate of DEMAND_LETTER_SLUGS) {
    if (await getPublishedTemplate(supabase, candidate)) publishedSlugs.add(candidate);
  }
  const slug = pickDemandLetterSlug({
    segment,
    demandStage,
    hasBouncedChecks: bounced.checks.length > 0,
    publishedSlugs,
  });

  const { data: firstDemand } = await supabase
    .from("rendered_documents")
    .select("generated_at")
    .eq("loan_application_id", applicationId)
    .in("document_slug", [...DEMAND_LETTER_SLUGS])
    .order("generated_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const letterInput: DemandLetterInput = {
    borrowerName: addressee,
    address,
    loanAccountNo: (account.loan_account_no as string) ?? "",
    outstandingBalance: Number(account.outstanding_balance ?? 0),
    penaltyAmount,
    daysPastDue,
    dueDate: nextOpen ? formatDate(nextOpen.due_date) : "",
    paymentDeadline: formatDate(addDays(today, deadlineDays)),
    demandStage,
    todayDate: formatDate(today),
    firstNoticeDate: firstDemand?.generated_at
      ? looseDateLong(String(firstDemand.generated_at).slice(0, 10))
      : "",
    demandChecks: bounced.checks,
    demandCheckAccountNo: bounced.accountNo,
    attentionName: officer?.name?.trim() ?? "",
    attentionTitle: (officer?.position ?? business?.position ?? "").trim(),
  };

  const result = await renderAndStore(supabase, {
    slug,
    module: "collection",
    applicationId,
    context: buildDemandLetterContext(letterInput),
    actorId,
  });

  // A returned check is also demanded from each co-borrower, in a copy of the
  // letter addressed to them (client source: "Demand Letter - Co-borrower").
  const coBorrowerSlug = pickDemandLetterSlug({
    segment,
    demandStage,
    hasBouncedChecks: bounced.checks.length > 0,
    publishedSlugs,
    forCoBorrower: true,
  });
  if (coBorrowerSlug === "demand_letter_dishonored_check_coborrower_sme") {
    const { data: app } = await supabase
      .from("loan_applications")
      .select("co_borrowers")
      .eq("id", applicationId)
      .maybeSingle();
    const coBorrowers = (Array.isArray(app?.co_borrowers) ? app.co_borrowers : []) as Array<{
      fullName?: string;
      address?: string;
    }>;
    for (const coBorrower of coBorrowers) {
      if (!coBorrower.fullName?.trim()) continue;
      await renderAndStore(supabase, {
        slug: coBorrowerSlug,
        module: "collection",
        applicationId,
        context: buildDemandLetterContext({
          ...letterInput,
          coBorrowerName: coBorrower.fullName.trim(),
          coBorrowerAddress: (coBorrower.address ?? "").trim(),
        }),
        actorId,
      });
    }
  }

  return result;
}

/**
 * Checks AR has marked as returned by the bank for this account (a `bounced`
 * DCR line item — see `bounceDcrItem`). The payment's reference is the check
 * number; bank and drawee account come from the matching PDC when the loan has
 * one. Any read failure resolves to "no returned checks" so a demand letter is
 * never blocked by this lookup.
 */
async function loadBouncedChecks(
  supabase: SupabaseClient,
  masterlistId: string,
  releaseFileId: string | null,
): Promise<{ checks: DemandCheckRow[]; accountNo: string }> {
  const { data: items, error } = await supabase
    .from("dcr_items")
    .select("amount, payments!inner ( masterlist_id, reference_no, payment_date )")
    .eq("status", "bounced")
    .eq("payments.masterlist_id", masterlistId);
  if (error || !items || items.length === 0) return { checks: [], accountNo: "" };

  const pdcByNumber = new Map<string, { bankName: string; refAccount: string }>();
  if (releaseFileId) {
    const { data: pdcs } = await supabase
      .from("pdc_checks")
      .select("check_number, bank_name, ref_account")
      .eq("release_file_id", releaseFileId);
    for (const row of pdcs ?? []) {
      if (row.check_number) {
        pdcByNumber.set(String(row.check_number), {
          bankName: (row.bank_name as string | null) ?? "",
          refAccount: (row.ref_account as string | null) ?? "",
        });
      }
    }
  }

  let accountNo = "";
  const checks = items.map((item) => {
    const paymentRaw = item.payments as unknown;
    const payment = (Array.isArray(paymentRaw) ? paymentRaw[0] : paymentRaw) as {
      reference_no: string | null;
      payment_date: string | null;
    } | null;
    const checkNumber = payment?.reference_no ?? "";
    const pdc = pdcByNumber.get(checkNumber);
    if (pdc?.refAccount && !accountNo) accountNo = pdc.refAccount;
    return {
      bankName: pdc?.bankName ?? "",
      checkNumber,
      checkDate: payment?.payment_date ? formatDate(payment.payment_date) : "",
      amount: formatMoney(Number(item.amount ?? 0)),
    };
  });
  return { checks, accountNo };
}
