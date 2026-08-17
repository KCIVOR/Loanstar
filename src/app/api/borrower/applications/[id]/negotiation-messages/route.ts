import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { postNegotiationMessage } from "@/lib/negotiation/service";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

async function assertOwnApplication(userId: string, applicationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loan_applications")
    .select("id, status, borrowers!inner ( user_id )")
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Application not found");
  }

  const borrowersRaw = data.borrowers;
  const borrower = Array.isArray(borrowersRaw) ? borrowersRaw[0] : borrowersRaw;

  if (borrower?.user_id !== userId) {
    throw new ForbiddenError("Application not found");
  }

  return data;
}

const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "edit");
    const { id } = await params;
    const body = messageSchema.parse(await request.json());
    const supabase = await createClient();
    const app = await assertOwnApplication(user.id, id);

    const allowedStatuses = [
      "approved",
      "awaiting_confirmation",
      "negotiating_terms",
    ];
    if (!allowedStatuses.includes(app.status)) {
      return NextResponse.json(
        { error: "Negotiation log is only available during active negotiation" },
        { status: 400 },
      );
    }

    const negotiationMessage = await postNegotiationMessage(
      supabase,
      id,
      user.id,
      "borrower",
      body.body,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
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
