import type { SupabaseClient } from "@supabase/supabase-js";

export type ObligationRow = {
  loanApplicationId: string;
  accountStatus: string;
  monthlyAmortization: number;
  outstanding: number;
};

export function sumActiveObligations(
  rows: ObligationRow[],
  excludeApplicationId: string,
): {
  otherMonthlyAmortization: number;
  otherOutstanding: number;
  otherActiveCount: number;
} {
  let otherMonthlyAmortization = 0;
  let otherOutstanding = 0;
  let otherActiveCount = 0;
  for (const row of rows) {
    if (row.loanApplicationId === excludeApplicationId) continue;
    if (row.accountStatus !== "active") continue;
    otherMonthlyAmortization += row.monthlyAmortization;
    otherOutstanding += row.outstanding;
    otherActiveCount += 1;
  }
  return { otherMonthlyAmortization, otherOutstanding, otherActiveCount };
}

export async function loadActiveObligations(
  supabase: SupabaseClient,
  borrowerId: string,
): Promise<ObligationRow[]> {
  const { data } = await supabase
    .from("masterlist")
    .select(
      "loan_application_id, account_status, monthly_amortization, outstanding_balance",
    )
    .eq("borrower_id", borrowerId);

  return (data ?? []).map((row) => ({
    loanApplicationId: row.loan_application_id as string,
    accountStatus: row.account_status as string,
    monthlyAmortization: Number(row.monthly_amortization ?? 0),
    outstanding: Number(row.outstanding_balance ?? 0),
  }));
}
