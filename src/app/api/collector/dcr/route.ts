import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  addPaymentToDcr,
  createDcrDraft,
  submitDcr,
} from "@/lib/ar/posting";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({ action: z.literal("create") });

const addItemSchema = z.object({
  action: z.literal("add_item"),
  dcrId: z.string().uuid(),
  paymentId: z.string().uuid(),
});

const submitSchema = z.object({
  action: z.literal("submit"),
  dcrId: z.string().uuid(),
});

export async function GET() {
  try {
    const user = await requireModulePermission("collection", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("dcr")
      .select("*, dcr_items (*)")
      .eq("collector_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);

    return jsonOk({ dcrs: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("collection", "edit");
    const body = await request.json();
    const supabase = await createClient();

    if (createSchema.safeParse(body).success) {
      const result = await createDcrDraft(supabase, user.id);
      return jsonOk(result);
    }

    const addParsed = addItemSchema.safeParse(body);
    if (addParsed.success) {
      await addPaymentToDcr(
        supabase,
        addParsed.data.dcrId,
        addParsed.data.paymentId,
        user.id,
      );
      return jsonOk({ added: true });
    }

    const submitParsed = submitSchema.safeParse(body);
    if (submitParsed.success) {
      const result = await submitDcr(
        supabase,
        submitParsed.data.dcrId,
        user.id,
      );

      await writeAuditEvent({
        actorId: user.id,
        moduleSlug: "collection",
        action: "execute_trigger",
        entityType: "dcr",
        entityId: submitParsed.data.dcrId,
        afterData: { trigger: "submit_dcr", ...result },
      });

      return jsonOk(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return handleApiError(error);
  }
}
