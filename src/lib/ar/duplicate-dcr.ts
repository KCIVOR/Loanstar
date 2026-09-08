import type { SupabaseClient } from "@supabase/supabase-js";

import { sumHalfUp } from "@/lib/computation/money";

/**
 * Task 4 — duplicate daily-collection-report (DCR) detection. Pure helpers
 * only: routes and `posting.ts` fetch the rows and call these; this module
 * touches no DB and imports nothing from `posting.ts`.
 * See docs/revision-plans/task-04-duplicate-dcr-IMPLEMENTATION-plan.md.
 */

/** Payment statuses that mean "recorded, not yet on the ledger". A payment
 * flips to `'posted'` only inside the `post_single_dcr_item` RPC
 * (migrations/20260831110000_...), and a rejected DCR frees its payments back
 * to `'confirmed'` — so this status filter alone is authoritative for
 * "unposted", no `dcr_items` join required. */
export const UNPOSTED_PAYMENT_STATUSES = [
  "pending_verification",
  "confirmed",
] as const;

/** DCR states whose items are still awaiting Accounting — a duplicate risk.
 * Narrower than `isActiveDcrStatus` in collector/desk.ts: `'reconciled'` means
 * AR has already processed every item, so it is not a pending claim. */
export function isUnpostedDcrStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "draft" || s === "submitted";
}

export type UnpostedAccountSummary = {
  /** How many payments on this account are recorded but not yet posted. */
  count: number;
  /** Their total, half-up to 2dp. */
  totalAmount: number;
  /** Non-empty reference numbers, for "already pending" messaging. */
  references: string[];
};

/**
 * Summarise the recorded-but-unposted payments for ONE account. Caller passes
 * the `payments` rows it already fetched for a single `masterlist_id`; this
 * filters to {pending_verification, confirmed} and totals them.
 */
export function summarizeUnpostedForAccount(
  payments: ReadonlyArray<{
    amount: number | string | null;
    status: string;
    reference_no?: string | null;
  }>,
): UnpostedAccountSummary {
  const statuses = UNPOSTED_PAYMENT_STATUSES as readonly string[];
  const unposted = payments.filter((p) => statuses.includes(p.status));

  return {
    count: unposted.length,
    totalAmount: sumHalfUp(...unposted.map((p) => Number(p.amount) || 0)),
    references: unposted
      .map((p) => (p.reference_no ?? "").trim())
      .filter((r) => r.length > 0),
  };
}

/**
 * The installment ids a new DCR allocation would cover that are ALREADY
 * covered by another unposted DCR item on the same account. Both inputs are
 * lists of `amortization_schedule_id`; `null`/blank entries (the trailing
 * advance line `computeAutoAllocation` always emits) are ignored. Returns the
 * distinct overlap, in candidate order.
 */
export function findInstallmentConflicts(
  candidateScheduleIds: ReadonlyArray<string | null | undefined>,
  claimedScheduleIds: ReadonlyArray<string | null | undefined>,
): string[] {
  const claimed = new Set(
    claimedScheduleIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    ),
  );

  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of candidateScheduleIds) {
    if (
      typeof id === "string" &&
      id.length > 0 &&
      claimed.has(id) &&
      !seen.has(id)
    ) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// --- DB loaders (service-role) -------------------------------------------------
// These MUST run with a service client: `dcr_items_select` /
// `dcr_item_allocations_select` RLS gate on `dcr.collector_user_id = auth.uid()`,
// so a conflicting DCRR left by a previous assignee is invisible to the
// current collector's session. They also throw on any query error — a silent
// `?? []` would turn the whole guard into a no-op.

/** Of the given `amortization_schedule_id`s, the ones already covered by a
 * `pending` `dcr_items` row on an unposted (`draft`/`submitted`) DCRR **other
 * than** `excludeDcrId`. Three flat queries (no PostgREST embed filters) so
 * the behaviour is deterministic. */
export async function loadClaimedScheduleIdsAmong(
  admin: SupabaseClient,
  candidateScheduleIds: ReadonlyArray<string | null | undefined>,
  excludeDcrId: string,
): Promise<string[]> {
  const ids = Array.from(
    new Set(
      candidateScheduleIds.filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      ),
    ),
  );
  if (ids.length === 0) return [];

  const { data: allocs, error: aErr } = await admin
    .from("dcr_item_allocations")
    .select("amortization_schedule_id, dcr_item_id")
    .in("amortization_schedule_id", ids);
  if (aErr) {
    throw new Error(`duplicate-dcr: allocation lookup failed: ${aErr.message}`);
  }
  if (!allocs || allocs.length === 0) return [];

  const itemIds = Array.from(
    new Set(allocs.map((r) => r.dcr_item_id as string)),
  );
  const { data: items, error: iErr } = await admin
    .from("dcr_items")
    .select("id, dcr_id, status")
    .in("id", itemIds)
    .eq("status", "pending");
  if (iErr) {
    throw new Error(`duplicate-dcr: item lookup failed: ${iErr.message}`);
  }
  if (!items || items.length === 0) return [];

  const dcrIds = Array.from(new Set(items.map((r) => r.dcr_id as string)));
  const { data: dcrs, error: dErr } = await admin
    .from("dcr")
    .select("id")
    .in("id", dcrIds)
    .in("status", ["draft", "submitted"])
    .neq("id", excludeDcrId);
  if (dErr) {
    throw new Error(`duplicate-dcr: dcr lookup failed: ${dErr.message}`);
  }
  const liveDcrIds = new Set((dcrs ?? []).map((r) => r.id as string));
  if (liveDcrIds.size === 0) return [];

  const liveItemIds = new Set(
    items
      .filter((r) => liveDcrIds.has(r.dcr_id as string))
      .map((r) => r.id as string),
  );

  return Array.from(
    new Set(
      allocs
        .filter((r) => liveItemIds.has(r.dcr_item_id as string))
        .map((r) => r.amortization_schedule_id as string)
        .filter((x) => x && ids.includes(x)),
    ),
  );
}

/**
 * Per-installment total that is **already allocated by a `pending` item on
 * another unposted (`draft`/`submitted`) DCRR** for `masterlistId`. Feeds the
 * DCRR allocation modal so a collector sees which installments are spoken for
 * (and by how much) before they pick one. Service-role + throw-on-error for
 * the same reasons as `loadClaimedScheduleIdsAmong`.
 * `excludeDcrId` (optional) drops the DCRR currently being built.
 */
export async function loadPendingAllocationsForAccount(
  admin: SupabaseClient,
  masterlistId: string,
  excludeDcrId?: string,
): Promise<Record<string, { amount: number; dcrCount: number }>> {
  // Flat queries only (no PostgREST embed filters) — same discipline as
  // loadClaimedScheduleIdsAmong.
  // 1. this account's payments
  const { data: pays, error: pErr } = await admin
    .from("payments")
    .select("id")
    .eq("masterlist_id", masterlistId);
  if (pErr) {
    throw new Error(`duplicate-dcr: payment lookup failed: ${pErr.message}`);
  }
  const payIds = (pays ?? []).map((r) => r.id as string);
  if (payIds.length === 0) return {};

  // 2. their PENDING dcr_items
  const { data: items, error: iErr } = await admin
    .from("dcr_items")
    .select("id, dcr_id")
    .in("payment_id", payIds)
    .eq("status", "pending");
  if (iErr) {
    throw new Error(`duplicate-dcr: pending item lookup failed: ${iErr.message}`);
  }
  const rows = (items ?? []).filter(
    (r) => !excludeDcrId || (r.dcr_id as string) !== excludeDcrId,
  );
  if (rows.length === 0) return {};

  // 3. keep only items whose DCRR is draft/submitted
  const dcrIds = Array.from(new Set(rows.map((r) => r.dcr_id as string)));
  const { data: dcrs, error: dErr } = await admin
    .from("dcr")
    .select("id")
    .in("id", dcrIds)
    .in("status", ["draft", "submitted"]);
  if (dErr) {
    throw new Error(`duplicate-dcr: dcr status lookup failed: ${dErr.message}`);
  }
  const liveDcrIds = new Set((dcrs ?? []).map((r) => r.id as string));
  const liveItems = rows.filter((r) => liveDcrIds.has(r.dcr_id as string));
  if (liveItems.length === 0) return {};

  // 4. their allocations, summed per installment
  const { data: allocs, error: aErr } = await admin
    .from("dcr_item_allocations")
    .select("amortization_schedule_id, amount, dcr_item_id")
    .in(
      "dcr_item_id",
      liveItems.map((r) => r.id as string),
    )
    .not("amortization_schedule_id", "is", null);
  if (aErr) {
    throw new Error(
      `duplicate-dcr: pending allocation lookup failed: ${aErr.message}`,
    );
  }
  const dcrByItem = new Map(
    liveItems.map((r) => [r.id as string, r.dcr_id as string]),
  );
  const out: Record<string, { amount: number; dcrSet: Set<string> }> = {};
  for (const a of allocs ?? []) {
    const sid = a.amortization_schedule_id as string;
    if (!out[sid]) out[sid] = { amount: 0, dcrSet: new Set() };
    out[sid].amount += Number(a.amount) || 0;
    const d = dcrByItem.get(a.dcr_item_id as string);
    if (d) out[sid].dcrSet.add(d);
  }
  const result: Record<string, { amount: number; dcrCount: number }> = {};
  for (const [sid, v] of Object.entries(out)) {
    result[sid] = { amount: v.amount, dcrCount: v.dcrSet.size };
  }
  return result;
}

/** Every non-null `amortization_schedule_id` this DCRR's items allocate to. */
export async function loadDcrScheduleIds(
  admin: SupabaseClient,
  dcrId: string,
): Promise<string[]> {
  const { data: items, error: iErr } = await admin
    .from("dcr_items")
    .select("id")
    .eq("dcr_id", dcrId);
  if (iErr) {
    throw new Error(`duplicate-dcr: dcr item lookup failed: ${iErr.message}`);
  }
  const itemIds = (items ?? []).map((r) => r.id as string);
  if (itemIds.length === 0) return [];

  const { data: allocs, error: aErr } = await admin
    .from("dcr_item_allocations")
    .select("amortization_schedule_id")
    .in("dcr_item_id", itemIds)
    .not("amortization_schedule_id", "is", null);
  if (aErr) {
    throw new Error(
      `duplicate-dcr: dcr allocation lookup failed: ${aErr.message}`,
    );
  }
  return Array.from(
    new Set((allocs ?? []).map((r) => r.amortization_schedule_id as string)),
  );
}

// --- amount-aware over-allocation (Option 1) -------------------------------
// A partly-claimed installment is fine to add to, as long as the new
// allocation + everything already pending on OTHER unposted DCRRs does not
// exceed what the installment still owes. Only a genuine *over*-fill (a real
// double-count) is blocked — matching what the Allocate modal shows.

/** Pure: of `candidate` (scheduleId -> peso this DCRR would add), which
 * installments would be pushed past `remainingDue` once `pending` (peso
 * already on other unposted DCRRs) is included. `tolerance` absorbs rounding. */
export function findOverAllocatedInstallments(input: {
  candidate: Record<string, number>;
  pending: Record<string, number>;
  remainingDue: Record<string, number>;
  tolerance?: number;
}): string[] {
  const tol = input.tolerance ?? 0.005;
  const out: string[] = [];
  for (const [sid, amt] of Object.entries(input.candidate)) {
    const pending = input.pending[sid] ?? 0;
    const due = input.remainingDue[sid] ?? 0;
    if (pending + amt > due + tol) out.push(sid);
  }
  return out;
}

/** This DCRR's own allocation lines, with each line's account — so `submitDcr`
 * can check its totals per installment against what other DCRRs already hold.
 * Flat queries, service-role. */
export async function loadDcrAllocationsWithMasterlist(
  admin: SupabaseClient,
  dcrId: string,
): Promise<
  Array<{ scheduleId: string | null; amount: number; masterlistId: string }>
> {
  const { data: items, error: iErr } = await admin
    .from("dcr_items")
    .select("id, payment_id")
    .eq("dcr_id", dcrId);
  if (iErr) {
    throw new Error(`duplicate-dcr: dcr item lookup failed: ${iErr.message}`);
  }
  const itemRows = items ?? [];
  if (itemRows.length === 0) return [];

  const payIds = Array.from(
    new Set(itemRows.map((r) => r.payment_id as string)),
  );
  const { data: pays, error: pErr } = await admin
    .from("payments")
    .select("id, masterlist_id")
    .in("id", payIds);
  if (pErr) {
    throw new Error(`duplicate-dcr: payment lookup failed: ${pErr.message}`);
  }
  const mlByPayment = new Map(
    (pays ?? []).map((r) => [r.id as string, r.masterlist_id as string]),
  );
  const mlByItem = new Map(
    itemRows.map((r) => [
      r.id as string,
      mlByPayment.get(r.payment_id as string) ?? "",
    ]),
  );

  const { data: allocs, error: aErr } = await admin
    .from("dcr_item_allocations")
    .select("amortization_schedule_id, amount, dcr_item_id")
    .in(
      "dcr_item_id",
      itemRows.map((r) => r.id as string),
    );
  if (aErr) {
    throw new Error(
      `duplicate-dcr: dcr allocation lookup failed: ${aErr.message}`,
    );
  }
  return (allocs ?? []).map((a) => ({
    scheduleId: (a.amortization_schedule_id as string | null) ?? null,
    amount: Number(a.amount) || 0,
    masterlistId: mlByItem.get(a.dcr_item_id as string) ?? "",
  }));
}
