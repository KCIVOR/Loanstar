import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { recordMoveOfPaymentSurcharge } from "@/lib/ar/move-of-payment";
import { ForbiddenError, requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Move of Payment — Fixes Plan Phase 2 (Issue 3). Records the surcharge for
 * an in-effect move as a real, tagged `payments` row. Separate from the
 * offer route (../route.ts), which stays payment-free.
 */

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  referenceNo: z.string().trim().min(1, "Reference number is required"),
  channel: z.enum(["bank_deposit", "check", "pos_cash"]),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "paymentDate must be YYYY-MM-DD"),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("collection", "edit");
    const { id: masterlistId } = await params;
    const input = bodySchema.parse(await request.json());

    // Same assignment gate as the offer route — this escalates via
    // createServiceClient() below.
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
    const result = await recordMoveOfPaymentSurcharge(admin, masterlistId, user.id, input);

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
