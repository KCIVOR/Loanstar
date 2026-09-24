import type { LedgerBouncedItem } from "@/lib/ledger/build-account-ledger-rows";
import type { DeskLedgerPosting } from "@/lib/ledger/desk-ledger";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Remedial has no RLS grant on `postings`, so both desks read them with a
 * service client scoped to a single masterlist the caller is already assigned
 * to. Without this the ledger cannot tell which installment a credit settled.
 */
export async function fetchAccountPostings(
  masterlistId: string,
): Promise<DeskLedgerPosting[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("postings")
    .select(
      "id, amortization_schedule_id, amount, penalty_amount, payments ( payment_date, reference_no, channel, status, move_of_payment_batch_id )",
    )
    .eq("masterlist_id", masterlistId)
    .order("posted_at", { ascending: true });

  return (data ?? []) as DeskLedgerPosting[];
}

/**
 * Bounced checks (2026-09-24) — same service-client reasoning as
 * `fetchAccountPostings` above: neither desk has an RLS grant that would
 * let it read another account's `dcr_items` directly, so this scopes the
 * read to the one masterlist the caller is already assigned to.
 *
 * `dcr_item_allocations` records which installment(s) this item was
 * allocated toward at "Add to DCR" time — written before Post/Reject/Bounce
 * ever happens, so the intended installment is still recoverable even
 * though a bounce never actually posts against it. Without this join, a
 * bounced check would render as an unassignable, standalone row instead of
 * nesting under the installment it was meant to cover, the same way a real
 * payment does (2026-09-24 follow-up). If an item happens to have more than
 * one allocated schedule (rare — split across installments), it's nested
 * under whichever due date is earliest; still correct, just a judgment call
 * on which single schedule "owns" the display when there's more than one.
 */
export async function fetchAccountBouncedItems(
  masterlistId: string,
): Promise<LedgerBouncedItem[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("dcr_items")
    .select(
      `
      id, deposit_amount, deposit_reference, posted_at,
      payments!inner ( masterlist_id ),
      dcr_item_allocations (
        amortization_schedule_id,
        amortization_schedules ( due_date )
      )
      `,
    )
    .eq("status", "bounced")
    .eq("payments.masterlist_id", masterlistId);

  return (data ?? []).map((row) => {
    const allocations = Array.isArray(row.dcr_item_allocations)
      ? row.dcr_item_allocations
      : [];
    const withDueDate = allocations
      .map((a) => {
        const s = a.amortization_schedules as
          | { due_date?: string | null }
          | { due_date?: string | null }[]
          | null;
        const schedule = Array.isArray(s) ? s[0] : s;
        return {
          scheduleId: a.amortization_schedule_id as string | null,
          dueDate: schedule?.due_date ?? null,
        };
      })
      .filter(
        (a): a is { scheduleId: string; dueDate: string } =>
          Boolean(a.scheduleId) && Boolean(a.dueDate),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const earliest = withDueDate[0] ?? null;

    return {
      id: row.id as string,
      amount: Number(row.deposit_amount ?? 0),
      referenceNo: (row.deposit_reference as string | null) ?? "",
      date: row.posted_at ? String(row.posted_at).slice(0, 10) : "",
      scheduleId: earliest?.scheduleId ?? null,
    };
  });
}
