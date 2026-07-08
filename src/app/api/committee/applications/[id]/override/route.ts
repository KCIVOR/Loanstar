import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { committeeOverrideAmount } from "@/lib/negotiation/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const overrideSchema = z.object({
  amount: z.number().positive(),
  inputMode: z.enum(["NET_SARADO", "NET_LESS_SECURITY", "PRINCIPAL"]),
  terms: z.number().int().positive(),
  addonMonths: z.number().int().min(0).optional(),
  loanTypeId: z.string().uuid().optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("committee", "edit");
    const { id } = await params;
    const body = overrideSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: app } = await supabase
      .from("loan_applications")
      .select("status")
      .eq("id", id)
      .single();

    if (!app || app.status !== "negotiating_terms") {
      return NextResponse.json(
        { error: "Override only available during negotiation" },
        { status: 400 },
      );
    }

    const saved = await committeeOverrideAmount(supabase, id, user.id, body);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "committee",
      action: "execute_trigger",
      entityType: "computation",
      entityId: saved.computation.id,
      afterData: {
        applicationId: id,
        trigger: "committee_override",
        netReleased: saved.computation.netReleased,
      },
    });

    return jsonOk({ computation: saved.computation });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
