import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  createApplicationSchema,
  createCsaApplication,
} from "@/lib/csa/create-application";
import { notifyUser } from "@/lib/notifications/write";
import { ForbiddenError, requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    // Creates the application (intake:create) and links the lead (intake:edit RLS).
    const user = await requireModulePermission("intake", "create");
    const { id: leadId } = await params;
    const body = createApplicationSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, status, application_id, borrower_name, agent_user_id")
      .eq("id", leadId)
      .maybeSingle();

    if (leadError) {
      throw new Error(leadError.message);
    }
    if (!lead) {
      throw new ForbiddenError("Lead not found");
    }
    if (lead.application_id || lead.status !== "open") {
      throw new ForbiddenError("Lead is already linked or not open");
    }

    const created = await createCsaApplication(supabase, user.id, body);

    const { data: updatedLead, error: updateError } = await supabase
      .from("leads")
      .update({
        borrower_id: created.borrowerId,
        application_id: created.applicationId,
        status: "converted",
      })
      .eq("id", leadId)
      .is("application_id", null)
      .eq("status", "open")
      .select("id, status, application_id, borrower_id")
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message);
    }
    if (!updatedLead) {
      throw new ForbiddenError("Lead was converted by another request");
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "update",
      entityType: "lead",
      entityId: leadId,
      afterData: {
        trigger: "csa_lead_convert",
        applicationId: created.applicationId,
        borrowerId: created.borrowerId,
        agentUserId: lead.agent_user_id,
      },
    });

    if (lead.agent_user_id) {
      void notifyUser({
        userId: lead.agent_user_id as string,
        title: "Lead converted to application",
        body: `Your lead for ${lead.borrower_name ?? "a borrower"} was converted to an application.`,
        link: `/agent`,
        kind: "lead_converted",
        entityType: "lead",
        entityId: leadId,
      });
    }

    return jsonOk({
      applicationId: created.applicationId,
      leadId,
      status: "converted",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
