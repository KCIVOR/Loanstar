import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { committeeAcceptCounterOffer } from "@/lib/negotiation/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("committee", "edit");
    const { id } = await params;
    const supabase = await createClient();

    const { data: app } = await supabase
      .from("loan_applications")
      .select("status")
      .eq("id", id)
      .single();

    if (!app || app.status !== "negotiating_terms") {
      return NextResponse.json(
        { error: "Nothing to accept — no active borrower counter-offer" },
        { status: 400 },
      );
    }

    const saved = await committeeAcceptCounterOffer(supabase, id, user.id);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "committee",
      action: "execute_trigger",
      entityType: "computation",
      entityId: saved.computation.id,
      afterData: {
        applicationId: id,
        trigger: "committee_accept_counter_offer",
        netReleased: saved.computation.netReleased,
      },
    });

    return jsonOk({ computation: saved.computation });
  } catch (error) {
    return handleApiError(error);
  }
}
