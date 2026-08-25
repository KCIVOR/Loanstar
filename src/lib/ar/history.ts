import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/server";

export type ClosedAccountRow = {
  id: string;
  loanAccountNo: string | null;
  borrowerName: string;
  borrowerNo: string;
  segment: "sme" | "seafarer" | "individual" | null;
  outstandingBalance: number;
  portfolioName: string | null;
  closedAt: string;
};

export type ClosedAccountSortKey = "borrower" | "account" | "closedAt";

export type ClosedAccountsQueryParams = {
  search?: string;
  segment?: "all" | "seafarer" | "sme" | "individual";
  from?: string | null;
  to?: string | null;
  sortKey?: ClosedAccountSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type ClosedAccountsKpiCounts = {
  total: number;
};

export type ReconciledPostingRow = {
  id: string;
  dcrId: string;
  masterlistId: string;
  loanAccountNo: string | null;
  borrowerName: string;
  borrowerNo: string;
  segment: "sme" | "seafarer" | "individual" | null;
  amount: number;
  depositReference: string | null;
  postedAt: string;
};

export type ReconciledDcrSortKey = "borrower" | "amount" | "postedAt";

export type ReconciledDcrQueryParams = {
  search?: string;
  segment?: "all" | "seafarer" | "sme" | "individual";
  from?: string | null;
  to?: string | null;
  sortKey?: ReconciledDcrSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type ReconciledDcrKpiCounts = {
  total: number;
  totalAmount: number;
};

export const AR_HISTORY_PAGE_SIZES = [10, 20, 30, 50, 100] as const;

/**
 * PostgREST/Supabase default max rows per request. KPI amount sums page at
 * this size so date-bounded totals are not silently truncated at 1000.
 */
export const POSTING_AMOUNT_FETCH_PAGE = 1000;

/** Clamp page size to the allowlist; invalid values fall back to 10. */
export function clampArHistoryPageSize(pageSize: number): number {
  return (AR_HISTORY_PAGE_SIZES as readonly number[]).includes(pageSize)
    ? pageSize
    : 10;
}

/** Pure sum of posting amounts — exported for Phase 5 unit tests. */
export function sumPostingAmounts(rows: { amount: number }[]): number {
  let total = 0;
  for (const row of rows) {
    total += Number(row.amount) || 0;
  }
  return total;
}

function sanitizeSearchTerm(term: string): string {
  return term
    .trim()
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toInclusiveStart(from: string): string {
  return `${from}T00:00:00`;
}

function toInclusiveEnd(to: string): string {
  return `${to}T23:59:59.999`;
}

/**
 * Closed masterlist accounts with a stamped closed_at (no backfill — paid
 * rows without closed_at are excluded).
 */
export async function getClosedAccountsHistory(
  supabase: SupabaseClient,
  params: ClosedAccountsQueryParams,
): Promise<{ rows: ClosedAccountRow[]; totalCount: number }> {
  const {
    search = "",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "closedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampArHistoryPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);

  let query = supabase
    .from("masterlist")
    .select(
      `
      id,
      loan_account_no,
      borrower_name,
      borrower_no,
      segment,
      outstanding_balance,
      closed_at,
      portfolios ( name )
    `,
      { count: "exact" },
    )
    .eq("account_status", "paid")
    .not("closed_at", "is", null);

  if (segmentFilter !== "all") {
    query = query.eq("segment", segmentFilter);
  }

  if (from) {
    query = query.gte("closed_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("closed_at", toInclusiveEnd(to));
  }

  if (term) {
    const pattern = `%${term}%`;
    query = query.or(
      `borrower_name.ilike."${pattern}",borrower_no.ilike."${pattern}",loan_account_no.ilike."${pattern}"`,
    );
  }

  if (sortKey === "borrower") {
    query = query.order("borrower_name", { ascending });
  } else if (sortKey === "account") {
    query = query.order("loan_account_no", { ascending });
  } else {
    query = query.order("closed_at", { ascending });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).flatMap((row) => {
    const closedAt = row.closed_at as string | null;
    if (!closedAt) return [];

    const portfolioRaw = row.portfolios;
    const portfolio = Array.isArray(portfolioRaw)
      ? portfolioRaw[0]
      : portfolioRaw;

    const segmentRaw = row.segment as string | null | undefined;
    const segment: "sme" | "seafarer" | "individual" | null =
      segmentRaw === "sme" || segmentRaw === "seafarer" || segmentRaw === "individual"
        ? segmentRaw
        : null;

    return [
      {
        id: row.id as string,
        loanAccountNo: (row.loan_account_no as string | null) ?? null,
        borrowerName: row.borrower_name as string,
        borrowerNo: row.borrower_no as string,
        segment,
        outstandingBalance: Number(row.outstanding_balance),
        portfolioName: (portfolio?.name as string | null | undefined) ?? null,
        closedAt,
      },
    ];
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Closed-accounts KPI — date-scoped only (ignores search), matching CSA/Committee.
 */
export async function getClosedAccountsKpiCounts(
  supabase: SupabaseClient,
  bounds: { from?: string | null; to?: string | null },
): Promise<ClosedAccountsKpiCounts> {
  const { from = null, to = null } = bounds;

  let query = supabase
    .from("masterlist")
    .select("id", { count: "exact", head: true })
    .eq("account_status", "paid")
    .not("closed_at", "is", null);

  if (from) {
    query = query.gte("closed_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("closed_at", toInclusiveEnd(to));
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return { total: count ?? 0 };
}

async function findMasterlistIdsForSearch(
  supabase: SupabaseClient,
  term: string,
): Promise<string[]> {
  const pattern = `%${term}%`;
  const { data, error } = await supabase
    .from("masterlist")
    .select("id")
    .or(
      `borrower_name.ilike."${pattern}",borrower_no.ilike."${pattern}",loan_account_no.ilike."${pattern}"`,
    )
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => row.id as string);
}

/**
 * Resolve DCR ids by deposit_reference. Queried on `dcr` directly (plain
 * filter) so PostgREST embed `.or()` fragility is avoided; callers still
 * select with `dcr!inner(...)` for reliable join shape on the parent query.
 */
async function findDcrIdsForDepositRefSearch(
  supabase: SupabaseClient,
  term: string,
): Promise<string[]> {
  const pattern = `%${term}%`;
  const { data, error } = await supabase
    .from("dcr")
    .select("id")
    .ilike("deposit_reference", pattern)
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => row.id as string);
}

/**
 * One row per posting (DCR × account). Search resolves masterlist identity
 * and dcr.deposit_reference via separate ID lookups, then a plain `.or()` on
 * postings FKs — avoids fragile cross-embed `.or()` filters.
 */
export async function getReconciledDcrHistory(
  supabase: SupabaseClient,
  params: ReconciledDcrQueryParams,
): Promise<{ rows: ReconciledPostingRow[]; totalCount: number }> {
  const {
    search = "",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "postedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampArHistoryPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);

  let masterlistIds: string[] | null = null;
  let dcrIds: string[] | null = null;
  if (term) {
    [masterlistIds, dcrIds] = await Promise.all([
      findMasterlistIdsForSearch(supabase, term),
      findDcrIdsForDepositRefSearch(supabase, term),
    ]);
    if (masterlistIds.length === 0 && dcrIds.length === 0) {
      return { rows: [], totalCount: 0 };
    }
  }

  let query = supabase
    .from("postings")
    .select(
      `
      id,
      dcr_id,
      masterlist_id,
      amount,
      posted_at,
      masterlist (
        loan_account_no,
        borrower_name,
        borrower_no,
        segment
      ),
      dcr!inner (
        deposit_reference
      )
    `,
      { count: "exact" },
    );

  if (segmentFilter !== "all") {
    query = query.eq("masterlist.segment", segmentFilter);
  }

  if (from) {
    query = query.gte("posted_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("posted_at", toInclusiveEnd(to));
  }

  if (masterlistIds && dcrIds) {
    const parts: string[] = [];
    if (masterlistIds.length > 0) {
      parts.push(`masterlist_id.in.(${masterlistIds.join(",")})`);
    }
    if (dcrIds.length > 0) {
      parts.push(`dcr_id.in.(${dcrIds.join(",")})`);
    }
    query = query.or(parts.join(","));
  }

  if (sortKey === "borrower") {
    query = query.order("borrower_name", {
      ascending,
      foreignTable: "masterlist",
    });
  } else if (sortKey === "amount") {
    query = query.order("amount", { ascending });
  } else {
    query = query.order("posted_at", { ascending });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).flatMap((row) => {
    const postedAt = row.posted_at as string | null;
    if (!postedAt) return [];

    const masterlistRaw = row.masterlist;
    const masterlist = Array.isArray(masterlistRaw)
      ? masterlistRaw[0]
      : masterlistRaw;
    const dcrRaw = row.dcr;
    const dcr = Array.isArray(dcrRaw) ? dcrRaw[0] : dcrRaw;

    const segmentRaw = masterlist?.segment as string | null | undefined;
    const segment: "sme" | "seafarer" | "individual" | null =
      segmentRaw === "sme" || segmentRaw === "seafarer" || segmentRaw === "individual"
        ? segmentRaw
        : null;

    return [
      {
        id: row.id as string,
        dcrId: row.dcr_id as string,
        masterlistId: row.masterlist_id as string,
        loanAccountNo:
          (masterlist?.loan_account_no as string | null | undefined) ?? null,
        borrowerName: (masterlist?.borrower_name as string | undefined) ?? "",
        borrowerNo: (masterlist?.borrower_no as string | undefined) ?? "",
        segment,
        amount: Number(row.amount),
        depositReference:
          (dcr?.deposit_reference as string | null | undefined) ?? null,
        postedAt,
      },
    ];
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Reconciled-DCR KPI — date-scoped only. `totalAmount` is a JS sum of the
 * `amount` column for matching rows (paged at POSTING_AMOUNT_FETCH_PAGE).
 */
export async function getReconciledDcrKpiCounts(
  supabase: SupabaseClient,
  bounds: { from?: string | null; to?: string | null },
): Promise<ReconciledDcrKpiCounts> {
  const { from = null, to = null } = bounds;

  let countQuery = supabase
    .from("postings")
    .select("id", { count: "exact", head: true });
  if (from) {
    countQuery = countQuery.gte("posted_at", toInclusiveStart(from));
  }
  if (to) {
    countQuery = countQuery.lte("posted_at", toInclusiveEnd(to));
  }

  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);

  const amountRows: { amount: number }[] = [];
  let offset = 0;
  for (;;) {
    let amountQuery = supabase.from("postings").select("amount");
    if (from) {
      amountQuery = amountQuery.gte("posted_at", toInclusiveStart(from));
    }
    if (to) {
      amountQuery = amountQuery.lte("posted_at", toInclusiveEnd(to));
    }
    amountQuery = amountQuery
      .order("id", { ascending: true })
      .range(offset, offset + POSTING_AMOUNT_FETCH_PAGE - 1);

    const { data, error } = await amountQuery;
    if (error) throw new Error(error.message);

    const batch = data ?? [];
    for (const row of batch) {
      amountRows.push({ amount: Number(row.amount) });
    }

    if (batch.length < POSTING_AMOUNT_FETCH_PAGE) {
      break;
    }
    offset += POSTING_AMOUNT_FETCH_PAGE;
  }

  return {
    total: count ?? 0,
    totalAmount: sumPostingAmounts(amountRows),
  };
}

export type RoundingWriteoffRow = {
  id: string;
  masterlistId: string;
  loanAccountNo: string | null;
  borrowerName: string;
  borrowerNo: string;
  segment: "sme" | "seafarer" | "individual" | null;
  amortizationScheduleId: string | null;
  installmentNo: number | null;
  amount: number;
  performedBy: string;
  performedByName: string;
  notes: string | null;
  performedAt: string;
};

export type RoundingWriteoffSortKey = "borrower" | "amount" | "performedAt";

export type RoundingWriteoffQueryParams = {
  search?: string;
  performedBy?: string;
  from?: string | null;
  to?: string | null;
  sortKey?: RoundingWriteoffSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type RoundingWriteoffKpiCounts = {
  total: number;
  totalAmount: number;
};

export async function resolvePerformerNames(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  if (ids.length === 0) return nameById;

  const admin = createServiceClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);

  for (const p of profiles ?? []) {
    nameById.set(
      p.id as string,
      (p.full_name as string | null) || (p.email as string),
    );
  }
  return nameById;
}

/**
 * Every rounding write-off across all accounts, joined to masterlist for
 * borrower/account identity. Search resolves borrower/account matches via
 * the same masterlist-id lookup used by getReconciledDcrHistory.
 */
export async function getRoundingWriteoffHistory(
  supabase: SupabaseClient,
  params: RoundingWriteoffQueryParams,
): Promise<{ rows: RoundingWriteoffRow[]; totalCount: number }> {
  const {
    search = "",
    performedBy = "all",
    from = null,
    to = null,
    sortKey = "performedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampArHistoryPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);

  let masterlistIds: string[] | null = null;
  if (term) {
    masterlistIds = await findMasterlistIdsForSearch(supabase, term);
    if (masterlistIds.length === 0) {
      return { rows: [], totalCount: 0 };
    }
  }

  let query = supabase.from("rounding_writeoffs").select(
    `
      id,
      masterlist_id,
      amortization_schedule_id,
      amount,
      performed_by,
      performed_at,
      notes,
      masterlist (
        loan_account_no,
        borrower_name,
        borrower_no,
        segment
      ),
      amortization_schedules (
        installment_no
      )
    `,
    { count: "exact" },
  );

  if (masterlistIds) {
    query = query.in("masterlist_id", masterlistIds);
  }

  if (performedBy !== "all") {
    query = query.eq("performed_by", performedBy);
  }

  if (from) {
    query = query.gte("performed_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("performed_at", toInclusiveEnd(to));
  }

  if (sortKey === "borrower") {
    query = query.order("borrower_name", {
      ascending,
      foreignTable: "masterlist",
    });
  } else if (sortKey === "amount") {
    query = query.order("amount", { ascending });
  } else {
    query = query.order("performed_at", { ascending });
  }

  query = query
    .order("id", { ascending: true })
    .range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const performerIds = Array.from(
    new Set((data ?? []).map((row) => row.performed_by as string)),
  );
  const nameById = await resolvePerformerNames(supabase, performerIds);

  const rows = (data ?? []).map((row) => {
    const masterlistRaw = row.masterlist;
    const masterlist = Array.isArray(masterlistRaw)
      ? masterlistRaw[0]
      : masterlistRaw;

    const segmentRaw = masterlist?.segment as string | null | undefined;
    const segment: "sme" | "seafarer" | "individual" | null =
      segmentRaw === "sme" || segmentRaw === "seafarer" || segmentRaw === "individual"
        ? segmentRaw
        : null;

    const scheduleRaw = row.amortization_schedules as
      | { installment_no: number }
      | { installment_no: number }[]
      | null;
    const schedule = Array.isArray(scheduleRaw) ? scheduleRaw[0] : scheduleRaw;

    const performedBy = row.performed_by as string;

    return {
      id: row.id as string,
      masterlistId: row.masterlist_id as string,
      loanAccountNo:
        (masterlist?.loan_account_no as string | null | undefined) ?? null,
      borrowerName: (masterlist?.borrower_name as string | undefined) ?? "",
      borrowerNo: (masterlist?.borrower_no as string | undefined) ?? "",
      segment,
      amortizationScheduleId:
        (row.amortization_schedule_id as string | null) ?? null,
      installmentNo: schedule?.installment_no ?? null,
      amount: Number(row.amount),
      performedBy,
      performedByName: nameById.get(performedBy) ?? performedBy,
      notes: (row.notes as string | null) ?? null,
      performedAt: row.performed_at as string,
    };
  });

  return { rows, totalCount: count ?? 0 };
}

/**
 * Rounding-write-off KPI — date-scoped only (ignores search/performedBy),
 * matching getReconciledDcrKpiCounts's convention.
 */
export async function getRoundingWriteoffKpiCounts(
  supabase: SupabaseClient,
  bounds: { from?: string | null; to?: string | null },
): Promise<RoundingWriteoffKpiCounts> {
  const { from = null, to = null } = bounds;

  let countQuery = supabase
    .from("rounding_writeoffs")
    .select("id", { count: "exact", head: true });
  if (from) {
    countQuery = countQuery.gte("performed_at", toInclusiveStart(from));
  }
  if (to) {
    countQuery = countQuery.lte("performed_at", toInclusiveEnd(to));
  }

  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);

  const amountRows: { amount: number }[] = [];
  let offset = 0;
  for (;;) {
    let amountQuery = supabase.from("rounding_writeoffs").select("amount");
    if (from) {
      amountQuery = amountQuery.gte("performed_at", toInclusiveStart(from));
    }
    if (to) {
      amountQuery = amountQuery.lte("performed_at", toInclusiveEnd(to));
    }
    amountQuery = amountQuery
      .order("id", { ascending: true })
      .range(offset, offset + POSTING_AMOUNT_FETCH_PAGE - 1);

    const { data, error } = await amountQuery;
    if (error) throw new Error(error.message);

    const batch = data ?? [];
    for (const row of batch) {
      amountRows.push({ amount: Number(row.amount) });
    }

    if (batch.length < POSTING_AMOUNT_FETCH_PAGE) {
      break;
    }
    offset += POSTING_AMOUNT_FETCH_PAGE;
  }

  return {
    total: count ?? 0,
    totalAmount: sumPostingAmounts(amountRows),
  };
}

/**
 * Distinct AR users who have actually performed a rounding write-off —
 * populates the "AR user" filter dropdown (not every AR-permissioned user).
 */
export async function getRoundingWriteoffPerformers(
  supabase: SupabaseClient,
): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase
    .from("rounding_writeoffs")
    .select("performed_by");
  if (error) throw new Error(error.message);

  const ids = Array.from(
    new Set((data ?? []).map((row) => row.performed_by as string)),
  );
  const nameById = await resolvePerformerNames(supabase, ids);

  return ids
    .map((id) => ({ id, name: nameById.get(id) ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type InternalTransferHistoryRow = {
  id: string;
  sourceLoanApplicationId: string;
  sourceApplicationNo: string | null;
  sourceLoanAccountNo: string | null;
  targetMasterlistId: string;
  targetLoanAccountNo: string | null;
  targetBorrowerName: string;
  targetBorrowerNo: string;
  segment: "sme" | "seafarer" | "individual" | null;
  transferType: "other_loan" | "offset";
  months: number | null;
  amount: number;
  status: "posted" | "rejected";
  reviewedBy: string | null;
  reviewedByName: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
};

export type InternalTransferSortKey = "borrower" | "amount" | "reviewedAt";

export type InternalTransferHistoryQueryParams = {
  search?: string;
  segment?: "all" | "seafarer" | "sme" | "individual";
  from?: string | null;
  to?: string | null;
  sortKey?: InternalTransferSortKey;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type InternalTransferKpiCounts = {
  totalResolved: number;
  totalPostedAmount: number;
};

/**
 * Posted and rejected internal transfers — the history counterpart to
 * `listPendingInternalTransfers` (which only ever returns `pending` rows).
 * Search resolves against masterlist ids on **either** side of the transfer
 * (source or target), since both are real accounts a user might search by.
 */
export async function getInternalTransferHistory(
  supabase: SupabaseClient,
  params: InternalTransferHistoryQueryParams,
): Promise<{ rows: InternalTransferHistoryRow[]; totalCount: number }> {
  const {
    search = "",
    segment: segmentFilter = "all",
    from = null,
    to = null,
    sortKey = "reviewedAt",
    sortDir = "desc",
    page,
    pageSize,
  } = params;

  const safePage = Math.max(1, page);
  const safePageSize = clampArHistoryPageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const ascending = sortDir === "asc";
  const term = sanitizeSearchTerm(search);

  let masterlistIds: string[] | null = null;
  if (term) {
    masterlistIds = await findMasterlistIdsForSearch(supabase, term);
    if (masterlistIds.length === 0) {
      return { rows: [], totalCount: 0 };
    }
  }

  let query = supabase
    .from("internal_transfers")
    .select(
      `
      id, source_loan_application_id, target_masterlist_id, transfer_type,
      months, amount, status, rejection_reason, reviewed_by, reviewed_at, created_at,
      source_application:loan_applications!internal_transfers_source_loan_application_id_fkey ( application_no ),
      source_masterlist:masterlist!internal_transfers_source_masterlist_id_fkey ( loan_account_no ),
      target_masterlist:masterlist!internal_transfers_target_masterlist_id_fkey!inner ( loan_account_no, borrower_name, borrower_no, segment )
    `,
      { count: "exact" },
    )
    .in("status", ["posted", "rejected"]);

  if (masterlistIds) {
    const ids = masterlistIds.join(",");
    query = query.or(
      `source_masterlist_id.in.(${ids}),target_masterlist_id.in.(${ids})`,
    );
  }

  if (segmentFilter !== "all") {
    query = query.eq("target_masterlist.segment", segmentFilter);
  }

  if (from) {
    query = query.gte("reviewed_at", toInclusiveStart(from));
  }
  if (to) {
    query = query.lte("reviewed_at", toInclusiveEnd(to));
  }

  // PostgREST/supabase-js cannot order top-level rows by a to-one embedded
  // relation's column — the `foreignTable`/`referencedTable` order option
  // only reorders rows *within* a one-to-many embed; for a many-to-one embed
  // like target_masterlist it's silently a no-op (confirmed empirically
  // against the live API while building this function — the DCR/rounding-
  // writeoff history functions use this same pattern for their "borrower"
  // sort and inherit the identical limitation, out of scope to fix here).
  // Given this feature's realistic volume (a handful of resolved transfers,
  // not thousands of payments), sorting by borrower name fetches everything
  // matching the current filters up to a generous cap and sorts in JS,
  // instead of shipping a sort option that silently does nothing.
  const isBorrowerSort = sortKey === "borrower";
  const BORROWER_SORT_FETCH_CAP = 2000;

  if (isBorrowerSort) {
    query = query
      .order("id", { ascending: true })
      .range(0, BORROWER_SORT_FETCH_CAP - 1);
  } else {
    if (sortKey === "amount") {
      query = query.order("amount", { ascending });
    } else {
      query = query.order("reviewed_at", { ascending });
    }
    query = query
      .order("id", { ascending: true })
      .range(offset, offset + safePageSize - 1);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const reviewerIds = Array.from(
    new Set(
      (data ?? [])
        .map((row) => row.reviewed_by as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const nameById = await resolvePerformerNames(supabase, reviewerIds);

  const rows = (data ?? []).map((row) => {
    const sourceApp = Array.isArray(row.source_application)
      ? row.source_application[0]
      : row.source_application;
    const sourceMl = Array.isArray(row.source_masterlist)
      ? row.source_masterlist[0]
      : row.source_masterlist;
    const targetMl = Array.isArray(row.target_masterlist)
      ? row.target_masterlist[0]
      : row.target_masterlist;

    const segmentRaw = targetMl?.segment as string | null | undefined;
    const segment: "sme" | "seafarer" | "individual" | null =
      segmentRaw === "sme" || segmentRaw === "seafarer" || segmentRaw === "individual"
        ? segmentRaw
        : null;

    const reviewedBy = (row.reviewed_by as string | null) ?? null;

    return {
      id: row.id as string,
      sourceLoanApplicationId: row.source_loan_application_id as string,
      sourceApplicationNo: (sourceApp?.application_no as string | null) ?? null,
      sourceLoanAccountNo: (sourceMl?.loan_account_no as string | null) ?? null,
      targetMasterlistId: row.target_masterlist_id as string,
      targetLoanAccountNo: (targetMl?.loan_account_no as string | null) ?? null,
      targetBorrowerName: (targetMl?.borrower_name as string | undefined) ?? "",
      targetBorrowerNo: (targetMl?.borrower_no as string | undefined) ?? "",
      segment,
      transferType: row.transfer_type as "other_loan" | "offset",
      months: row.months as number | null,
      amount: Number(row.amount),
      status: row.status as "posted" | "rejected",
      reviewedBy,
      reviewedByName: reviewedBy ? (nameById.get(reviewedBy) ?? reviewedBy) : "—",
      reviewedAt: (row.reviewed_at as string | null) ?? null,
      rejectionReason: (row.rejection_reason as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  });

  if (isBorrowerSort) {
    rows.sort((a, b) =>
      ascending
        ? a.targetBorrowerName.localeCompare(b.targetBorrowerName)
        : b.targetBorrowerName.localeCompare(a.targetBorrowerName),
    );
    return {
      rows: rows.slice(offset, offset + safePageSize),
      totalCount: count ?? 0,
    };
  }

  return { rows, totalCount: count ?? 0 };
}

/**
 * Internal-transfer history KPI — date-scoped (on `reviewed_at`) only.
 * `totalResolved` counts posted + rejected together (a workload metric);
 * `totalPostedAmount` sums `amount` for posted rows only, since a rejected
 * transfer never moved money and blending it in would overstate the total.
 */
export async function getInternalTransferKpiCounts(
  supabase: SupabaseClient,
  bounds: { from?: string | null; to?: string | null },
): Promise<InternalTransferKpiCounts> {
  const { from = null, to = null } = bounds;

  let countQuery = supabase
    .from("internal_transfers")
    .select("id", { count: "exact", head: true })
    .in("status", ["posted", "rejected"]);
  if (from) {
    countQuery = countQuery.gte("reviewed_at", toInclusiveStart(from));
  }
  if (to) {
    countQuery = countQuery.lte("reviewed_at", toInclusiveEnd(to));
  }

  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);

  const amountRows: { amount: number }[] = [];
  let offset = 0;
  for (;;) {
    let amountQuery = supabase
      .from("internal_transfers")
      .select("amount")
      .eq("status", "posted");
    if (from) {
      amountQuery = amountQuery.gte("reviewed_at", toInclusiveStart(from));
    }
    if (to) {
      amountQuery = amountQuery.lte("reviewed_at", toInclusiveEnd(to));
    }
    amountQuery = amountQuery
      .order("id", { ascending: true })
      .range(offset, offset + POSTING_AMOUNT_FETCH_PAGE - 1);

    const { data, error } = await amountQuery;
    if (error) throw new Error(error.message);

    const batch = data ?? [];
    for (const row of batch) {
      amountRows.push({ amount: Number(row.amount) });
    }

    if (batch.length < POSTING_AMOUNT_FETCH_PAGE) {
      break;
    }
    offset += POSTING_AMOUNT_FETCH_PAGE;
  }

  return {
    totalResolved: count ?? 0,
    totalPostedAmount: sumPostingAmounts(amountRows),
  };
}
