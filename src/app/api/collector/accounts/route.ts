import { resolveDateBounds, type DateRangeValue } from "@/components/history";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { refreshMasterlistAging } from "@/lib/ar/posting";
import { nextOpenInstallment, type ScheduleLite } from "@/lib/collector/desk";
import {
  COLLECTOR_QUEUE_ACCOUNT_STATUS,
  agingFilterSpec,
  clampCollectorQueuePageSize,
  collectorSearchPredicate,
  computeCollectorQueueKpis,
  inFirstPaymentBounds,
  passesAgingFilter,
  passesSegmentFilter,
  segmentFilterSpec,
  sortCollectorQueue,
  type CollectorLastContact,
  type CollectorQueueKpis,
  type CollectorQueueMappedRow,
  type CollectorQueueSortKey,
} from "@/lib/collector/queue";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const RANGE_PRESETS = new Set(["30d", "90d", "all", "custom"]);
const SEGMENT_FILTERS = new Set(["all", "seafarer", "sme", "individual"]);
const SORT_KEYS = new Set<CollectorQueueSortKey>([
  "priority",
  "balance",
  "borrower",
  "due",
]);

const EMPTY_KPI: CollectorQueueKpis = {
  assigned: 0,
  callbackDue: 0,
  agingCritical: 0,
  totalBalance: 0,
};

function asSchedules(raw: unknown): ScheduleLite[] {
  if (!raw) return [];
  const rows = Array.isArray(raw) ? raw : [raw];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      installment_no: Number(r.installment_no ?? 0),
      due_date: String(r.due_date ?? ""),
      amount_due: Number(r.amount_due ?? 0),
      status: String(r.status ?? "pending"),
      penalty_amount: Number(r.penalty_amount ?? 0),
    };
  });
}

export async function GET(request: Request) {
  try {
    const user = await requireModulePermission("collection", "view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";
    const agingSpec = agingFilterSpec(searchParams.get("aging") ?? "all");
    const segmentRaw = searchParams.get("segment") ?? "all";
    const segmentFilter = segmentFilterSpec(
      SEGMENT_FILTERS.has(segmentRaw) ? segmentRaw : "all",
    );

    const rangeRaw = searchParams.get("range") ?? "all";
    const preset = (
      RANGE_PRESETS.has(rangeRaw) ? rangeRaw : "all"
    ) as DateRangeValue["preset"];
    const dateRange: DateRangeValue = {
      preset,
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
    };
    const { from, to } = resolveDateBounds(dateRange, new Date());

    const sortKeyRaw = searchParams.get("sortKey") ?? "priority";
    const sortKey: CollectorQueueSortKey = SORT_KEYS.has(
      sortKeyRaw as CollectorQueueSortKey,
    )
      ? (sortKeyRaw as CollectorQueueSortKey)
      : "priority";
    const sortDirRaw = searchParams.get("sortDir") ?? "desc";
    const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const pageSize = clampCollectorQueuePageSize(
      Number(searchParams.get("pageSize") ?? 10),
    );

    const supabase = await createClient();

    const { data: assignments } = await supabase
      .from("assignments")
      .select("masterlist_id")
      .eq("collector_user_id", user.id)
      .is("remedial_user_id", null);

    const ids = (assignments ?? []).map((a) => a.masterlist_id as string);
    if (!ids.length) {
      return jsonOk({ rows: [], totalCount: 0, kpi: EMPTY_KPI });
    }

    // Privileged aging refresh: amortization_schedules/masterlist/penalties
    // writes require accounting_ar:edit, which the collection role doesn't
    // have — refreshMasterlistAging must run under the service role or every
    // write here silently no-ops under RLS. Run it before the select below so
    // the response reflects the just-refreshed numbers, not stale ones.
    const admin = createServiceClient();
    for (const id of ids) {
      await refreshMasterlistAging(admin, id);
    }

    // Fetch the officer's assigned+active superset, then filter/sort/paginate
    // in the handler: priority/callback/agingNeedsAttention are computed (not
    // SQL columns) and volume is per-officer bounded.
    // Paid-off exclusion: account_status='active' (not closed_at IS NULL).
    let query = supabase
      .from("masterlist")
      .select(
        `
        id,
        borrower_id,
        borrower_name,
        borrower_no,
        loan_account_no,
        segment,
        manning_agency,
        vessel_name,
        outstanding_balance,
        aging_bucket,
        first_payment_date,
        amortization_schedules (
          installment_no,
          due_date,
          amount_due,
          status,
          penalty_amount
        )
      `,
      )
      .in("id", ids)
      .eq("remedial_flag", false)
      .eq("account_status", COLLECTOR_QUEUE_ACCOUNT_STATUS);

    if (segmentFilter !== "all") {
      query = query.eq("segment", segmentFilter);
    }

    const { data, error } = await query.order("first_payment_date");

    if (error) throw new Error(error.message);

    const activeIds = (data ?? []).map((row) => row.id as string);

    const lastContactByMasterlist = new Map<string, CollectorLastContact>();
    if (activeIds.length) {
      const { data: contacts } = await supabase
        .from("collector_contacts")
        .select("masterlist_id, contact_type, callback_at, created_at")
        .in("masterlist_id", activeIds)
        .order("created_at", { ascending: false });

      for (const row of contacts ?? []) {
        const id = row.masterlist_id as string;
        if (!lastContactByMasterlist.has(id)) {
          lastContactByMasterlist.set(id, {
            contactType: row.contact_type as string,
            callbackAt: row.callback_at as string | null,
            createdAt: row.created_at as string,
          });
        }
      }
    }

    const accounts: CollectorQueueMappedRow[] = (data ?? []).map((row) => {
      const schedules = asSchedules(row.amortization_schedules);
      const next = nextOpenInstallment(schedules);
      return {
        id: row.id,
        borrowerId: row.borrower_id as string,
        borrowerName: row.borrower_name,
        borrowerNo: row.borrower_no,
        loanAccountNo: row.loan_account_no,
        segment:
          row.segment === "sme" || row.segment === "individual"
            ? row.segment
            : "seafarer",
        manningAgency: (row.manning_agency as string | null) ?? null,
        vesselName: (row.vessel_name as string | null) ?? null,
        outstandingBalance: Number(row.outstanding_balance ?? 0),
        agingBucket: String(row.aging_bucket ?? ""),
        firstPaymentDate: (row.first_payment_date as string | null) ?? null,
        nextDueDate: next?.due_date ?? null,
        nextDueAmount: next
          ? next.amount_due + next.penalty_amount
          : null,
        lastContact: lastContactByMasterlist.get(row.id as string) ?? null,
      };
    });

    const kpi = computeCollectorQueueKpis(accounts);

    const filtered = accounts.filter(
      (row) =>
        inFirstPaymentBounds(row.firstPaymentDate, from, to) &&
        passesAgingFilter(row.agingBucket, agingSpec) &&
        passesSegmentFilter(row.segment, segmentFilter) &&
        collectorSearchPredicate(row, search),
    );
    const sorted = sortCollectorQueue(filtered, sortKey, sortDir);

    const totalCount = sorted.length;
    const rows = sorted.slice((page - 1) * pageSize, page * pageSize);

    return jsonOk({
      rows,
      totalCount,
      kpi,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
