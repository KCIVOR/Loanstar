import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const createLeadSchema = z.object({
  borrowerName: z.string().min(1).max(200),
  businessName: z.string().max(200).optional(),
  borrowerId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
});

export async function GET() {
  try {
    const user = await requireModulePermission("leads", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, borrower_name, business_name, borrower_id, application_id, status, created_at, updated_at",
      )
      .eq("agent_user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const leads = (data ?? []).map((lead) => ({
      id: lead.id,
      borrowerName: lead.borrower_name,
      businessName: lead.business_name,
      borrowerId: lead.borrower_id,
      applicationId: lead.application_id,
      status: lead.status,
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
    }));

    return jsonOk({ leads });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("leads", "create");
    const body = createLeadSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        agent_user_id: user.id,
        borrower_name: body.borrowerName,
        business_name: body.businessName ?? null,
        borrower_id: body.borrowerId ?? null,
        application_id: body.applicationId ?? null,
        status: "open",
      })
      .select(
        "id, borrower_name, business_name, borrower_id, application_id, status, created_at",
      )
      .single();

    if (error || !lead) {
      throw new Error(error?.message ?? "Failed to create lead");
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "leads",
      action: "create",
      entityType: "lead",
      entityId: lead.id,
      afterData: {
        borrowerName: body.borrowerName,
        businessName: body.businessName ?? null,
      },
    });

    return jsonOk(
      {
        lead: {
          id: lead.id,
          borrowerName: lead.borrower_name,
          businessName: lead.business_name,
          borrowerId: lead.borrower_id,
          applicationId: lead.application_id,
          status: lead.status,
          createdAt: lead.created_at,
        },
      },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
