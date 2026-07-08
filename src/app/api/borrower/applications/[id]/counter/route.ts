import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { recordCounterOffer } from "@/lib/negotiation/service";
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

const counterSchema = z.object({
  amount: z.number().positive(),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "edit");
    const { id } = await params;
    const body = counterSchema.parse(await request.json());
    const supabase = await createClient();
    const app = await assertOwnApplication(user.id, id);

    const allowedStatuses = [
      "approved",
      "awaiting_confirmation",
      "negotiating_terms",
    ];
    if (!allowedStatuses.includes(app.status)) {
      return NextResponse.json(
        { error: "Counter-offer not available at this stage" },
        { status: 400 },
      );
    }

    const negotiation = await recordCounterOffer(
      supabase,
      id,
      body.amount,
      "borrower",
      user.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "execute_trigger",
      entityType: "negotiation",
      entityId: negotiation?.id ?? id,
      afterData: {
        applicationId: id,
        counterAmount: body.amount,
        trigger: "borrower_counter",
      },
    });

    return jsonOk({ negotiation });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
