import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { isCommitteeDecisionSlug } from "@/lib/email/decision-templates";
import { sendEmail } from "@/lib/email/send";
import { requireModulePermission } from "@/lib/permissions/server";

const TEST_EMAIL_SLUGS = ["test", "application_denied", "application_approved"] as const;

const testEmailSchema = z.object({
  to: z.string().email(),
  templateSlug: z.enum(TEST_EMAIL_SLUGS).default("test"),
});

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("system_config", "execute_trigger");
    const body = testEmailSchema.parse(await request.json());

    const variables = isCommitteeDecisionSlug(body.templateSlug)
      ? { borrower_name: "Test Borrower" }
      : undefined;

    const result = await sendEmail({
      to: body.to,
      templateSlug: body.templateSlug,
      variables,
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "execute_trigger",
      entityType: "email",
      entityId: result.id,
      afterData: { to: result.to, subject: result.subject },
    });

    return jsonOk({ success: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
