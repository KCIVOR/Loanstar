import type { SupabaseClient } from "@supabase/supabase-js";

import { getActiveComputation } from "@/lib/csa/computation";
import { computeFirstPaymentDate } from "@/lib/computation/release-date";
import type { BorrowerRow } from "@/lib/borrowers/types";
import { mapBorrowerRow } from "@/lib/borrowers/types";

export type BlriParticular = {
  label: string;
  amount: number;
  accountCode: string;
};

export type BlriPdcRow = {
  checkNumber: string | null;
  checkDate: string;
  amount: number;
  bankName: string;
};

export type BlriData = {
  loanAccountNo: string;
  borrowerName: string;
  principal: number;
  totalInterest: number;
  totalLoan: number;
  monthlyAmortization: number;
  terms: number;
  firstPaymentDate: string;
  particulars: BlriParticular[];
  pdcSchedule: BlriPdcRow[];
};

const ACCOUNT_CODES = {
  loansReceivable: "1100001",
  processingFee: "5003010",
  securityFee: "2100002",
  documentation: "5003011",
  adminCost: "5003012",
  docStamp: "5003014",
  cash: "1100110",
  bank: "1100115",
} as const;

function formatDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

export function buildBlriData(input: {
  applicationNo: string | null;
  borrower: ReturnType<typeof mapBorrowerRow>;
  computation: NonNullable<Awaited<ReturnType<typeof getActiveComputation>>>;
  pdcChecks?: Array<{
    checkNumber: string | null;
    checkDate: string;
    amount: number;
    bankName: string;
  }>;
}): BlriData {
  const releaseDate = input.computation.releaseDate
    ? new Date(input.computation.releaseDate)
    : new Date();
  const firstPayment = computeFirstPaymentDate(
    releaseDate,
    input.computation.addonMonths,
    input.computation.dueDay ?? 10,
  );

  const lineByKey = Object.fromEntries(
    input.computation.lineItems.map((item) => [item.key, item.amount]),
  );

  const particulars: BlriParticular[] = [
    {
      label: "Processing Fee",
      amount: lineByKey.processing_fee ?? input.computation.processingFee ?? 0,
      accountCode: ACCOUNT_CODES.processingFee,
    },
    {
      label: "Admin Cost",
      amount: lineByKey.admin_cost ?? 0,
      accountCode: ACCOUNT_CODES.adminCost,
    },
    {
      label: "Doc Stamp",
      amount: lineByKey.doc_stamp ?? 0,
      accountCode: ACCOUNT_CODES.docStamp,
    },
    {
      label: "Security Fee",
      amount: lineByKey.security_fee ?? 0,
      accountCode: ACCOUNT_CODES.securityFee,
    },
  ];

  let pdcSchedule: BlriPdcRow[];

  if (input.pdcChecks && input.pdcChecks.length > 0) {
    pdcSchedule = input.pdcChecks.map((row) => ({
      checkNumber: row.checkNumber,
      checkDate: row.checkDate,
      amount: row.amount,
      bankName: row.bankName,
    }));
  } else {
    pdcSchedule = [];
    let cursor = new Date(firstPayment);
    for (let i = 0; i < input.computation.terms; i += 1) {
      pdcSchedule.push({
        checkNumber: null,
        checkDate: formatDate(cursor),
        amount: input.computation.monthlyAmortization,
        bankName: "",
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
    }
  }

  return {
    loanAccountNo: input.applicationNo ?? "PENDING",
    borrowerName: `${input.borrower.firstName} ${input.borrower.lastName}`.trim(),
    principal: input.computation.principal,
    totalInterest: input.computation.totalInterest ?? 0,
    totalLoan: input.computation.totalLoan,
    monthlyAmortization: input.computation.monthlyAmortization,
    terms: input.computation.terms,
    firstPaymentDate: formatDate(firstPayment),
    particulars,
    pdcSchedule,
  };
}

export async function loadBlriContext(
  supabase: SupabaseClient,
  applicationId: string,
  releaseFileId?: string,
) {
  const { data: app, error: appError } = await supabase
    .from("loan_applications")
    .select("application_no, borrowers (*)")
    .eq("id", applicationId)
    .single();

  if (appError || !app) {
    throw new Error("Application not found");
  }

  const borrowerRaw = app.borrowers;
  const borrowerRow = (
    Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw
  ) as BorrowerRow;

  const computation = await getActiveComputation(supabase, applicationId);
  if (!computation) {
    throw new Error("Computation not found");
  }

  let pdcChecks: BlriPdcRow[] | undefined;
  if (releaseFileId) {
    const { data: rows } = await supabase
      .from("pdc_checks")
      .select("check_number, check_date, amount, bank_name")
      .eq("release_file_id", releaseFileId)
      .order("sort_order");

    if (rows && rows.length > 0) {
      pdcChecks = rows.map((r) => ({
        checkNumber: r.check_number as string | null,
        checkDate: r.check_date as string,
        amount: Number(r.amount),
        bankName: r.bank_name as string,
      }));
    }
  }

  return buildBlriData({
    applicationNo: app.application_no as string | null,
    borrower: mapBorrowerRow(borrowerRow),
    computation,
    pdcChecks,
  });
}
