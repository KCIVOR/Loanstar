import { NextResponse } from "next/server";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { fetchLoanRegister } from "@/lib/reports/register-queries";
import {
  filterLoanRegister,
  groupLoansByBorrower,
  sortByOutstandingDesc,
  type RegisterFilters,
} from "@/lib/reports/registers";
import {
  parseReportCollateral,
  parseReportSegment,
} from "@/lib/reports/segments";
import { createServiceClient } from "@/lib/supabase/server";

const VIEWS = new Set(["loans", "borrowers"]);
const STATUSES = new Set(["unpaid", "paid", "all"]);
const AGING = new Set(["all", "current", "1-30", "31-60", "61-90", "91+"]);

function asFilter(
  value: string | null,
  allowed: Set<string>,
  fallback: string,
): string {
  if (!value) return fallback;
  return allowed.has(value) ? value : fallback;
}

export async function GET(request: Request) {
  try {
    await requireModulePermission("reports", "view");
    const params = new URL(request.url).searchParams;
    const view = params.get("view") ?? "loans";
    if (!VIEWS.has(view)) {
      return NextResponse.json({ error: "Invalid view. Use loans or borrowers." }, { status: 400 });
    }

    const filters: RegisterFilters = {
      status: asFilter(params.get("status"), STATUSES, "unpaid") as RegisterFilters["status"],
      segment: parseReportSegment(params.get("segment")),
      aging: asFilter(params.get("aging"), AGING, "all") as RegisterFilters["aging"],
      collateral: parseReportCollateral(params.get("collateral")),
    };

    const supabase = createServiceClient();
    const loans = sortByOutstandingDesc(
      filterLoanRegister(await fetchLoanRegister(supabase), filters),
    );
    const rows = view === "borrowers" ? groupLoansByBorrower(loans) : loans;
    const outstanding = rows.reduce((sum, row) => sum + row.outstanding, 0);

    return jsonOk({
      view,
      rows,
      kpis: { count: rows.length, outstanding },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
