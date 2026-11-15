import type { SupabaseClient } from "@supabase/supabase-js";

import { interestByInstallment } from "@/lib/computation/offset-interest";
import { formatDateLocal } from "@/lib/computation/release-date";

export type BorrowerActiveLoan = {
  loanApplicationId: string;
  loanAccountNo: string;
  outstandingBalance: number;
  monthlyAmortization: number;
  accountStatus: string;
  remainingInstallments: number;
  futureInstallments: Array<{
    installmentNo: number;
    dueDate: string;
    interestPortion: number;
  }>;
};

/**
 * The borrower's active loan accounts, for the calculator's Offset / Other
 * Loan pickers. Copied from the Committee application route's inline block
 * (which mirrors the CSA computation route) so the LRA calculator can use the
 * same data without a third inline copy. `admin` must be a service-role
 * client: masterlist RLS does not grant SELECT to LRA, CSA or Committee.
 * The CSA and Committee routes still carry their own inline copies.
 */
export async function getBorrowerActiveLoans(
  admin: SupabaseClient,
  borrowerId: string | null | undefined,
): Promise<BorrowerActiveLoan[]> {
  let activeLoans: Array<{
    loanApplicationId: string;
    loanAccountNo: string;
    outstandingBalance: number;
    monthlyAmortization: number;
    accountStatus: string;
    remainingInstallments: number;
    /** Not-yet-due installments only — feeds the Offset early-settlement
     * discount picker; see docs/revision-plans/feature-early-settlement-discount.md.
     * Mirrors the identical enrichment in the CSA computation route's GET
     * handler — this route fetches activeLoans independently, so both must
     * carry it for the shared ComputationPanel modal to work under Committee too. */
    futureInstallments: Array<{
      installmentNo: number;
      dueDate: string;
      interestPortion: number;
    }>;
  }> = [];
  if (borrowerId) {
    const { data: masterlistRows } = await admin
      .from("masterlist")
      .select(
        "id, loan_application_id, loan_account_no, outstanding_balance, monthly_amortization, account_status, computation_id",
      )
      .eq("borrower_id", borrowerId)
      .eq("account_status", "active");

    // One batched query for every active account's open-installment count
    // (not N+1) — the same set AR actually allocates against when an
    // Offset transfer posts, so "N months" in the offset picker matches
    // reality instead of an outstanding_balance ÷ monthly approximation.
    // Also the source for futureInstallments below — one fetch serves both.
    const masterlistIds = (masterlistRows ?? []).map((row) => row.id as string);
    const remainingByMasterlistId = new Map<string, number>();
    const futureRowsByMasterlistId = new Map<
      string,
      Array<{ installmentNo: number; dueDate: string }>
    >();
    // Every schedule row per account (all statuses) — needed to work out the
    // real interest in each installment (Task 2 Phase 2).
    const allRowsByMasterlistId = new Map<
      string,
      Array<{ installmentNo: number; amountDue: number; lineType: string }>
    >();
    const today = formatDateLocal(new Date());
    if (masterlistIds.length > 0) {
      const { data: scheduleRows } = await admin
        .from("amortization_schedules")
        .select("masterlist_id, installment_no, due_date, status, amount_due, line_type")
        .in("masterlist_id", masterlistIds);
      for (const row of scheduleRows ?? []) {
        const mid = row.masterlist_id as string;
        const amountDue = Number(row.amount_due) || 0;
        const list = allRowsByMasterlistId.get(mid) ?? [];
        list.push({
          installmentNo: row.installment_no as number,
          amountDue,
          lineType: (row.line_type as string | null) ?? "standard",
        });
        allRowsByMasterlistId.set(mid, list);

        const isOpen = ["pending", "partial", "overdue"].includes(
          row.status as string,
        );
        // Quarterly/Two-Monthly Special loans persist a $0 "principal"
        // placeholder row alongside every non-final period's real interest
        // row — excluded so "N months remaining" isn't roughly doubled and
        // the offset picker never offers a non-real row.
        if (!isOpen || amountDue <= 0) continue;
        remainingByMasterlistId.set(mid, (remainingByMasterlistId.get(mid) ?? 0) + 1);
        const dueDate = row.due_date as string;
        if (dueDate > today) {
          const flist = futureRowsByMasterlistId.get(mid) ?? [];
          flist.push({ installmentNo: row.installment_no as number, dueDate });
          futureRowsByMasterlistId.set(mid, flist);
        }
      }
    }

    const computationIds = Array.from(
      new Set(
        (masterlistRows ?? [])
          .map((row) => row.computation_id as string | null)
          .filter((cid): cid is string => Boolean(cid)),
      ),
    );
    const computationById = new Map<
      string,
      { totalInterest: number; principal: number }
    >();
    if (computationIds.length > 0) {
      const { data: computationRows } = await admin
        .from("computations")
        .select("id, total_interest, principal")
        .in("id", computationIds);
      for (const row of computationRows ?? []) {
        computationById.set(row.id as string, {
          totalInterest: Number(row.total_interest) || 0,
          principal: Number(row.principal) || 0,
        });
      }
    }

    activeLoans = (masterlistRows ?? []).map((row) => {
      const mid = row.id as string;
      const interestMap = interestByInstallment(
        allRowsByMasterlistId.get(mid) ?? [],
        computationById.get(row.computation_id as string),
      );
      return {
        loanApplicationId: (row.loan_application_id as string | null) ?? "",
        loanAccountNo: (row.loan_account_no as string | null) ?? "Active Account",
        outstandingBalance: Number(row.outstanding_balance ?? 0),
        monthlyAmortization: Number(row.monthly_amortization ?? 0),
        accountStatus: (row.account_status as string | null) ?? "active",
        remainingInstallments: remainingByMasterlistId.get(mid) ?? 0,
        futureInstallments: (futureRowsByMasterlistId.get(mid) ?? [])
          .sort((a, b) => a.installmentNo - b.installmentNo)
          .map((inst) => ({
            ...inst,
            interestPortion: interestMap.get(inst.installmentNo) ?? 0,
          })),
      };
    });
  }
  return activeLoans;
}
