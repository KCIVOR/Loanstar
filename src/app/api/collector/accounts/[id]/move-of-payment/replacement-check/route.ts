import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { recordReplacementCheck } from "@/lib/ar/move-of-payment";
import { ForbiddenError, requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Move of Payment — Fixes Plan Phase 4b (Issue 7). Records a replacement PDC
 * check for the installment appended by an in-effect move.
 */

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  checkNumber: z.string().trim().min(1, "Check number is required"),
  checkDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "checkDate must be YYYY-MM-DD"),
  bankName: z.string().trim().max(120).optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("collection", "edit");
    const { id: masterlistId } = await params;
    const input = bodySchema.parse(await request.json());

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

    const admin = createServiceClient();
    const result = await recordReplacementCheck(admin, masterlistId, user.id, {
      checkNumber: input.checkNumber,
      checkDate: input.checkDate,
      bankName: input.bankName ?? null,
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
