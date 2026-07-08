import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { discloseTerms } from "@/lib/negotiation/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("negotiation", "edit");
    const { id } = await params;
    const supabase = await createClient();

    const { data: app } = await supabase
      .from("loan_applications")
      .select("status")
      .eq("id", id)
      .single();

    if (!app || app.status !== "approved") {
      return NextResponse.json(
        { error: "Application must be approved before disclosure" },
        { status: 400 },
      );
    }

    const negotiation = await discloseTerms(supabase, id, user.id);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "negotiation",
      action: "execute_trigger",
      entityType: "negotiation",
      entityId: negotiation?.id ?? id,
      afterData: { applicationId: id, trigger: "csa_disclose" },
    });

    return jsonOk({ negotiation });
  } catch (error) {
    return handleApiError(error);
  }
}
