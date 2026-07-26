import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { sendSms } from "@/lib/sms/send";

const schema = z.object({
  to: z.string().min(7).max(32),
});

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("system_config", "edit");
    const body = schema.parse(await request.json());

    // Admin-forced test — intentionally bypasses account notification prefs.
    const result = await sendSms({
      to: body.to,
      body: "LoanStar test message",
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "execute_trigger",
      entityType: "sms_test",
      afterData: { to: body.to, result },
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
