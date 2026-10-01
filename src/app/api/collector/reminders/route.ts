import { NextResponse } from "next/server";
import { z } from "zod";
import { formatZodError } from "@/lib/api/zod-error";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import { runPaymentDueReminders } from "@/lib/collector/reminders";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  resend: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("collection", "edit");
    const supabase = await createClient();

    let resend = false;
    try {
      const body = schema.parse(await request.json().catch(() => ({})));
      resend = body.resend === true;
    } catch {
      resend = false;
    }

    const { data: assignments } = await supabase
      .from("assignments")
      .select("masterlist_id")
      .eq("collector_user_id", user.id)
      .is("remedial_user_id", null);

    const ids = (assignments ?? []).map((a) => a.masterlist_id as string);
    if (!ids.length) {
      return jsonOk({ sent: 0, skipped: 0, results: [] });
    }

    const result = await runPaymentDueReminders(supabase, {
      masterlistIds: ids,
      collectorUserId: user.id,
      resend,
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "collection",
      action: "execute_trigger",
      entityType: "masterlist",
      afterData: {
        trigger: "send_payment_reminder",
        resend,
        sent: result.sent,
        skipped: result.skipped,
        accounts: ids.length,
      },
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: formatZodError(error) }, { status: 400 });
    }
    return handleApiError(error);
  }
}
