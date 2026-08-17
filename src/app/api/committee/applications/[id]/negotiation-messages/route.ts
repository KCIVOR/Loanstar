import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { postNegotiationMessage } from "@/lib/negotiation/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("committee", "edit");
    const { id } = await params;
    const body = messageSchema.parse(await request.json());
    const supabase = await createClient();

    const negotiationMessage = await postNegotiationMessage(
      supabase,
      id,
      user.id,
      "committee",
      body.body,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "committee",
      action: "create",
      entityType: "negotiation_message",
      entityId: negotiationMessage.id,
      afterData: { applicationId: id },
    });

    return jsonOk({ message: negotiationMessage });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
