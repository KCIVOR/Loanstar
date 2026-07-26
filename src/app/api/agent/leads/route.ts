import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { checklistProgress } from "@/lib/agent/pipeline";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const createLeadSchema = z.object({
  borrowerName: z.string().min(1).max(200),
  businessName: z.string().max(200).optional(),
  borrowerId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
});

type FlagRow = {
  is_required: boolean;
  completion_status: string;
};

async function loadChecklistSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  applicationId: string,
) {
  const { data: flags, error } = await supabase.rpc("get_checklist_flags", {
    p_application_id: applicationId,
  });

  if (error) {
    return { required: 0, complete: 0, percent: null as number | null };
  }

  return checklistProgress(
    ((flags ?? []) as FlagRow[]).map((flag) => ({
      isRequired: Boolean(flag.is_required),
      completionStatus: String(flag.completion_status ?? "pending"),
    })),
  );
}

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

    const leads = await Promise.all(
      (data ?? []).map(async (lead) => {
        const summary = lead.application_id
          ? await loadChecklistSummary(supabase, lead.application_id as string)
          : { required: 0, complete: 0, percent: null as number | null };

        return {
          id: lead.id,
          borrowerName: lead.borrower_name,
          businessName: lead.business_name,
          borrowerId: lead.borrower_id,
          applicationId: lead.application_id,
          status: lead.status,
          createdAt: lead.created_at,
          updatedAt: lead.updated_at,
          checklistRequired: summary.required,
          checklistComplete: summary.complete,
          checklistPercent: summary.percent,
        };
      }),
    );

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

    // If agent linked an existing borrower and no app was provided, attach
    // their latest application when visible (name search never returns app data).
    if (body.borrowerId && !body.applicationId && !lead.application_id) {
      const { data: app } = await supabase
        .from("loan_applications")
        .select("id")
        .eq("borrower_id", body.borrowerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (app?.id) {
        await supabase
          .from("leads")
          .update({ application_id: app.id })
          .eq("id", lead.id);
        lead.application_id = app.id;
      }
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
        borrowerId: lead.borrower_id,
        applicationId: lead.application_id,
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
          checklistRequired: 0,
          checklistComplete: 0,
          checklistPercent: null,
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
