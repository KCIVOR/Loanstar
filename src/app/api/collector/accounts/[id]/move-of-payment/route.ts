import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { applyMoveOfPayment } from "@/lib/ar/move-of-payment";
import { ForbiddenError, requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Move of Payment — Phase 4, see
 * docs/revision-plans/feature-move-of-payment-implementation-plan.md.
 * Collector-owned (confirmed directly by the user, 2026-09-01) — no AR
 * placement to design around.
 */

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  // Collector-entered, never computed — see the implementation plan, Part 2
  // item 2 / Part 4 #5.
  deadlineDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "deadlineDate must be YYYY-MM-DD"),
  // Collector-picked from the candidate list shown on the page — see the
  // manual-selection addendum. Re-validated server-side by
  // applyMoveOfPayment against the account's real open installments.
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be YYYY-MM-DD"),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("collection", "edit");
    const { id: masterlistId } = await params;
    const input = bodySchema.parse(await request.json());

    // Ownership check — same shape as payments_collector_insert's RLS
    // (src/app/api/collector/payments/route.ts), since amortization_schedules
    // and masterlist writes are AR-gated (Part 1.6 of the plan) and this
    // route escalates via createServiceClient() below, which bypasses RLS
    // entirely — this check is the only thing standing between a Collector
    // and an account they aren't assigned to.
    const supabase = await createClient();
    const { data: assignment } = await supabase
      .from("assignments")
      .select("masterlist_id")
      .eq("masterlist_id", masterlistId)
      .eq("collector_user_id", user.id)
      .maybeSingle();

    if (!assignment) {
      throw new ForbiddenError("You are not assigned to this account");
    }

    // applyMoveOfPayment re-verifies eligibility itself (never trusts a
    // caller's own check) and writes its own audit event internally — do
    // not add a second writeAuditEvent call here, that would duplicate the
    // audit trail entry applyMoveOfPayment already writes.
    const admin = createServiceClient();
    const result = await applyMoveOfPayment(
      admin,
      masterlistId,
      user.id,
      input.deadlineDate,
      input.dueDate,
    );

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
