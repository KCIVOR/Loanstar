import type { SupabaseClient } from "@supabase/supabase-js";

import { mapBorrowerRow, type BorrowerRow } from "@/lib/borrowers/types";
import { mapComputationRow } from "@/lib/csa/computation";
import { renderAndStore, type RenderedDocumentResult } from "@/lib/documents/render-store";

import { COMPANY_NAME, formatDate, formatMoney, joinAddress } from "./shared";

/** The subset of computation figures the sheet compares. */
export type ComputationFigures = {
  principal: number;
  totalInterest: number;
  totalLoan: number;
  monthlyAmortization: number;
  netReleased: number;
  terms: number;
  interestRate: number;
};

type Row = { label: string; original: string; renegotiated: string };

function pct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

/**
 * Pure builder: pair each figure of the original vs renegotiated computations
 * into a template row. When there was no renegotiation, `renegotiated` is null
 * and its column is left blank.
 */
export function buildFinalComputationRows(
  original: ComputationFigures,
  renegotiated: ComputationFigures | null,
): Row[] {
  const row = (
    label: string,
    pick: (c: ComputationFigures) => string,
  ): Row => ({
    label,
    original: pick(original),
    renegotiated: renegotiated ? pick(renegotiated) : "",
  });

  return [
    row("Principal", (c) => formatMoney(c.principal)),
    row("Total Interest", (c) => formatMoney(c.totalInterest)),
    row("Total Loan", (c) => formatMoney(c.totalLoan)),
    row("Monthly Amortization", (c) => formatMoney(c.monthlyAmortization)),
    row("Net Released", (c) => formatMoney(c.netReleased)),
    row("Terms (months)", (c) => String(c.terms)),
    row("Interest Rate", (c) => pct(c.interestRate)),
  ];
}

function toFigures(c: ReturnType<typeof mapComputationRow>): ComputationFigures {
  return {
    principal: c.principal,
    totalInterest: c.totalInterest,
    totalLoan: c.totalLoan,
    monthlyAmortization: c.monthlyAmortization,
    netReleased: c.netReleased,
    terms: c.terms,
    interestRate: c.interestRate,
  };
}

/**
 * Generate the Final Computation Sheet for an application: original (earliest
 * version) vs renegotiated (active version, when it differs) and store it as a
 * rendered_documents row (module = release_lra). replaceUnsigned keeps one live
 * sheet per application.
 */
export async function generateFinalComputationSheet(
  supabase: SupabaseClient,
  params: { applicationId: string; actorId: string },
): Promise<RenderedDocumentResult> {
  const { applicationId, actorId } = params;

  const { data: rows, error } = await supabase
    .from("computations")
    .select("*")
    .eq("loan_application_id", applicationId)
    .order("version", { ascending: true });

  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) {
    throw new Error("No computation found for this application");
  }

  const original = mapComputationRow(rows[0]!);
  const activeRaw = rows.find((r) => r.is_active) ?? rows.at(-1)!;
  const active = mapComputationRow(activeRaw);
  const renegotiated = active.version !== original.version ? active : null;

  const { data: app, error: appError } = await supabase
    .from("loan_applications")
    .select("application_no, borrowers (*)")
    .eq("id", applicationId)
    .single();
  if (appError || !app) throw new Error("Application not found");

  const borrowerRaw = app.borrowers;
  const borrower = mapBorrowerRow(
    (Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw) as BorrowerRow,
  );

  const context = {
    companyName: COMPANY_NAME,
    borrowerName: [borrower.firstName, borrower.lastName].filter(Boolean).join(" "),
    borrowerNo: borrower.borrowerNo,
    address: joinAddress(borrower.presentAddress),
    loanAccountNo: (app.application_no as string) ?? "",
    loanType: active.loanTypeName ?? "",
    todayDate: formatDate(new Date()),
    preparedBy: "",
    checkedBy: "",
    approvedBy: "",
    computationRows: buildFinalComputationRows(
      toFigures(original),
      renegotiated ? toFigures(renegotiated) : null,
    ),
  };

  return renderAndStore(supabase, {
    slug: "final_computation_sheet",
    module: "release_lra",
    applicationId,
    context,
    actorId,
    replaceUnsigned: true,
  });
}
